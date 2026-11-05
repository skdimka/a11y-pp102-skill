# a11y-pp102 — a Claude Code skill for Russian government website accessibility (Decree No. 102)

[Русская версия](README.md)

A skill for [Claude Code](https://claude.com/claude-code) (and other AI agents that read Markdown instructions) that helps audit and fix website accessibility for visually impaired users according to **Russian Government Decree No. 102 of 7 February 2026**. It includes a breakdown of the requirements mapped to WCAG 2.2, ready-made fix patterns, a list of common regressions, templates for an audit table and a fix log, and Playwright-based automated checks.

The skill's instructions and references are written in Russian, since its audience is Russian public-sector projects. The scripts produce reports in Russian.

## Who needs this

Since 1 March 2026, Decree No. 102 requires accessibility for visually impaired users on the official websites of:

- federal and regional government bodies;
- local self-government bodies;
- **organizations subordinate to them** — state and municipal universities, colleges, schools, kindergartens, hospitals, museums, libraries, theatres, public service centres and other state institutions.

Commercial websites are not directly covered, but the requirements closely follow WCAG 2.2 level AA, so the methodology is useful for any project.

## What the decree requires

Paragraph 2 of the Requirements, subparagraphs «а»–«н»:

| | Requirement | Closest WCAG 2.2 |
|---|---|---|
| «а» | Everything works with a keyboard and assistive technologies; structure and order are programmatically determinable | 1.3.1, 1.3.2, 2.1.1, 2.1.2, 2.4.3, 4.1.2 |
| «б» | Text can be zoomed to 200% without loss of functionality or horizontal scrolling | 1.4.4, 1.4.10 |
| «в» | Documents are screen-reader accessible and tagged per GOST R 70176-2022 (PDF), or an accessible alternative is provided | PDF techniques |
| «г» | Non-text content has a text alternative; decorative content is hidden | 1.1.1, 1.2.1 |
| «д» | CAPTCHA is in Russian and accessible | 1.1.1 |
| «е» | Page titles describe topic or purpose | 2.4.2 |
| «ж» | Link purpose is clear from the link text or its context | 2.4.4 |
| «з» | Text contrast at least 4.5:1 (3:1 for large text) | 1.4.3 |
| «и» | Information is not conveyed by colour, shape or position alone | 1.3.3, 1.4.1, 4.1.3 |
| «к» | Moving and auto-updating content can be paused; no flashing that may cause discomfort (e.g. more than 3 flashes per second) | 2.2.2, 2.3.1 |
| «л» | Hovering does not change context | 3.2.1, 1.4.13 |
| «м» | Form fields have labels; errors are described in text and announced | 3.3.1, 3.3.2, 4.1.3 |
| «н» | Readable, non-decorative typeface with distinguishable characters | — |

## Contents

```
skill/a11y-pp102/
  SKILL.md                     workflow: audit → classify → atomic fixes → fix log
  references/                  requirements, component patterns, pitfalls, testing, classification
  templates/                   audit table (md, csv) and fix log
scripts/
  axe-scan.mjs                 axe-core results grouped by Decree 102 subparagraphs
  reflow-200.mjs               200% zoom: horizontal scroll, overflowing and clipped content
  keyboard-walk.mjs            Tab walk: focus order, focus visibility, accessible names, links, labels
  fixtures/                    test pages for self-checking the scripts
```

## Installation

```bash
git clone https://github.com/skdimka/a11y-pp102-skill.git
mkdir -p ~/.claude/skills
cp -R a11y-pp102-skill/skill/a11y-pp102 ~/.claude/skills/
```

Or per project, into `.claude/skills/` at the project root.

Scripts (Node.js 18+):

```bash
cd a11y-pp102-skill/scripts
npm install
npx playwright install chromium
npm run selftest
```

Usage:

```bash
node axe-scan.mjs --urls urls.txt --out reports/axe.md
node reflow-200.mjs --urls urls.txt --out reports/reflow.md --screenshots reports/shots
node keyboard-walk.mjs --url https://example.ru/ --out reports/keyboard.md
```

Options: `--width`, `--height`, `--zoom`, `--wait`, `--max`, `--json <file>`. `npm run selftest` checks the scripts themselves against the bundled fixtures.

## Disclaimer

- **Not legal advice.** The skill helps meet the technical requirements but does not certify legal compliance. The [official text of the decree](http://publication.pravo.gov.ru/document/0001202602100010) (publication No. 0001202602100010, 10 Feb 2026) prevails.
- **Automated checks do not replace manual testing** with a keyboard and a screen reader.
- This is an independent project, not affiliated with any government body, auditing organization or standards developer.
- All code samples, texts and test pages were written for this repository and are fictional. The repository contains no third-party materials, code or data from specific websites.
- The decree and GOST standards are paraphrased with references; the standards themselves are not included.

## License

[MIT](LICENSE).
