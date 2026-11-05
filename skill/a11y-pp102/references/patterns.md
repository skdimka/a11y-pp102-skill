# Паттерны исправлений по компонентам

Примеры — на чистом HTML/CSS/JS, чтобы переносились на любой стек. В скобках — подпункт п. 2 ПП № 102.

## Каркас страницы

```html
<html lang="ru">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Приём документов — Название организации</title>
</head>
<body>
  <a class="skip-link" href="#main">Перейти к основному содержимому</a>
  <header>…</header>
  <main id="main" tabindex="-1">
    <h1>Приём документов</h1>
    …
  </main>
  <footer>…</footer>
</body>
</html>
```

- `lang` у `<html>` и у фрагментов на другом языке (`<span lang="en">`) — скринридер переключает произношение («а»).
- В viewport нет `user-scalable=no` и `maximum-scale` («б»).
- `<title>` уникален и начинается с сути страницы («е»).
- Ссылка пропуска навигации — первый фокусируемый элемент, видна при фокусе («а»):

```css
.skip-link { position: absolute; left: 1rem; top: -100%; }
.skip-link:focus { top: 1rem; }
```

## Видимый фокус («а»)

```css
:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
```

- Не убирать `outline` без замены. `box-shadow` в роли фокуса пропадает в режиме высокой контрастности Windows — `outline` надёжнее.
- Цвет фокуса — токен, который переопределяется для тёмных фонов и тем версии для слабовидящих. Контраст фокуса к фону — от 3:1.
- Растянутая на всю карточку ссылка (`::after` с `inset: 0`) — фокус рисовать на карточке через `:focus-within` или на псевдоэлементе, иначе контур появится вокруг одного слова.

## Кнопка или ссылка («а», «ж»)

- Переход на другой адрес — `<a href>`. Действие на странице — `<button type="button">`.
- Иконочная кнопка — имя через видимо скрытый текст или `aria-label`; иконка скрыта:

```html
<button type="button" class="icon-btn">
  <svg aria-hidden="true" focusable="false">…</svg>
  <span class="visually-hidden">Закрыть окно</span>
</button>
```

```css
.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
```

- Ссылка на внешний сайт или файл — сообщить об этом в названии:

```html
<a href="https://external.example/">Портал госуслуг<span class="visually-hidden">, внешний сайт</span></a>
<a href="/files/rules.pdf">Правила приёма <span>(PDF, 1,2 МБ)</span></a>
```

- Однотипные «Подробнее» в карточках — дать контекст: либо ссылкой сделать заголовок карточки, либо `aria-describedby` на заголовок, либо скрытый хвост «Подробнее<span class="visually-hidden"> о программе «…»</span>». `aria-label` полностью заменяет видимый текст, поэтому он должен начинаться с видимых слов (WCAG 2.5.3).
- Картинка внутри ссылки, где уже есть текст, — `alt=""`, чтобы название не читалось дважды.

## Навигация и шапка («а», «ж»)

```html
<nav aria-label="Основное меню">…</nav>
<nav aria-label="Хлебные крошки">
  <ol>
    <li><a href="/">Главная</a></li>
    <li><a href="/education/">Образование</a></li>
    <li><a aria-current="page">Бакалавриат</a></li>
  </ol>
</nav>
```

- Разные `aria-label` у нескольких `<nav>`.
- Текущий пункт — `aria-current="page"`. Разделители крошек — CSS (`li + li::before`) или `aria-hidden="true"`.
- Каждая крошка ведёт на реальную родительскую страницу, а не на `#`.

## Кнопка меню / раскрывающийся блок («а», «и»)

```html
<button type="button" aria-expanded="false" aria-controls="site-menu">Меню</button>
<div id="site-menu" hidden>…</div>
```

```js
button.addEventListener('click', () => {
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  if (open) menu.querySelector('a, button')?.focus();
});
```

- Закрытое меню — `hidden` / `display: none` / `inert`, а не только `opacity: 0` или сдвиг за экран: иначе фокус уходит в невидимые ссылки.
- `role="menu"` и `aria-haspopup="menu"` — только для настоящих меню приложений со стрелочной навигацией. Для навигационных ссылок — без них.
- Esc закрывает меню и возвращает фокус на кнопку.
- При масштабе 200% меню прокручивается внутри себя, все пункты достижимы («б»).

## Модальные окна («а», «г», «к»)

Предпочтительно нативный `<dialog>` с `showModal()`: фокус удерживается внутри, фон становится инертным, Esc закрывает.

