# Design: Fix Dark Mode Text Colors in Plugins

**Date:** 2026-05-20
**Branch:** v2.0
**Affects:** Network, Logs, Crash Reporter plugins

---

## Problem

After migrating to antd v5 (`f899240a71`), antd components use CSS-in-JS instead of compiled Less CSS. antd v4's Less compilation produced a global `body { color: ...; background-color: ...; }` baseline that set default text/background for the entire page. antd v5 does not emit this global rule — it only injects per-component styles via its CSS-in-JS engine.

`dark.css` and `light.css` define Flipper's CSS variables on `:root` but include no `body {}` rule. As a result, plain HTML elements (including `DataTable` rows) have no inherited text color and fall back to the browser default (black), making them invisible or nearly invisible on a dark background.

Additionally, antd v5 static APIs (`notification.success()`, `message.xxx()`, `Modal.confirm()`) render portals directly into `document.body`, outside the `ConfigProvider` tree added in `7fe92989ee`. These portals receive the default light algorithm, producing white-background notifications in dark mode.

### Symptoms

- Normal (non-error) rows in the Network plugin show **black text** in dark mode.
- Error rows (4xx/5xx) show **red text** — this is intentional behavior (`theme.errorColor`) and is not changed.
- Notification popups (Crash Reporter `notification.success()`) render with light theme colors in dark mode.
- Same root cause affects the Logs plugin `DataTable` rows.

---

## Root Cause

`TableBodyRowContainer` and `TableBodyColumnContainer` in `flipper-plugin/src/ui/data-table/TableRow.tsx` set `backgroundColor` and borders via the theme but set no explicit `color`. Text color is inherited from the DOM ancestor. With no `body { color }` rule, the browser default (black) applies.

---

## Solution

Two targeted changes. No plugin source files are modified.

### Change 1 — Restore the global body baseline in `dark.css` and `light.css`

Add a `body {}` block to each theme file using the already-defined CSS variables:

**`desktop/static/themes/dark.css`** — add inside the `:root` section or after it:
```css
body {
  color: var(--flipper-text-color-primary);
  background-color: var(--flipper-background-default);
}
```

**`desktop/static/themes/light.css`** — same rule; variable values differ:
```css
body {
  color: var(--flipper-text-color-primary);
  background-color: var(--flipper-background-default);
}
```

Effect: all uncolored text elements (including `DataTable` rows) inherit the correct foreground. Switching between dark and light mode swaps the CSS file, which swaps the CSS variable values, which changes the inherited colors automatically. No JS changes required for this fix.

### Change 2 — Add antd `<App>` inside `AntdThemeProvider`

**`desktop/flipper-ui/src/startFlipperDesktop.tsx`**

```tsx
import {App, Button, ConfigProvider, Input, Result, Typography, theme as antdTheme} from 'antd';

function AntdThemeProvider({children}: {children?: React.ReactNode}) {
  const isDarkMode = useIsDarkMode();
  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDarkMode ? '#531dab' : '#722ed1',
          colorSuccess: '#389e0d',
          colorError: '#f5222d',
          colorWarning: '#faad14',
          colorBgBase: isDarkMode ? '#000000' : '#ffffff',
          colorTextBase: isDarkMode ? '#ffffff' : '#000000',
          borderRadius: 6,
        },
      }}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
```

Effect: antd's `App` creates a React context that the static notification/message/modal APIs consume, giving them access to the active theme. `notification.success()` in Crash Reporter and any `message.xxx()` calls now render with the correct dark or light algorithm.

---

## Files Changed

| File | Change |
|---|---|
| `desktop/static/themes/dark.css` | Add `body { color; background-color }` using CSS vars |
| `desktop/static/themes/light.css` | Same rule |
| `desktop/flipper-ui/src/startFlipperDesktop.tsx` | Add `<App>` inside `ConfigProvider` in `AntdThemeProvider` |

---

## What Is NOT Changed

- `flipper-plugin/src/ui/data-table/TableRow.tsx` — no `color` added; the global body rule handles inheritance
- `plugins/public/network/index.tsx` — `errorStyle` (red for 4xx/5xx) is intentional, unchanged
- No changes to Network, Logs, or Crash Reporter plugin source
- No changes to the CSS variable definitions themselves

---

## Verification

1. Start the dev server (`yarn start` in `desktop/`).
2. Enable dark mode in Flipper settings.
3. Open the **Network** plugin — request rows should show white text; 4xx/5xx rows still show red.
4. Open the **Logs** plugin — log entries should show correct colors per level.
5. Open the **Crash Reporter** plugin — trigger or simulate a crash notification; the popup should have a dark background.
6. Switch back to light mode — confirm text is black and backgrounds are white.
