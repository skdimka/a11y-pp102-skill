import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, collectUrls, output, cell } from './lib.mjs';

function inspect() {
  const vw = document.documentElement.clientWidth;

  const describe = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 3) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${node.id}`;
        parts.unshift(part);
        break;
      }
      const classes = [...node.classList].slice(0, 2);
      if (classes.length) part += `.${classes.join('.')}`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  };

  const clippedByAncestor = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== 'visible') {
        const rect = node.getBoundingClientRect();
        if (rect.right <= vw + 1 && rect.left >= -1) return true;
      }
      if (style.position === 'fixed' && node.getBoundingClientRect().right <= vw + 1) return true;
      node = node.parentElement;
    }
    return false;
  };

  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);

  const meta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  const viewportIssues = [];
  if (/user-scalable\s*=\s*(no|0)/i.test(meta)) viewportIssues.push('user-scalable=no');
  const max = meta.match(/maximum-scale\s*=\s*([\d.]+)/i);
  if (max && Number(max[1]) < 2) viewportIssues.push(`maximum-scale=${max[1]}`);

  const overflowing = [];
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.right <= vw + 1 && rect.left >= -1) continue;
    if (clippedByAncestor(el)) continue;
    let parent = el.parentElement;
    let nested = false;
    while (parent) {
      if (seen.has(parent)) {
        nested = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (nested) continue;
    seen.add(el);
    overflowing.push({
      selector: describe(el),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    });
  }

  const textRects = (root) => {
    const rects = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const range = document.createRange();
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent || !isVisible(parent)) continue;
      if (parent.closest('.visually-hidden, .sr-only, [class*="visually-hidden"]')) continue;
      range.selectNodeContents(walker.currentNode);
      for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) rects.push({ r, text: walker.currentNode.textContent.trim() });
    }
    return rects;
  };

  const carousel = '[data-swiper], .swiper, .swiper-initialized, .slick-slider, .splide, [aria-roledescription="carousel"]';
  const clipped = [];
  const truncated = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!isVisible(el)) continue;
    const style = getComputedStyle(el);
    const hidesY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    const hidesX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const lineClamp = style.webkitLineClamp && style.webkitLineClamp !== 'none';
    const ellipsis = style.textOverflow === 'ellipsis';
    const overflows = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
    if (!overflows) continue;
    if ((lineClamp || ellipsis) && hasOwnText(el)) {
      truncated.push({ selector: describe(el), reason: lineClamp ? 'line-clamp' : 'text-overflow: ellipsis', text: el.innerText.trim().slice(0, 80) });
      continue;
    }
    if (!(hidesX || hidesY)) continue;
    if (el.matches(carousel) || el.closest(carousel)) continue;
    const box = el.getBoundingClientRect();
    const cut = textRects(el).filter(({ r }) => (hidesY && (r.bottom > box.bottom + 1 || r.top < box.top - 1)) || (hidesX && (r.right > box.right + 1 || r.left < box.left - 1)));
    if (!cut.length) continue;
    if (cut.every(({ r }) => r.left >= box.right || r.top >= box.bottom || r.right <= box.left || r.bottom <= box.top)) continue;
    clipped.push({
      selector: describe(el),
      reason: [hidesY && cut.some(({ r }) => r.bottom > box.bottom + 1) && 'по высоте', hidesX && cut.some(({ r }) => r.right > box.right + 1) && 'по ширине'].filter(Boolean).join(', ') || 'частично',
      text: cut.map((c) => c.text).join(' ').slice(0, 80),
    });
  }

  return {
    viewportWidth: vw,
    scrollWidth: document.documentElement.scrollWidth,
    viewportIssues,
    overflowing: overflowing.slice(0, 30),
    clipped: clipped.slice(0, 30),
    truncated: truncated.slice(0, 30),
  };
}

const args = parseArgs(process.argv.slice(2));
const urls = await collectUrls(args);
const baseWidth = Number(args.width ?? 1280);
const baseHeight = Number(args.height ?? 800);
const zoom = Number(args.zoom ?? 2);
const width = Math.round(baseWidth / zoom);
const height = Math.round(baseHeight / zoom);
const shots = typeof args.screenshots === 'string' ? args.screenshots : null;
if (shots) await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: zoom, locale: 'ru-RU' });
const results = [];

for (const [index, url] of urls.entries()) {
  console.error(`reflow ${zoom * 100}%: ${url}`);
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(500);
    const data = await page.evaluate(inspect);
    if (shots) {
      const file = join(shots, `${String(index + 1).padStart(3, '0')}.png`);
      await page.screenshot({ path: file, fullPage: true });
      data.screenshot = file;
    }
    results.push({ url, ...data });
  } catch (error) {
    results.push({ url, error: error.message });
  } finally {
    await page.close();
  }
}
await browser.close();

const lines = [`# Масштаб ${zoom * 100}% (окно ${baseWidth}×${baseHeight} → ${width}×${height} CSS px) — ПП № 102, «б»`, ''];
lines.push('Эвристика: намеренно прокручиваемые таблицы, карты и слайдеры могут попасть в список — проверьте глазами.', '');
lines.push('| Страница | Горизонтальная прокрутка | Viewport | За краем экрана | Обрезанный текст | Усечённый текст |');
lines.push('|---|---|---|---|---|---|');
for (const r of results) {
  if (r.error) {
    lines.push(`| ${cell(r.url)} | ошибка: ${cell(r.error)} | | | | |`);
    continue;
  }
  const scroll = r.scrollWidth > r.viewportWidth + 1 ? `да, +${r.scrollWidth - r.viewportWidth}px` : 'нет';
  lines.push(`| ${cell(r.url)} | ${scroll} | ${r.viewportIssues.join(', ') || 'ок'} | ${r.overflowing.length} | ${r.clipped.length} | ${r.truncated.length} |`);
}
lines.push('');
lines.push('«Усечённый текст» — намеренное сокращение (line-clamp, многоточие). Это допустимо, если полный текст доступен (на детальной странице, по кнопке «Показать полностью», в title не считается).', '');

for (const r of results) {
  if (r.error || (!r.overflowing.length && !r.clipped.length && !r.truncated.length && !r.viewportIssues.length && r.scrollWidth <= r.viewportWidth + 1)) continue;
  lines.push(`## ${r.url}`, '');
  if (r.screenshot) lines.push(`Скриншот: \`${r.screenshot}\``, '');
  if (r.viewportIssues.length) lines.push(`- Масштабирование ограничено в \`<meta name="viewport">\`: ${r.viewportIssues.join(', ')}`, '');
  if (r.overflowing.length) {
    lines.push('Элементы за краем экрана:', '', '| Элемент | left | right | width |', '|---|---|---|---|');
    for (const o of r.overflowing) lines.push(`| \`${cell(o.selector)}\` | ${o.left} | ${o.right} | ${o.width} |`);
    lines.push('');
  }
  if (r.clipped.length) {
    lines.push('Обрезанный текст:', '', '| Элемент | Как обрезан | Обрезанный фрагмент |', '|---|---|---|');
    for (const c of r.clipped) lines.push(`| \`${cell(c.selector)}\` | ${c.reason} | ${cell(c.text)} |`);
    lines.push('');
  }
  if (r.truncated.length) {
    lines.push('Усечённый текст:', '', '| Элемент | Как | Текст |', '|---|---|---|');
    for (const c of r.truncated) lines.push(`| \`${cell(c.selector)}\` | ${c.reason} | ${cell(c.text)} |`);
    lines.push('');
  }
}

await output(args, lines.join('\n'));
