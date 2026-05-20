# Dark Mode Plugin Text Color Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix black text in Network/Logs/Crash Reporter plugins in dark mode by restoring the global body color baseline and making antd static APIs (notifications) theme-aware.

**Architecture:** Two CSS files get a `body {}` rule that provides the text/background baseline that antd v4's compiled Less CSS previously injected globally. `AntdThemeProvider` in `startFlipperDesktop.tsx` gains a wrapping `<App>` from antd v5 so portal-rendered components (notification, message, modal) receive the active dark/light theme.

**Tech Stack:** CSS custom properties (already defined in `dark.css`/`light.css`), antd v5 `App` component, React/TypeScript.

---

### Task 1: Add body color baseline to `dark.css`

**Files:**
- Modify: `desktop/static/themes/dark.css` (after line 65, after the `:root {}` block)

- [ ] **Step 1: Add the `body` rule**

  Open `desktop/static/themes/dark.css`. After the closing `}` of the `:root {}` block (currently line 65), add:

  ```css
  body {
    color: var(--flipper-text-color-primary);
    background-color: var(--flipper-background-default);
  }
  ```

  The file section should look like this after the edit:

  ```css
  :root {
    --flipper-primary-color: #531dab;
    /* ... all existing variables ... */
    --flipper-border-color: #121212;
  }
  body {
    color: var(--flipper-text-color-primary);
    background-color: var(--flipper-background-default);
  }
  ::-webkit-scrollbar {
  ```

  In dark mode the variables resolve to: `color: #fff`, `background-color: #000`.

- [ ] **Step 2: Commit**

  ```bash
  git add desktop/static/themes/dark.css
  git commit -m "fix(theme): restore body color baseline in dark.css for antd v5"
  ```

---

### Task 2: Add body color baseline to `light.css`

**Files:**
- Modify: `desktop/static/themes/light.css` (after line 65, after the `:root {}` block)

- [ ] **Step 1: Add the `body` rule**

  Open `desktop/static/themes/light.css`. After the closing `}` of the `:root {}` block (currently line 65), add:

  ```css
  body {
    color: var(--flipper-text-color-primary);
    background-color: var(--flipper-background-default);
  }
  ```

  The file section should look like this after the edit:

  ```css
  :root {
    --flipper-primary-color: #722ed1;
    /* ... all existing variables ... */
    --flipper-border-color: #f2f2f2;
  }
  body {
    color: var(--flipper-text-color-primary);
    background-color: var(--flipper-background-default);
  }
  ```

  In light mode the variables resolve to: `color: #000`, `background-color: #fff`.

  `light.css` has no scrollbar rules after `:root` — the `body` block is the last content in the file.

- [ ] **Step 2: Commit**

  ```bash
  git add desktop/static/themes/light.css
  git commit -m "fix(theme): restore body color baseline in light.css for antd v5"
  ```

---

### Task 3: Add antd `<App>` wrapper inside `AntdThemeProvider`

**Files:**
- Modify: `desktop/flipper-ui/src/startFlipperDesktop.tsx` (lines 34 and 67–69)

**Context:** `AntdThemeProvider` currently renders `{children}` directly inside `<ConfigProvider>`. antd v5's static APIs (`notification.success()`, `message.xxx()`, `Modal.confirm()`) render portals into `document.body`, bypassing `ConfigProvider`. Wrapping children in `<App>` creates a React context these portals subscribe to, giving them access to the active dark/light theme.

- [ ] **Step 1: Add `App` to the antd import**

  Line 34 currently reads:
  ```tsx
  import {Button, ConfigProvider, Input, Result, Typography, theme as antdTheme} from 'antd';
  ```

  Change it to:
  ```tsx
  import {App, Button, ConfigProvider, Input, Result, Typography, theme as antdTheme} from 'antd';
  ```

- [ ] **Step 2: Wrap `{children}` with `<App>`**

  Lines 67–69 currently read:
  ```tsx
      }}>
      {children}
    </ConfigProvider>
  ```

  Change them to:
  ```tsx
      }}>
      <App>{children}</App>
    </ConfigProvider>
  ```

  The full `AntdThemeProvider` function after both edits:

  ```tsx
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

- [ ] **Step 3: Commit**

  ```bash
  git add desktop/flipper-ui/src/startFlipperDesktop.tsx
  git commit -m "fix(theme): wrap AntdThemeProvider children in antd App for dark mode notifications"
  ```

---

### Task 4: Start the server and verify

**Files:** none — verification only

- [ ] **Step 1: Start the dev server**

  From the repo root:
  ```bash
  yarn start
  ```

  Wait for the Electron window to open. If the server fails to start, check the terminal output for TypeScript or build errors before proceeding.

- [ ] **Step 2: Enable dark mode**

  In Flipper → Settings (gear icon) → set Appearance to **Dark**. The UI background should turn black.

- [ ] **Step 3: Verify Network plugin text**

  Open the **Network** plugin. Send any request from a connected device, or use an existing one. Confirm:
  - Normal (2xx/3xx) rows show **white text** on dark background.
  - Error (4xx/5xx) rows show **red text** (`#f5222d`) — this is correct intentional behavior.

- [ ] **Step 4: Verify Logs plugin**

  Open the **Logs** plugin. Confirm:
  - Debug/info entries show white or secondary text (not black).
  - Warning entries show orange/yellow (`#faad14`).
  - Error/fatal entries show red (`#f5222d`).

- [ ] **Step 5: Verify Crash Reporter notification**

  Open the **Crash Reporter** plugin. If a notification popup appears (or can be triggered), confirm it renders with a **dark background**, not a white one.

- [ ] **Step 6: Switch to light mode and confirm no regression**

  In Settings, set Appearance back to **Light**. Confirm:
  - Network rows show **black text** on white background.
  - No white-on-white or black-on-black situations.
