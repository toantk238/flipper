# Network Tab: Path-Focused URL Truncation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display URL paths (not full URLs) in the Network tab's domain column, with middle truncation and a localStorage-persisted toggle in the row context menu.

**Architecture:** All changes are contained in a single file (`index.tsx`) plus a new test file. `truncateMiddle` is a pure exported utility. `pathOnly` is a `createState<boolean>` initialized from localStorage. The `Component` function derives `displayColumns` via `React.useMemo`, injecting an `onRender` onto the `domain` column when `pathOnly` is true.

**Tech Stack:** React (hooks), flipper-plugin (`createState`, `useValue`, `DataTableColumn`), Ant Design (`Menu.Item`), Jest + `TestUtils.startPlugin`

---

## File Structure

- **Modify:** `desktop/plugins/public/network/index.tsx`
  - Add `LOCALSTORAGE_PATH_ONLY_KEY` constant
  - Export `truncateMiddle(str, maxLength?)` pure utility
  - Add `pathOnly: createState<boolean>` and `togglePathOnly()` action to plugin
  - Add `Menu.Item` toggle in `onContextMenu`
  - Add `DomainCell` component
  - Update `Component` to derive `displayColumns` via `React.useMemo`
- **Create:** `desktop/plugins/public/network/__tests__/url-display.node.tsx`
  - Tests for `truncateMiddle` and `pathOnly` state

---

## Task 1: `truncateMiddle` utility

**Files:**
- Create: `desktop/plugins/public/network/__tests__/url-display.node.tsx`
- Modify: `desktop/plugins/public/network/index.tsx` (add export after line 80)

- [ ] **Step 1: Create test file with failing tests**

Create `desktop/plugins/public/network/__tests__/url-display.node.tsx`:

```tsx
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {truncateMiddle} from '../index';

test('returns strings at or below maxLength unchanged', () => {
  expect(truncateMiddle('/api/v1')).toBe('/api/v1');
  const fifty = 'a'.repeat(50);
  expect(truncateMiddle(fifty)).toBe(fifty);
  expect(truncateMiddle('')).toBe('');
});

test('truncates long strings with ellipsis in the middle', () => {
  // maxLength=10: startLen=5, endLen=4 → 'abcde…ijkl'
  expect(truncateMiddle('abcdefghijkl', 10)).toBe('abcde…ijkl');
});

test('result length equals maxLength for truncated strings', () => {
  const result = truncateMiddle('a'.repeat(51));
  expect(result.length).toBe(50);
  expect(result).toContain('…');
});

test('preserves end of string (most specific path segment)', () => {
  const path = '/api/v2/users/12345678/profile/settings/notifications/read';
  const result = truncateMiddle(path, 30);
  // endLen=floor(29/2)=14, so last 14 chars are preserved
  expect(result.endsWith(path.slice(-14))).toBe(true);
  expect(result.length).toBe(30);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd desktop && yarn jest plugins/public/network/__tests__/url-display.node.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `truncateMiddle` is not exported from `'../index'`

- [ ] **Step 3: Add `truncateMiddle` to `index.tsx`**

In `desktop/plugins/public/network/index.tsx`, after line 80 (after the `LOCALSTORAGE_RESPONSE_BODY_FORMAT_KEY` constant), add:

```typescript
const LOCALSTORAGE_PATH_ONLY_KEY = '__NETWORK_PATH_ONLY_MODE';

export function truncateMiddle(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) {
    return str;
  }
  const endLen = Math.floor((maxLength - 1) / 2);
  const startLen = maxLength - 1 - endLen;
  return str.slice(0, startLen) + '…' + str.slice(-endLen);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd desktop && yarn jest plugins/public/network/__tests__/url-display.node.tsx --no-coverage 2>&1 | tail -20
```

Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/public/network/index.tsx desktop/plugins/public/network/__tests__/url-display.node.tsx
git commit -m "feat(network): add truncateMiddle utility for URL display"
```

---

## Task 2: `pathOnly` state and `togglePathOnly` action

