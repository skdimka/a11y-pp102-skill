import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'reports', 'selftest');
mkdirSync(out, { recursive: true });

const run = (script, name) => {
  execFileSync(process.execPath, [join(here, script), '--urls', join(here, 'fixtures/urls.txt'), '--out', join(out, `${name}.md`), '--json', join(out, `${name}.json`)], { stdio: ['ignore', 'ignore', 'inherit'] });
  return JSON.parse(readFileSync(join(out, `${name}.json`), 'utf8'));
};

const axe = run('axe-scan.mjs', 'axe');
const reflow = run('reflow-200.mjs', 'reflow');
const keyboard = run('keyboard-walk.mjs', 'keyboard');

const pick = (list) => ({ bad: list.find((r) => r.url.endsWith('bad.html')), good: list.find((r) => r.url.endsWith('good.html')) });
const a = pick(axe);
const f = pick(reflow);
const k = pick(keyboard);

const checks = [];
const expect = (name, ok) => checks.push({ name, ok: Boolean(ok) });
const has = (r, id) => r.violations.some((v) => v.id === id);
const named = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio']);
const kb = (r) => ({
  noFocus: r.steps.filter((s) => s.focusVisible === false && !s.hiddenReason).length,
  hidden: r.steps.filter((s) => s.hiddenReason).length,
  noName: r.steps.filter((s) => named.has(s.role) && !s.name.trim()).length,
  placeholder: r.steps.filter((s) => s.placeholderOnly).length,
  clickable: r.clickable.length,
  links: r.linkIssues.length,
  skip: r.steps[0]?.name ?? '',
});

for (const id of ['image-alt', 'button-name', 'color-contrast', 'meta-viewport']) expect(`bad: axe находит ${id}`, has(a.bad, id));
expect('bad: lang="en" при русском тексте', a.bad.lang === 'en' && a.bad.cyrillicShare > 0.6);
expect('bad: нет видимого h1', a.bad.h1 === 0);
expect('bad: 200% — запрет масштабирования во viewport', f.bad.viewportIssues.length > 0);
expect('bad: 200% — горизонтальная прокрутка', f.bad.scrollWidth > f.bad.viewportWidth + 1);
expect('bad: 200% — обрезанный текст', f.bad.clipped.length > 0);
expect('bad: 200% — перекрывающий слой', f.bad.overlays.length > 0);
const kbad = kb(k.bad);
expect('bad: Tab — фокус не виден', kbad.noFocus > 0);
expect('bad: Tab — фокус на невидимом', kbad.hidden > 0);
expect('bad: Tab — нет доступного имени', kbad.noName > 0);
expect('bad: Tab — подпись только в placeholder', kbad.placeholder > 0);
expect('bad: Tab — кликабельный div вне Tab', kbad.clickable > 0);
expect('bad: Tab — ссылки без контекста и заглушки', kbad.links > 0);

expect('good: axe без нарушений WCAG', a.good.violations.length === 0);
expect('good: lang и h1 в порядке', a.good.lang === 'ru' && a.good.h1 === 1);
expect('good: 200% без проблем', f.good.viewportIssues.length + f.good.overflowing.length + f.good.clipped.length + f.good.overlays.length === 0 && f.good.scrollWidth <= f.good.viewportWidth + 1);
const kgood = kb(k.good);
expect('good: Tab без проблем (включая блок с анимацией появления)', kgood.noFocus + kgood.hidden + kgood.noName + kgood.placeholder + kgood.clickable + kgood.links === 0);
expect('good: первым фокусируется skip-link', /основному содержимому/.test(kgood.skip));
expect('good: обход дошёл до ссылок в блоке с анимацией', k.good.steps.some((s) => /Стоимость услуг/.test(s.name)));

for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} проверок пройдено`);
process.exit(failed ? 1 : 0);