```html
<dialog id="video-dialog" aria-labelledby="video-dialog-title">
  <h2 id="video-dialog-title">Видео о записи на приём</h2>
  <button type="button" class="dialog-close">Закрыть окно</button>
  …
</dialog>
```

```js
let opener = null;
function openDialog(dialog, trigger) {
  opener = trigger;
  dialog.showModal();
  document.documentElement.classList.add('dialog-opened');
}
function closeDialog(dialog) {
  dialog.querySelectorAll('video, audio').forEach((m) => m.pause());
  dialog.close();
  document.documentElement.classList.remove('dialog-opened');
  opener?.focus();
}
```

```css
.dialog-opened { overflow: hidden; scrollbar-gutter: stable; }
```

- Программное имя окна (`aria-labelledby` / `aria-label`).
- Возврат фокуса на элемент, открывший окно.
- При закрытии останавливать видео и аудио полностью, а не только скрывать окно.
- Кнопка «Закрыть» — в начале окна (первой в порядке Tab или сразу после заголовка), с понятным названием.
- Прокрутка страницы под окном заблокирована.

## Слайдеры и карусели («а», «к», «б»)

- Неактивные (невидимые) слайды — `inert`: убирает их и из порядка Tab, и из дерева доступности одним атрибутом. Обновлять при каждом переключении.
- Если слайдер показывает несколько слайдов и пользователь Tab-ом дошёл до частично видимого — листать к слайду с фокусом (`focusin` на слайде → `slideTo(index)`), а не держать `inert` на видимых.
- Кнопки «Предыдущий слайд» / «Следующий слайд» — `<button>` с названием; точки пагинации — кнопки с названием «Слайд 3 из 6» и `aria-current="true"` у текущей.
- Автопрокрутка — с кнопкой «Пауза»/«Воспроизвести» и остановкой при фокусе и наведении; при `prefers-reduced-motion: reduce` — выключена («к»).
- Обёртка слайдера — `overflow: hidden` (или `clip`), чтобы выезжающие слайды не давали горизонтальную прокрутку страницы («б»).
- Ширина слайда при масштабе 200% — `auto` / `min(…, 80vw)` вместо фиксированной доли, иначе карточка растягивается или вылезает.

```js
function syncSlides(slides, visibleIndexes) {
  slides.forEach((slide, i) => { slide.inert = !visibleIndexes.includes(i); });
}
```

## Вкладки и фильтры («а», «и»)

Два разных паттерна — не смешивать:

1. **Вкладки (tabs)** — переключают панели на месте: `role="tablist"`, `role="tab"` с `aria-selected` и `aria-controls`, `role="tabpanel"`; стрелки влево/вправо переключают, Tab уходит в панель; неактивные вкладки `tabindex="-1"`.
2. **Фильтры** — меняют выдачу (часто запросом к серверу): обычные `<button aria-pressed>` или радиокнопки в `<fieldset>` с `<legend>`. Ролей tab не нужно.

После обновления выдачи — сообщение в постоянном live-регионе вне заменяемой области:

```html
<p class="visually-hidden" aria-live="polite" id="results-status"></p>
<div id="results">…</div>
```

```js
status.textContent = `Найдено: ${count}`;
```

Проверь, что значение выбранной вкладки или фильтра по-прежнему попадает в запрос — см. `pitfalls.md`.

## Пагинация («а», «ж», «и»)

```html
<nav aria-label="Страницы результатов">
  <ul>
    <li><a href="?page=1" aria-label="Предыдущая страница">‹</a></li>
    <li><a href="?page=1">1</a></li>
    <li><a href="?page=2" aria-current="page">2</a></li>
    <li><a href="?page=3">3</a></li>
    <li><a href="?page=3" aria-label="Следующая страница">›</a></li>
  </ul>
</nav>
```

- Номер страницы — видимый текст, а не точка или радиокнопка.
- Текущая — `aria-current="page"`, не только цвет.
- Недоступная кнопка «назад» на первой странице — `disabled` у `<button>` или отсутствие ссылки; `aria-disabled` синхронно с реальным состоянием.

## Формы («м», «и»)

```html
<form novalidate>
  <div class="field">
    <label for="phone">Телефон <span aria-hidden="true">*</span></label>
    <input id="phone" name="phone" type="tel" autocomplete="tel" required
           aria-describedby="phone-hint phone-error">
    <p id="phone-hint">Формат: +7 900 000-00-00</p>
    <p id="phone-error" class="field-error" hidden></p>
  </div>

  <fieldset>
    <legend>Форма обучения</legend>
    <label><input type="radio" name="mode" value="full"> Очная</label>
    <label><input type="radio" name="mode" value="part"> Заочная</label>
  </fieldset>

  <div aria-live="assertive" class="visually-hidden" id="form-status"></div>
  <button type="submit">Отправить</button>
</form>
```