**Files:**
- Modify: `desktop/plugins/public/network/index.tsx`
- Modify: `desktop/plugins/public/network/__tests__/url-display.node.tsx`

- [ ] **Step 1: Add failing tests for pathOnly state**

Append to `desktop/plugins/public/network/__tests__/url-display.node.tsx`:

```tsx
import 'core-js/stable/structured-clone';
import 'fake-indexeddb/auto';
import {TestUtils} from 'flipper-plugin';
import * as NetworkPlugin from '../index';

test('pathOnly defaults to true', () => {
  const {instance} = TestUtils.startPlugin(NetworkPlugin);
  expect(instance.pathOnly.get()).toBe(true);
});

test('togglePathOnly flips the state', () => {
  const {instance} = TestUtils.startPlugin(NetworkPlugin);
  instance.togglePathOnly();
  expect(instance.pathOnly.get()).toBe(false);
  instance.togglePathOnly();
  expect(instance.pathOnly.get()).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && yarn jest plugins/public/network/__tests__/url-display.node.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `instance.pathOnly` is undefined

- [ ] **Step 3: Add `pathOnly` state and `togglePathOnly` to the plugin**

In `desktop/plugins/public/network/index.tsx`, inside the `plugin()` function body (after the `columns` state declaration at line ~134), add:

```typescript
const pathOnly = createState<boolean>(
  localStorage.getItem(LOCALSTORAGE_PATH_ONLY_KEY) !== 'false',
);
```

Then in the `return` object at the end of `plugin()` (alongside the other exported state/actions), add:

```typescript
pathOnly,
togglePathOnly() {
  const next = !pathOnly.get();
  pathOnly.set(next);
  localStorage.setItem(LOCALSTORAGE_PATH_ONLY_KEY, String(next));
},
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && yarn jest plugins/public/network/__tests__/url-display.node.tsx --no-coverage 2>&1 | tail -20
```

Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/public/network/index.tsx desktop/plugins/public/network/__tests__/url-display.node.tsx
git commit -m "feat(network): add pathOnly state with localStorage persistence"
```

---

## Task 3: Context menu toggle

**Files:**
- Modify: `desktop/plugins/public/network/index.tsx` — `onContextMenu` in the `plugin()` return object

- [ ] **Step 1: Add the toggle `Menu.Item` to `onContextMenu`**

In `desktop/plugins/public/network/index.tsx`, find the `onContextMenu` function (around line 464). It currently returns:

```tsx
onContextMenu(request: Request | undefined) {
  return (
    <>
      <Menu.Item
        key="curl"
        onClick={async () => {
          if (!request) {
            return;
          }
          const requestWithData = await db.addDataToRequest(request);
          const command = convertRequestToCurlCommand(requestWithData);
          client.writeTextToClipboard(command);
        }}>
        Copy cURL command
      </Menu.Item>
      <Menu.Item
        key="custom header"
        onClick={() => {
          showCustomColumnDialog(addCustomColumn);
        }}>
        Add header column{'…'}
      </Menu.Item>
    </>
  );
},
```

Replace it with:

```tsx
onContextMenu(request: Request | undefined) {
  return (
    <>
      <Menu.Item
        key="curl"
        onClick={async () => {
          if (!request) {
            return;
          }
          const requestWithData = await db.addDataToRequest(request);
          const command = convertRequestToCurlCommand(requestWithData);
          client.writeTextToClipboard(command);
        }}>
        Copy cURL command
      </Menu.Item>
      <Menu.Item
        key="path-only"
        onClick={() => {
          const next = !pathOnly.get();
          pathOnly.set(next);
          localStorage.setItem(LOCALSTORAGE_PATH_ONLY_KEY, String(next));
        }}>
        {pathOnly.get() ? '✓ ' : ''}Show path only
      </Menu.Item>
      <Menu.Item
        key="custom header"
        onClick={() => {
          showCustomColumnDialog(addCustomColumn);
        }}>
        Add header column{'…'}
      </Menu.Item>
    </>
  );
},
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd desktop && yarn jest plugins/public/network/ --no-coverage 2>&1 | tail -20
```

