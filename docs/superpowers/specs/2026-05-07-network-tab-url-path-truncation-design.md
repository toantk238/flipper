# Network Tab: Path-Focused URL Truncation

**Date:** 2026-05-07  
**File:** `desktop/plugins/public/network/index.tsx`

## Problem

The `domain` column in the Network tab shows `host + pathname` (e.g., `api.example.com/v1/users/profile/settings`). When URLs are long, the browser clips from the end — losing the most specific part of the path, which is usually what distinguishes requests.

## Goal

Display only the URL path in the `domain` column, with middle truncation so both the path prefix and the most specific endpoint segment are visible. A toggle in the row context menu controls this behavior, persisted to localStorage, defaulting to on.

## Design

### 1. State & Persistence

A `pathOnly` boolean state is added to the plugin:

```typescript
const LOCALSTORAGE_PATH_ONLY_KEY = 'network-plugin-path-only';

const pathOnly = createState<boolean>(
  localStorage.getItem(LOCALSTORAGE_PATH_ONLY_KEY) !== 'false',
);
```

Defaulting logic: treat any value other than the string `'false'` as `true`, so new users get path-only mode on first load.

When toggled, the handler writes back:
```typescript
pathOnly.set(next);
localStorage.setItem(LOCALSTORAGE_PATH_ONLY_KEY, String(next));
```

### 2. Context Menu Toggle

A new `Menu.Item` is inserted into `onContextMenu` alongside "Copy cURL command" and "Add header column...":

```tsx
<Menu.Item
  key="path-only"
  onClick={() => {
    const next = !pathOnly.get();
    pathOnly.set(next);
    localStorage.setItem(LOCALSTORAGE_PATH_ONLY_KEY, String(next));
  }}>
  {pathOnly.get() ? '✓ ' : ''}Show path only
</Menu.Item>
```

The checkmark prefix makes current state immediately visible without a separate indicator.

### 3. Utility: `truncateMiddle`

A pure function added near the top of the file (or in a shared utils location if one exists):

```typescript
function truncateMiddle(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) return str;
  const endLen = Math.floor((maxLength - 1) / 2);
  const startLen = maxLength - 1 - endLen;
  return str.slice(0, startLen) + '…' + str.slice(-endLen);
}
```

Example: `/api/v2/users/12345/profile/settings/notifications` (51 chars, maxLength=50) →  
`/api/v2/users/12345/profile/setti…notifications`

### 4. `DomainCell` Component

A small render component added in the same file:

```tsx
function DomainCell({
  value,
  url,
  pathOnly,
}: {
  value: string;
  url: string;
  pathOnly: boolean;
}) {
  let display: string;
  if (pathOnly) {
    try {
      const parsed = new URL(url);
      display = truncateMiddle(parsed.pathname || '/');
    } catch {
      display = truncateMiddle(value);
    }
  } else {
    display = value;
  }
  return <span title={url}>{display}</span>;
}
```

- `title={url}` always shows the full URL on hover regardless of mode
- Falls back to the pre-computed `value` (domain field) if URL parsing fails

### 5. Column Wiring in `NetworkApp`

In the `NetworkApp` component, derive `displayColumns` from the existing `columns` and `pathOnly` values:

```tsx
const columns = useValue(instance.columns);
const pathOnly = useValue(instance.pathOnly);

const displayColumns = useMemo(
  () =>
    columns.map((col) =>
      col.key === 'domain'
        ? {
            ...col,
            onRender: (value: string, row: Request) => (
              <DomainCell value={value} url={row.url} pathOnly={pathOnly} />
            ),
          }
        : col,
    ),
  [columns, pathOnly],
);
```

Pass `displayColumns` to `<DataTable columns={displayColumns} ...>` instead of `columns`.

## Files Changed

- `desktop/plugins/public/network/index.tsx` — all changes are contained here

## Non-Goals

- No changes to the `Request` data model or `createRequestFromRequestInfo`
- No changes to the `url` (Full URL) hidden column
- No responsive/CSS-based truncation
- No server-side changes
