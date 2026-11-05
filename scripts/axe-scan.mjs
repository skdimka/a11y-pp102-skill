import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { WCAG_TO_PP, PP102, parseArgs, collectUrls, output, outputJson, cell, ppLabel } from './lib.mjs';

const RULE_TO_PP = {
  label: ['м', 'а'],
  'select-name': ['м', 'а'],
  'autocomplete-valid': ['м'],
  'form-field-multiple-labels': ['м'],
  'label-title-only': ['м'],
  'link-name': ['ж', 'а'],
  'document-title': ['е'],
  'page-has-heading-one': ['е'],
  'image-alt': ['г'],
  'input-image-alt': ['г'],
  'svg-img-alt': ['г'],
  'role-img-alt': ['г'],
  'object-alt': ['г'],
  'video-caption': ['г'],
  'color-contrast': ['з'],
  'meta-viewport': ['б'],
  'meta-refresh': ['к'],
  blink: ['к'],
  marquee: ['к'],
};

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const IMPACT_RU = { critical: 'критично', serious: 'серьёзно', moderate: 'умеренно', minor: 'незначительно' };

function wcagFromTags(tags) {
  return tags
    .filter((t) => /^wcag\d{3,}$/.test(t))
    .map((t) => {
      const digits = t.slice(4);
      return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
    });
}

function ppFromWcag(criteria) {
  const letters = new Set();
  for (const c of criteria) for (const l of WCAG_TO_PP[c] ?? []) letters.add(l);
  return [...letters].sort((a, b) => Object.keys(PP102).indexOf(a) - Object.keys(PP102).indexOf(b));
}

async function scan(browser, url, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'ru-RU' });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const isWcag = (v) => v.tags.some((t) => /^wcag\d/.test(t));
    const meta = await page.evaluate(() => ({
      title: document.title.trim(),
      h1: [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length).length,
      lang: document.documentElement.getAttribute('lang') || '',
      cyrillicShare: (() => {
        const text = document.body?.innerText ?? '';
        const letters = text.match(/\p{L}/gu) ?? [];
        const cyr = text.match(/\p{Script=Cyrillic}/gu) ?? [];
        return letters.length ? cyr.length / letters.length : 0;
      })(),
    }));
    return {
      url,
      ...meta,
      violations: result.violations.filter(isWcag),
      practice: result.violations.filter((v) => !isWcag(v)),
      incomplete: result.incomplete.filter(isWcag),
    };
  } catch (error) {
    return { url, error: error.message };
  } finally {
    await context.close();
  }
}