```js
function showError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  error.textContent = message;
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}
form.addEventListener('submit', (e) => {
  const invalid = [...form.elements].filter((el) => el.willValidate && !el.checkValidity());
  if (!invalid.length) return;
  e.preventDefault();
  invalid.forEach((el) => showError(el, el.validationMessage));
  status.textContent = `Форма не отправлена: ошибок — ${invalid.length}`;
  invalid[0].focus();
});
```

- Подпись — `<label for>`, а не `placeholder`.
- Обязательность — `required` и текстом в легенде формы («поля со * обязательны»).
- Инструкция по формату — видимым текстом, связана через `aria-describedby`.
- Ошибка — текстом, рядом с полем, связана с полем, `aria-invalid="true"`; сводка или фокус на первом ошибочном поле.
- Результат отправки (успех или ошибка сервера) — тоже в live-регионе.

## Изображения («г»)

- Хелпер или компонент картинки по умолчанию даёт `alt=""` (декоративное), а содержательный `alt` передаётся явно. Слово-заглушка по умолчанию («Image», «Фото») — хуже пустого.
- Декоративные SVG — `aria-hidden="true" focusable="false"`; содержательные — `role="img"` + `aria-label` или `<title>`.
- Фоновые картинки в CSS — только для декоративного; содержательное изображение — `<img>`.
- Сложная графика (схема, диаграмма, инфографика) — краткий `alt` + развёрнутое описание текстом рядом или по ссылке.

## Видео и аудио («г», «к»)

- Есть элементы управления: нативные `controls` или кастомные кнопки (`<button>` с названиями «Воспроизвести», «Пауза», «Перемотать на 10 секунд назад», «Включить звук»), доступные с клавиатуры.
- Нет автозапуска со звуком; автозапуск без звука — только с видимой кнопкой паузы. Видео в окне не стартует само при повторном открытии.
- У видео — краткое описание (минимум по ПП) и, по возможности, субтитры (`<track kind="captions">`) и расшифровка.
- Элементы управления не перекрывают субтитры.
- Описание видео, связанное с окном или слайдом через `aria-describedby`, зачитывается, только когда фокус оказывается на этом элементе. Если при открытии фокус уходит на кнопку «Закрыть», связывай описание с самим окном или переводи фокус на заголовок.

## Аккордеоны («а», «и»)

```html
<h3>
  <button type="button" aria-expanded="false" aria-controls="faq-1">Как подать документы?</button>
</h3>
<div id="faq-1" hidden>…</div>
```

Кнопка внутри заголовка: и навигация по заголовкам, и правильная роль. Свернутое содержимое — `hidden`, а не высота 0 с видимыми для Tab ссылками.

## Таблицы («а», «б»)

- Таблица данных — `<table>` с `<caption>`, `<th scope="col|row">`. Не таблица для вёрстки.
- Широкая таблица — в обёртке с горизонтальной прокруткой внутри (`overflow-x: auto`, `tabindex="0"`, `role="region"`, `aria-label`), чтобы страница целиком не прокручивалась.

## Списки и определения («а»)

- Перечни — `<ul>`/`<ol>`. Пары «название — значение» (стоимость, срок, количество мест) — `<dl>`/`<dt>`/`<dd>`: скринридер зачитывает связь.
- Пустое значение не оставлять пропуском — писать «0», «нет» или «уточняется».

## Темы версии для слабовидящих («з»)

- Все цвета — через токены (CSS-переменные), у каждой темы свой набор. Жёстко прописанный цвет в компоненте ломает тему: текст становится чёрным на тёмном фоне.
- После любой правки цвета — проверить все темы.

## Корневой размер шрифта и масштаб («б»)

- Размер шрифта на `vw` для мобильных макетов ограничивай `clamp()` или применяй только на сенсорных устройствах (`@media (hover: none) and (pointer: coarse)`), иначе на десктопе при зуме 200% (окно сужается, срабатывает мобильный брейкпоинт) шрифт уменьшается вместе с шириной.
- Фиксированная высота у блоков с текстом → `min-height`; фиксированная ширина → `max-width`.

## Анимации («к»)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

В JS-анимациях (GSAP, Lottie, параллакс) — проверять `matchMedia('(prefers-reduced-motion: reduce)')` и давать кнопку паузы для длительных анимаций.
