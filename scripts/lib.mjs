import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PP102 = {
  а: 'Клавиатура и вспомогательные технологии',
  б: 'Масштабирование до 200%',
  в: 'Документы',
  г: 'Нетекстовая информация',
  д: 'Капча',
  е: 'Заголовки страниц',
  ж: 'Назначение ссылок',
  з: 'Контраст',
  и: 'Не только цвет',
  к: 'Движение и автообновление',
  л: 'Наведение не меняет контекст',
  м: 'Формы',
  н: 'Шрифт',
};

export const WCAG_TO_PP = {
  '1.1.1': ['г'],
  '1.2.1': ['г'],
  '1.2.2': ['г'],
  '1.2.3': ['г'],
  '1.3.1': ['а', 'м'],
  '1.3.2': ['а'],
  '1.3.3': ['и'],
  '1.3.5': ['м'],
  '1.4.1': ['и'],
  '1.4.2': ['к'],
  '1.4.3': ['з'],
  '1.4.4': ['б'],
  '1.4.10': ['б'],
  '1.4.11': ['з'],
  '1.4.12': ['н'],
  '1.4.13': ['л'],
  '2.1.1': ['а'],
  '2.1.2': ['а'],
  '2.2.1': ['к'],
  '2.2.2': ['к'],
  '2.3.1': ['к'],
  '2.4.1': ['а'],
  '2.4.2': ['е'],
  '2.4.3': ['а'],
  '2.4.4': ['ж'],
  '2.4.6': ['е'],
  '2.4.7': ['а'],
  '2.5.3': ['ж'],
  '3.1.1': ['а'],
  '3.1.2': ['а'],
  '3.2.1': ['л'],
  '3.2.2': ['л'],
  '3.3.1': ['м'],
  '3.3.2': ['м'],
  '4.1.2': ['а'],
  '4.1.3': ['и'],
};

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[name] = true;
    } else {
      args[name] = next;
      i++;
    }
  }
  return args;
}

export function toUrl(value) {
  if (/^(https?|file):\/\//i.test(value)) return value;
  return pathToFileURL(resolve(value)).href;
}

export async function collectUrls(args) {
  const urls = [];
  if (typeof args.url === 'string') urls.push(args.url);
  if (typeof args.urls === 'string') {
    const text = await readFile(args.urls, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) urls.push(trimmed);
    }
  }
  if (!urls.length) {
    throw new Error('Укажите --url <адрес> или --urls <файл со списком адресов>');
  }
  return urls.map(toUrl);
}

export async function output(args, text) {
  if (typeof args.out === 'string') {
    await mkdir(dirname(resolve(args.out)), { recursive: true });
    await writeFile(args.out, text, 'utf8');
    console.log(`Отчёт: ${resolve(args.out)}`);
  } else {
    console.log(text);
  }
}

export function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export function ppLabel(letters) {
  if (!letters.length) return '—';
  return letters.map((l) => `«${l}»`).join(', ');
}
