# NILTASK Compiled Tailwind Migration

> Use with `PROFESSIONALIZATION_PLAN.md`, `PROFESSIONALIZATION_VALIDATION.md`, `SMOKE_TEST_CHECKLIST.md` and `PWA_RELEASE_NOTES.md`.

## Current production state

The application still loads:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

That remains intentional until the compiled stylesheet passes authenticated desktop/mobile visual parity checks.

The current branch does **not** link `css/tailwind.generated.css` from `index.html`, does not remove the CDN, and does not change production styling ownership.

## Parallel compiled build

Pinned build packages:

```text
tailwindcss             4.3.0
@tailwindcss/cli        4.3.0
```

Commands:

```bash
npm run build:tailwind
npm run validate:tailwind
```

Input:

```text
css/tailwind.input.css
```

Generated verification output:

```text
css/tailwind.generated.css
```

The generated file is ignored by Git because it is currently a CI verification artifact rather than the production asset.

## Explicit source inventory

Automatic source detection is disabled:

```css
@import "tailwindcss" source(none);
```

The input explicitly scans:

- `index.html`;
- `admin.html`;
- `developer.html`;
- `signup.html`;
- `logs.html`;
- `offline.html`;
- `install.html`;
- `Landing.html`;
- `landing-v2.html`;
- the full `js` directory, including runtime-generated HTML strings;
- the `www` Capacitor/local shell.

Explicit registration prevents an unrelated new repository folder from silently changing the production utility sheet.

## Automated output checks

`scripts/validate-tailwind-build.mjs` requires:

- generated CSS exists;
- generated CSS is non-trivial;
- core layout utilities are present;
- hidden/overflow/centering utilities are present;
- representative color, text, radius and arbitrary-value utilities are present;
- an actually used hover variant is present;
- no browser-CDN URL appears inside the generated stylesheet.

The checked representative selectors currently include:

```text
flex
hidden
h-screen
overflow-hidden
items-center
justify-center
bg-indigo-50
text-xs
rounded-xl
text-[11px]
hover:bg-gray-100
```

The check intentionally validates classes used by this repository. It does not force unused responsive or color utilities into the output merely to satisfy a generic framework checklist.

## CI artifact

The GitHub Actions workflow uploads:

```text
tailwind-generated-css
```

for three days, including when output validation fails.

This allows exact generated CSS inspection without committing an unaccepted production asset.

The first successful compiled output inspected during this migration was approximately 29 KB minified.

## Why the CDN is not removed yet

A successful build proves source detection and CSS generation, but it does not prove visual parity.

The app contains:

- large runtime-generated HTML strings;
- inline utility-class combinations;
- separate desktop and mobile renderers;
- login/pre-paint rules;
- Activity and Task right-panel layouts;
- modals, sheets and PDF/print views;
- PWA and Capacitor shells.

A missing dynamically constructed class may only appear in a specific role, Task state, screen width or interaction.

## Required visual parity run

Compare the current CDN path against a preview that links the compiled CSS.

### Authentication and shell

- login screen at desktop width;
- login screen at phone width;
- restored desktop session;
- restored mobile session;
- boot splash and first paint;
- light and dark themes.

### Desktop

- left chat sidebar;
- open group and DM;
- message bubbles, composer and reactions;
- Task panel and all compact filters;
- Activity panel and filters;
- settings, reminders, bookmarks and scheduled-message panels;
- Task detail and modal actions;
- dashboard and printable scorecard.

### Mobile/PWA

- home list;
- group, DM and thread screens;
- keyboard/composer layout;
- Task list and Task detail;
- Activity and attention screens;
- sheets, heads-up banner and notification badge;
- installed PWA shell and offline fallback.

### Administrative pages

- signup;
- admin;
- developer;
- logs;
- install/landing pages that remain publicly reachable.

## Production-switch sequence

Only after visual parity acceptance:

1. choose whether Vercel will generate the CSS during deployment or the minified asset will be committed;
2. create a dedicated preview commit linking `css/tailwind.generated.css`;
3. keep the CDN temporarily available only if a controlled fallback strategy is required;
4. run the complete desktop/mobile visual checklist;
5. remove the CDN script;
6. update the automated contract so the CDN becomes forbidden and the local stylesheet becomes required;
7. add the exact local stylesheet URL to the service-worker app shell;
8. advance the PWA cache generation;
9. run installed-PWA update checks;
10. identify the rollback commit;
11. obtain explicit owner approval before merge.

## Rollback

If the compiled stylesheet preview loses styling or misses a dynamic state:

1. restore the CDN script in `index.html`;
2. remove the local generated stylesheet link;
3. restore the prior service-worker cache generation if it was advanced;
4. deploy the revert on the preview branch;
5. inspect the missing class and add a full static source token or explicit `@source inline()` entry;
6. rerun automated and visual checks;
7. keep the PR draft.

## Current status

```text
Build path:                 READY
Automated CSS generation:   PASS
Automated output checks:    PASS
Generated CSS linked:       NO
Tailwind CDN removed:       NO
Visual parity accepted:     NOT YET
Production changed:         NO
```