Expected: PASS — all tests green

- [ ] **Step 3: Commit**

```bash
git add desktop/plugins/public/network/index.tsx
git commit -m "feat(network): add 'Show path only' toggle to row context menu"
```

---

## Task 4: `DomainCell` component and column wiring

**Files:**
- Modify: `desktop/plugins/public/network/index.tsx` — React import, new component, `Component` function

- [ ] **Step 1: Add `useMemo` to the React import**

In `desktop/plugins/public/network/index.tsx`, find line 10:

```typescript
import React, {createRef, useEffect, useState} from 'react';
```

Replace with:

```typescript
import React, {createRef, useEffect, useMemo, useState} from 'react';
```

- [ ] **Step 2: Add the `DomainCell` component**

In `desktop/plugins/public/network/index.tsx`, add this component just before the `export function Component()` declaration (around line 606):

```tsx
function DomainCell({
  row,
  pathOnly,
}: {
  row: Request;
  pathOnly: boolean;
}) {
  let display: string;
  if (pathOnly) {
    try {
      const parsed = new URL(row.url);
      display = truncateMiddle(parsed.pathname || '/');
    } catch {
      display = truncateMiddle(row.domain);
    }
  } else {
    display = row.domain;
  }
  return <span title={row.url}>{display}</span>;
}
```

- [ ] **Step 3: Update `Component` to use `displayColumns`**

In `desktop/plugins/public/network/index.tsx`, find the `Component` function. The current top of the function reads:

```tsx
export function Component() {
  const instance = usePlugin(plugin);
  const routes = useValue(instance.routes);
  const isMockResponseSupported = useValue(instance.isMockResponseSupported);
  const showMockResponseDialog = useValue(instance.showMockResponseDialog);
  const networkRouteManager = useValue(instance.networkRouteManager);
  const columns = useValue(instance.columns);
```

Replace it with:

```tsx
export function Component() {
  const instance = usePlugin(plugin);
  const routes = useValue(instance.routes);
  const isMockResponseSupported = useValue(instance.isMockResponseSupported);
  const showMockResponseDialog = useValue(instance.showMockResponseDialog);
  const networkRouteManager = useValue(instance.networkRouteManager);
  const columns = useValue(instance.columns);
  const pathOnly = useValue(instance.pathOnly);

  const displayColumns = useMemo(
    () =>
      columns.map((col) =>
        col.key === 'domain'
          ? {
              ...col,
              onRender: (row: Request, _selected: boolean, _index: number) => (
                <DomainCell row={row} pathOnly={pathOnly} />
              ),
            }
          : col,
      ),
    [columns, pathOnly],
  );
```

Then find the `<Layout.Container` opening tag which currently has:

```tsx
<Layout.Container
  grow
  key={
    columns.length /* make sure to reset the table if colums change */
  }>
  <DataTable
    columns={columns}
```

Replace it with:

```tsx
<Layout.Container
  grow
  key={`${columns.length}-${pathOnly}`}>
  <DataTable
    columns={displayColumns}
```

- [ ] **Step 4: Run all network plugin tests**

```bash
cd desktop && yarn jest plugins/public/network/ --no-coverage 2>&1 | tail -20
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/public/network/index.tsx
git commit -m "feat(network): render path-only with middle truncation in domain column"
```

---

## Self-Review Notes

- `truncateMiddle` is exported → testable ✓
- `togglePathOnly` is on the plugin return object → testable ✓  
- Context menu reads `pathOnly.get()` at render time → shows current checkmark ✓
- `DomainCell` fallback to `row.domain` if URL unparseable ✓
- `key` on `Layout.Container` includes `pathOnly` → table resets on mode change ✓
- `onRender` signature matches `DataTableColumn` type: `(row: T, selected: boolean, index: number) => ReactNode` ✓
- localStorage default: `null !== 'false'` → `true` (path-only on by default) ✓
