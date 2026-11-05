import { chromium } from 'playwright';
import { parseArgs, collectUrls, output, cell } from './lib.mjs';

const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider', 'spinbutton', 'searchbox', 'listbox']);

function snapshotFocused(state) {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;

  if (!window.__a11yKeys) window.__a11yKeys = new WeakMap();
  if (!window.__a11yNext) window.__a11yNext = 1;
  if (!window.__a11yKeys.has(el)) window.__a11yKeys.set(el, window.__a11yNext++);
  const key = window.__a11yKeys.get(el);

  const describe = (node) => {
    const parts = [];
    while (node && node.nodeType === 1 && parts.length < 3) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const classes = [...node.classList].slice(0, 2);
      if (classes.length) part += `.${classes.join('.')}`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const visual = (style) => {
    const outline = style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0
      ? 'none'
      : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`;
    const borders = ['Top', 'Right', 'Bottom', 'Left']
      .map((side) => (parseFloat(style[`border${side}Width`]) === 0 || style[`border${side}Style`] === 'none'
        ? '0'
        : `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`))
      .join(',');
    return [outline, style.boxShadow, borders, style.backgroundColor, style.color, style.textDecorationLine, style.transform, style.opacity].join('|');
  };
  const signature = (target) => {
    const parts = [];
    let node = target;
    for (let depth = 0; node && depth < 3; depth++) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(node, pseudo);
        if (pseudo && style.content === 'none') continue;
        parts.push(visual(style));
      }
      node = node.parentElement;
    }
    return parts.join('#');
  };

  let hiddenReason = '';
  let rect = el.getBoundingClientRect();
  if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    rect = el.getBoundingClientRect();
  }
  if (rect.width < 2 || rect.height < 2) hiddenReason = 'нулевой размер';
  else if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) hiddenReason = 'за пределами экрана';
  let node = el;
  while (node && node.nodeType === 1 && !hiddenReason) {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden') hiddenReason = 'visibility: hidden';
    else if (Number(style.opacity) === 0) hiddenReason = `opacity: 0 у ${describe(node)}`;
    else if (node.getAttribute('aria-hidden') === 'true') hiddenReason = `внутри aria-hidden="true" (${describe(node)})`;
    node = node.parentElement;
  }

  let placeholderOnly = false;
  if (el.matches('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea')) {
    const labelled = el.labels?.length || el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby') || el.getAttribute('title')?.trim();
    placeholderOnly = !labelled && Boolean(el.getAttribute('placeholder'));
  }

  let focusVisible = null;
  if (state.checkFocus) {
    const focused = signature(el);
    el.blur();
    const blurred = signature(el);
    el.focus();
    focusVisible = focused !== blurred;
  }

  return {
    key,
    selector: describe(el),
    tag: el.tagName.toLowerCase(),
    text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    top: Math.round(rect.top + scrollY),
    left: Math.round(rect.left + scrollX),
    hiddenReason,
    focusVisible,
    placeholderOnly,
  };
}

function scanPage() {
  const describe = (node) => {
    const parts = [];
    while (node && node.nodeType === 1 && parts.length < 3) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const classes = [...node.classList].slice(0, 2);
      if (classes.length) part += `.${classes.join('.')}`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const interactive = 'a[href], button, input, select, textarea, summary, label, [tabindex], [contenteditable="true"]';

  const clickable = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.matches(interactive) || el.closest(interactive) || el.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')) continue;
    const style = getComputedStyle(el);
    const pointer = style.cursor === 'pointer' && getComputedStyle(el.parentElement ?? el).cursor !== 'pointer';
    if (!el.hasAttribute('onclick') && !pointer) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    clickable.push({ selector: describe(el), text: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 60) });
  }

  const generic = /^(подробнее|читать далее|читать|далее|ещё|еще|здесь|тут|ссылка|скачать|перейти|узнать больше|смотреть|смотреть все|more|read more|click here|here|link)\.?$/i;
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({
    el: a,
    name: (a.getAttribute('aria-label') || a.innerText || a.querySelector('img')?.alt || '').trim().replace(/\s+/g, ' '),
    href: a.href,
    raw: a.getAttribute('href'),
  }));
  const linkIssues = [];
  for (const l of links) {
    if (generic.test(l.name) && !l.el.getAttribute('aria-describedby')) linkIssues.push({ problem: 'Текст ссылки без контекста', selector: describe(l.el), name: l.name, href: l.raw });
    if (l.raw === '#' || l.raw?.startsWith('javascript:')) linkIssues.push({ problem: 'Ссылка-заглушка', selector: describe(l.el), name: l.name, href: l.raw });
    if (/^(https?:\/\/|www\.)/i.test(l.name)) linkIssues.push({ problem: 'Адрес вместо текста ссылки', selector: describe(l.el), name: l.name, href: l.raw });
  }
  const byName = new Map();
  for (const l of links) {
    if (!l.name) continue;
    const key = l.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key).add(l.href.split('#')[0]);
  }
  for (const [name, hrefs] of byName) {
    if (hrefs.size > 1) linkIssues.push({ problem: `Одинаковый текст, разные адреса (${hrefs.size})`, selector: '', name, href: [...hrefs].slice(0, 3).join(' ') });
  }

  return { clickable: clickable.slice(0, 30), linkIssues: linkIssues.slice(0, 50) };
}

function parseAria(snapshot) {
  const first = (snapshot || '').split('\n')[0].replace(/^\s*-\s*/, '');
  const match = first.match(/^([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/i);
  if (!match) return { role: '', name: '' };
  return { role: match[1], name: match[2] ?? '' };
}

async function walk(browser, url, maxSteps, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'ru-RU' });
  const page = await context.newPage();
  const steps = [];
  let extra = { clickable: [], linkIssues: [] };
  let stopReason = `достигнут лимит ${maxSteps} шагов`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    extra = await page.evaluate(scanPage);
    let repeat = 0;
    for (let i = 0; i < maxSteps; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(60);
      if (page.url() !== url && !page.url().startsWith(url.split('#')[0])) {
        stopReason = `Tab увёл на другую страницу: ${page.url()}`;
        break;
      }
      const info = await page.evaluate(snapshotFocused, { checkFocus: true });
      if (!info) {
        if (steps.length) {
          stopReason = 'фокус вернулся к началу страницы';
          break;
        }
        continue;
      }
      let aria = { role: '', name: '' };
      try {
        aria = parseAria(await page.locator(':focus').first().ariaSnapshot({ timeout: 1000 }));
      } catch {}
      const prev = steps.at(-1);
      if (prev && prev.key === info.key && info.tag === 'iframe') {
        stopReason = `фокус ушёл внутрь iframe (${info.selector}); дальше обход проверьте вручную`;
        break;
      }
      if (prev && prev.key === info.key) {
        repeat++;
        if (repeat >= 3) {
          stopReason = `фокус застрял на ${info.selector} — возможна ловушка фокуса`;
          break;
        }
        continue;
      }
      repeat = 0;
      if (steps.length > 1 && steps[0].key === info.key) {
        stopReason = 'полный круг по странице';
        break;
      }
      steps.push({ ...info, ...aria });
    }
  } catch (error) {
    stopReason = `ошибка: ${error.message}`;
  } finally {
    await context.close();
  }
  return { url, steps, stopReason, ...extra };
}

function render(results) {
  const lines = ['# Клавиатура и ссылки — ПП № 102, «а», «ж», «м»', ''];
  lines.push('Эвристика: «фокус не виден» — стили элемента, его псевдоэлементов и двух родителей не меняются при фокусе. Имя и роль — из дерева доступности браузера.', '');

  for (const r of results) {
    const noFocus = r.steps.filter((s) => s.focusVisible === false && !s.hiddenReason);
    const hidden = r.steps.filter((s) => s.hiddenReason);
    const noName = r.steps.filter((s) => NAMED_ROLES.has(s.role) && !s.name.trim());
    const jumps = [];
    for (let i = 1; i < r.steps.length; i++) {
      const a = r.steps[i - 1];
      const b = r.steps[i];
      if (b.top < a.top - 400) jumps.push({ from: a, to: b });
    }

    lines.push(`## ${r.url}`, '');
    lines.push(`Шагов: ${r.steps.length}. Остановка: ${r.stopReason}.`, '');
    lines.push(`- Фокус не виден: ${noFocus.length}`);
    lines.push(`- Фокус на невидимом элементе: ${hidden.length}`);
    lines.push(`- Нет доступного имени: ${noName.length}`);
    const placeholderOnly = r.steps.filter((s) => s.placeholderOnly);
    lines.push(`- Подпись поля только в placeholder («м»): ${placeholderOnly.length}`);
    lines.push(`- Кликабельные элементы без доступа с клавиатуры: ${r.clickable.length}`);
    lines.push(`- Проблемы ссылок («ж»): ${r.linkIssues.length}`);
    lines.push(`- Скачки фокуса вверх по странице (порядок может не совпадать с визуальным): ${jumps.length}`, '');

    const issues = [
      ...noFocus.map((s) => ['Фокус не виден', s]),
      ...hidden.map((s) => [`Фокус на невидимом: ${s.hiddenReason}`, s]),
      ...noName.map((s) => ['Нет доступного имени', s]),
      ...placeholderOnly.map((s) => ['Подпись только в placeholder', s]),
    ];
    if (issues.length) {
      lines.push('| Проблема | Элемент | Роль | Имя | Текст |', '|---|---|---|---|---|');
      for (const [problem, s] of issues) {
        lines.push(`| ${cell(problem)} | \`${cell(s.selector)}\` | ${cell(s.role)} | ${cell(s.name)} | ${cell(s.text)} |`);
      }
      lines.push('');
    }
    if (r.clickable.length) {
      lines.push('Кликабельные элементы, которых нет в порядке Tab (onclick или cursor: pointer):', '', '| Элемент | Текст |', '|---|---|');
      for (const c of r.clickable) lines.push(`| \`${cell(c.selector)}\` | ${cell(c.text)} |`);
      lines.push('');
    }
    if (r.linkIssues.length) {
      lines.push('Ссылки:', '', '| Проблема | Элемент | Текст | href |', '|---|---|---|---|');
      for (const l of r.linkIssues) lines.push(`| ${cell(l.problem)} | ${l.selector ? `\`${cell(l.selector)}\`` : ''} | ${cell(l.name)} | ${cell(l.href)} |`);
      lines.push('');
    }
    if (jumps.length) {
      lines.push('Скачки фокуса:', '', '| Из | В |', '|---|---|');
      for (const j of jumps) lines.push(`| \`${cell(j.from.selector)}\` (y=${j.from.top}) | \`${cell(j.to.selector)}\` (y=${j.to.top}) |`);
      lines.push('');
    }

    lines.push('<details><summary>Порядок фокуса</summary>', '');
    lines.push('| # | Роль | Имя | Элемент | Фокус виден |', '|---|---|---|---|---|');
    r.steps.forEach((s, i) => {
      lines.push(`| ${i + 1} | ${cell(s.role)} | ${cell(s.name)} | \`${cell(s.selector)}\` | ${s.focusVisible ? 'да' : 'нет'} |`);
    });
    lines.push('', '</details>', '');
  }
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const urls = await collectUrls(args);
const maxSteps = Number(args.max ?? 300);
const width = Number(args.width ?? 1280);
const height = Number(args.height ?? 800);
const browser = await chromium.launch();
const results = [];
for (const url of urls) {
  console.error(`keyboard: ${url}`);
  results.push(await walk(browser, url, maxSteps, width, height));
}
await browser.close();
await output(args, render(results));