function render(results) {
  const lines = ['# axe-core: нарушения по подпунктам ПП № 102', ''];
  lines.push('Автоматическая проверка находит только часть проблем. Каждую строку проверьте вручную.', '');
  const byPp = new Map();
  let total = 0;

  for (const r of results) {
    if (r.error) continue;
    for (const v of r.violations) {
      const criteria = wcagFromTags(v.tags);
      const letters = [...new Set([...(RULE_TO_PP[v.id] ?? []), ...ppFromWcag(criteria)])];
      const key = letters.length ? letters[0] : '—';
      if (!byPp.has(key)) byPp.set(key, []);
      byPp.get(key).push({ url: r.url, v, criteria, letters });
      total += v.nodes.length;
    }
  }

  lines.push(`Страниц: ${results.length}. Элементов с нарушениями: ${total}.`, '');

  const errors = results.filter((r) => r.error);
  if (errors.length) {
    lines.push('## Не удалось проверить', '');
    for (const e of errors) lines.push(`- ${e.url} — ${cell(e.error)}`);
    lines.push('');
  }

  const order = [...Object.keys(PP102), '—'];
  for (const key of order) {
    const items = byPp.get(key);
    if (!items) continue;
    const title = key === '—' ? 'Без прямой привязки к подпункту' : `«${key}» ${PP102[key]}`;
    lines.push(`## ${title}`, '');
    lines.push('| Страница | Правило | ПП 102 | WCAG | Важность | Элементов | Пример элемента | Что не так |');
    lines.push('|---|---|---|---|---|---|---|---|');
    items.sort((a, b) => (IMPACT_ORDER[a.v.impact] ?? 9) - (IMPACT_ORDER[b.v.impact] ?? 9));
    for (const { url, v, criteria, letters } of items) {
      const target = v.nodes[0]?.target?.join(' ') ?? '';
      lines.push(
        `| ${cell(url)} | [${cell(v.id)}](${v.helpUrl}) | ${ppLabel(letters)} | ${criteria.join(', ') || '—'} | ${IMPACT_RU[v.impact] ?? v.impact ?? '—'} | ${v.nodes.length} | \`${cell(target)}\` | ${cell(v.help)} |`,
      );
    }
    lines.push('');
  }

  const practice = results.flatMap((r) => (r.practice ?? []).map((v) => ({ url: r.url, v })));
  if (practice.length) {
    lines.push('## Рекомендации best-practice (не критерии WCAG, но влияют на «а» и «е»)', '');
    lines.push('| Страница | Правило | Элементов | Пример элемента | Что не так |');
    lines.push('|---|---|---|---|---|');
    for (const { url, v } of practice) {
      lines.push(`| ${cell(url)} | [${cell(v.id)}](${v.helpUrl}) | ${v.nodes.length} | \`${cell(v.nodes[0]?.target?.join(' ') ?? '')}\` | ${cell(v.help)} |`);
    }
    lines.push('');
  }

  const ok = results.filter((r) => !r.error);
  const byTitle = new Map();
  for (const r of ok) {
    const key = r.title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(r.url);
  }
  const titleIssues = [];
  for (const r of ok) {
    const problems = [];
    if (!r.title) problems.push('пустой <title>');
    else if (byTitle.get(r.title.toLowerCase()).length > 1) problems.push(`<title> повторяется на ${byTitle.get(r.title.toLowerCase()).length} стр.`);
    if (r.h1 === 0) problems.push('нет видимого h1');
    if (r.h1 > 1) problems.push(`видимых h1: ${r.h1}`);
    if (!r.lang) problems.push('нет lang у <html>');
    else if (r.cyrillicShare > 0.6 && !/^ru\b/i.test(r.lang)) problems.push(`lang="${r.lang}", а текст страницы на русском — скринридер прочитает его с неверным произношением`);
    else if (r.cyrillicShare < 0.2 && /^ru\b/i.test(r.lang) && r.cyrillicShare > 0) problems.push(`lang="${r.lang}", но текст страницы почти не на русском`);
    if (problems.length) titleIssues.push({ r, problems });
  }
  if (titleIssues.length) {
    lines.push('## Заголовки страниц — ПП № 102, «е»', '');
    lines.push('| Страница | <title> | Проблемы |', '|---|---|---|');
    for (const { r, problems } of titleIssues) lines.push(`| ${cell(r.url)} | ${cell(r.title)} | ${cell(problems.join('; '))} |`);
    lines.push('');
  }

  const incomplete = results.flatMap((r) => (r.incomplete ?? []).map((i) => ({ url: r.url, i })));
  if (incomplete.length) {
    lines.push('## Требует ручной проверки', '');
    lines.push('| Страница | Правило | WCAG | Элементов | Что проверить |');
    lines.push('|---|---|---|---|---|');
    for (const { url, i } of incomplete) {
      lines.push(`| ${cell(url)} | ${cell(i.id)} | ${wcagFromTags(i.tags).join(', ') || '—'} | ${i.nodes.length} | ${cell(i.help)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const urls = await collectUrls(args);
const width = Number(args.width ?? 1280);
const height = Number(args.height ?? 800);
const browser = await chromium.launch();
const results = [];
for (const url of urls) {
  console.error(`axe: ${url}`);
  results.push(await scan(browser, url, width, height));
}
await browser.close();
await outputJson(args, results.map(({ violations, practice, incomplete, ...rest }) => ({ ...rest, violations: (violations ?? []).map((v) => ({ id: v.id, nodes: v.nodes.length })), practice: (practice ?? []).map((v) => ({ id: v.id, nodes: v.nodes.length })) })));
await output(args, render(results));
