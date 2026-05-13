# Stable Selection in DataTable on Streaming Data

**Date:** 2026-05-13  
**Scope:** `flipper-plugin` DataTable framework layer  
**Status:** Approved

---

## Problem

In the network tab, when sorted descending (newest request at top), selecting a row and then receiving new requests causes the selection to visually jump to a different row.

**Root cause:** `selection.current` in `DataManagerState` is an integer **view index**. When a new item is inserted at the top of a descending-sorted view, the `DataSourceView` fires a `shift` event (`location: 'before'`, `delta: +1`). The existing `dataView.addListener` in `DataTable.tsx` only handles `update` events (data changed in-place). `shift` and `reset` events go unhandled, so `selection.current` is never corrected — it silently points at the row below the original selection.

The same drift occurs when the user flips sort order (fires `reset`). There is an existing TODO comment in `DataTableManager.tsx:292` acknowledging this exact issue.

---

## Solution

Anchor the selection to the **entry object** rather than its volatile integer index.

Add a `selectedEntryRef` in `DataTable.tsx` (a `useRef`) that stores the currently selected `Entry<T>`. Whenever the view reshuffles — via `shift` (insert/remove before selection) or `reset` (full re-sort or re-filter) — use `dataView.getViewIndexOfEntry(entry)` to look up the entry's new view index, then silently dispatch `selectItem` with the corrected index.

The identical change applies to `DataTableWithPowerSearch.tsx`.

---

## Data Flow

```
user clicks row N
  → dispatch selectItem(N)
  → triggerSelection effect fires
      → onSelect(item) fires                            ← plugin receives selected ID
      → selectedEntryRef.current = dataView.getEntry(N) ← anchor stored

new request arrives (sorted desc)
  → dataView fires: shift { location: 'before', delta: +1 }
  → new listener branch in DataTable.tsx
      → newIdx = dataView.getViewIndexOfEntry(selectedEntryRef.current)
      → dispatch selectItem(newIdx)                     ← index corrected, same item
      → triggerSelection fires with same item            ← idempotent for callers
```

---

## Files Changed

| File | Change |
|---|---|
| `desktop/flipper-plugin/src/ui/data-table/DataTable.tsx` | Add `selectedEntryRef`; extend `dataView.addListener` to handle `shift` + `reset` |
| `desktop/flipper-plugin/src/ui/data-table/DataTableWithPowerSearch.tsx` | Identical change (parallel implementation) |

**No changes to:**
- `DataTableManager.tsx` / `DataTableWithPowerSearchManager.tsx`
- `DataSource.tsx` / `DataSourceView.tsx`
- `network/index.tsx` or any other plugin

---

## Implementation Details

### 1. Add `selectedEntryRef`

In both `DataTable.tsx` and `DataTableWithPowerSearch.tsx`, declare a ref to hold the currently selected entry:

```ts
const selectedEntryRef = useRef<ReturnType<typeof dataView.getEntry> | null>(null);
```

### 2. Update ref on every selection change

Piggyback on the existing `triggerSelection` effect. After firing `onSelect`, update the ref:

```ts
useEffect(
  function triggerSelection() {
    if (isMounted.current) {
      onSelect?.(
        getSelectedItem(dataView, tableState.selection),
        getSelectedItems(dataView, tableState.selection),
      );
    }
    isMounted.current = true;
    // Anchor the entry object so reanchor can find it after view reshuffles
    selectedEntryRef.current =
      tableState.selection.current >= 0
        ? dataView.getEntry(tableState.selection.current)
        : null;
  },
  [onSelect, dataView, tableState.selection],
);
```

### 3. Reanchor on `shift` and `reset`

In the existing `dataView.addListener` effect, add handling for view-reshuffling events:

```ts
const unsubscribe = dataView.addListener((change) => {
  if (
    change.type === 'update' &&
    latestSelectionRef.current.items.has(change.index)
  ) {
    // existing: re-fire onSelect when selected item's data changes in-place
    latestOnSelectRef.current?.(
      getSelectedItem(dataView, latestSelectionRef.current),
      getSelectedItems(dataView, latestSelectionRef.current),
    );
  } else if (
    (change.type === 'shift' && change.location === 'before') ||
    change.type === 'reset'
  ) {
    // reanchor: find the entry's new position after view reshuffled
    const entry = selectedEntryRef.current;
    if (entry != null && latestSelectionRef.current.current >= 0) {
      const newIdx = dataView.getViewIndexOfEntry(entry);
      if (newIdx >= 0 && newIdx !== latestSelectionRef.current.current) {
        dispatch({type: 'selectItem', nextIndex: newIdx, addToSelection: false, allowUnselect: false});
      }
    }
  }
});
```

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Entry filtered out after reanchor | `getViewIndexOfEntry` returns `-1` → `clearSelection` dispatched, sidebar goes blank |
| Entry deleted from data source | Same `-1` path → `clearSelection` |
| `reset` fires with no prior selection | `selectedEntryRef.current` is null → no-op |
| `shift` with `location: 'in'` or `'after'` | No index correction needed; selected row didn't shift |
| `onSelect` re-fires with same item | Callers must be idempotent — consistent with existing filter-reanchor behaviour |

---

## Testing

### Unit tests (in DataTable's existing test suite)

1. **Insert before selection (descending sort):** Create a sorted-desc data source, select item at index N, append a new record (which lands at index 0), assert `selection.current === N + 1` and `onSelect` receives the same item object.

2. **Sort flip reanchor:** Select item by ID, toggle sort direction (fires `reset`), assert selection remains on the same item at its new view index.

3. **No selection — no crash:** Verify `shift` and `reset` events with `selection.current === -1` produce no dispatch and no error.

4. **Entry filtered out:** Select item, apply filter that hides it, assert `clearSelection` is dispatched and `onSelect` is called with `undefined`.

---

## Resolves

- The long-standing TODO in `DataTableManager.tsx:292`:  
  `// TODO: fix that this doesn't jump selection if items are shifted! sorting is swapped etc`
