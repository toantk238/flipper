# Stable Selection in DataTable on Streaming Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the selected row in DataTable from silently shifting to a different item when new rows are inserted above it (sort: newest-to-top) or when the sort order changes.

**Architecture:** Add a `selectedEntryRef` (`useRef`) in `DataTable.tsx` and `DataTableWithPowerSearch.tsx` that stores the currently-selected internal `Entry<T>` object. Extend the existing `dataView.addListener` handler to catch `shift` (insert before selection) and `reset` (sort/filter change) events; on each, look up the entry's new view index via `dataView.getViewIndexOfEntry(entry)` and silently reanchor `selection.current` — without re-firing `onSelect` with a different item.

**Tech Stack:** React (`useRef`, `useEffect`, `useReducer`), Flipper `DataSourceView`, `@testing-library/react`, Jest.

---

### Task 1: Write failing tests

**Files:**
- Modify: `desktop/flipper-plugin/src/ui/data-table/__tests__/DataTable.node.tsx`

- [ ] **Step 1: Append three new test cases at the end of `DataTable.node.tsx`**

```tsx
test('selection reanchors when item inserted before it in descending-sorted view', async () => {
  type Item = {id: number; label: string};
  const ds = createDataSource<Item, 'id'>(
    [
      {id: 1, label: 'one'},
      {id: 2, label: 'two'},
    ],
    {key: 'id'},
  );
  ds.view.setSortBy('id');
  ds.view.setReversed(true); // descending: [id=2 (view 0), id=1 (view 1)]

  const onSelect = jest.fn();
  const ref = createRef<DataTableManager<Item>>();
  const itemColumns: DataTableColumn<Item>[] = [
    {key: 'id', wrap: false},
    {key: 'label', wrap: false},
  ];

  render(
    <DataTable
      dataSource={ds}
      columns={itemColumns}
      tableManagerRef={ref}
      onSelect={onSelect}
    />,
  );

  // Select view index 1 (id=1, the bottom row)
  act(() => {
    ref.current!.selectItem(1);
  });
  expect(onSelect).toHaveBeenLastCalledWith(
    {id: 1, label: 'one'},
    [{id: 1, label: 'one'}],
  );

  // Append id=3 → descending: [id=3 (view 0), id=2 (view 1), id=1 (view 2)]
  // Bug: selection stays at index 1 → now shows id=2 (wrong)
  // Fix: selection moves to index 2 → still shows id=1 (correct)
  act(() => {
    ds.append({id: 3, label: 'three'});
  });

  expect(onSelect).toHaveBeenLastCalledWith(
    {id: 1, label: 'one'},
    [{id: 1, label: 'one'}],
  );
});

test('selection reanchors after sort order change (reset event)', async () => {
  type Item = {id: number; label: string};
  const ds = createDataSource<Item, 'id'>(
    [
      {id: 1, label: 'one'},
      {id: 2, label: 'two'},
      {id: 3, label: 'three'},
    ],
    {key: 'id'},
  );

  const onSelect = jest.fn();
  const ref = createRef<DataTableManager<Item>>();
  const itemColumns: DataTableColumn<Item>[] = [
    {key: 'id', wrap: false},
    {key: 'label', wrap: false},
  ];

  render(
    <DataTable
      dataSource={ds}
      columns={itemColumns}
      tableManagerRef={ref}
      onSelect={onSelect}
    />,
  );

  // No sort: insertion order [id=1 (view 0), id=2 (view 1), id=3 (view 2)]
  // Select view index 2 (id=3)
  act(() => {
    ref.current!.selectItem(2);
  });
  expect(onSelect).toHaveBeenLastCalledWith(
    {id: 3, label: 'three'},
    [{id: 3, label: 'three'}],
  );

  // Sort descending → [id=3 (view 0), id=2 (view 1), id=1 (view 2)]
  // Bug: selection stays at index 2 → now shows id=1 (wrong)
  // Fix: selection moves to index 0 → still shows id=3 (correct)
  act(() => {
    ref.current!.sortColumn('id', 'desc');
  });

  expect(onSelect).toHaveBeenLastCalledWith(
    {id: 3, label: 'three'},
    [{id: 3, label: 'three'}],
  );
});

test('shift and reset events with no prior selection are a no-op', () => {
  type Item = {id: number; label: string};
  const ds = createDataSource<Item, 'id'>(
    [
      {id: 1, label: 'one'},
      {id: 2, label: 'two'},
    ],
    {key: 'id'},
  );
  ds.view.setSortBy('id');
  ds.view.setReversed(true);

  const onSelect = jest.fn();
  const ref = createRef<DataTableManager<Item>>();
  const itemColumns: DataTableColumn<Item>[] = [
    {key: 'id', wrap: false},
    {key: 'label', wrap: false},
  ];

  render(
    <DataTable
      dataSource={ds}
      columns={itemColumns}
      tableManagerRef={ref}
      onSelect={onSelect}
    />,
  );

  // No selection. Append and sort — must not crash or call onSelect.
  expect(() => {
    act(() => {
      ds.append({id: 3, label: 'three'});
    });
    act(() => {
      ref.current!.sortColumn('id', 'asc');
    });
  }).not.toThrow();
  expect(onSelect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn jest flipper-plugin/src/ui/data-table/__tests__/DataTable.node.tsx -t 'reanchors'
```

Expected: tests 1 and 2 FAIL (wrong item in `onSelect`). Test 3 may pass or fail.

---

### Task 2: Implement reanchor in `DataTable.tsx`

**Files:**
- Modify: `desktop/flipper-plugin/src/ui/data-table/DataTable.tsx` — lines 202–220 (addListener) and 462–474 (triggerSelection)

- [ ] **Step 1: Declare `selectedEntryRef` right after `latestOnSelectRef` (line 203) and extend the `addListener` effect**

Find this block (lines 202–220):

```ts
  const latestSelectionRef = useLatestRef(selection);
  const latestOnSelectRef = useLatestRef(onSelect);
  useEffect(() => {
    if (dataView) {
      const unsubscribe = dataView.addListener((change) => {
        if (
          change.type === 'update' &&
          latestSelectionRef.current.items.has(change.index)
        ) {
          latestOnSelectRef.current?.(
            getSelectedItem(dataView, latestSelectionRef.current),
            getSelectedItems(dataView, latestSelectionRef.current),
          );
        }
      });

      return unsubscribe;
    }
  }, [dataView, latestSelectionRef, latestOnSelectRef]);
```

Replace it with:

```ts
  const latestSelectionRef = useLatestRef(selection);
  const latestOnSelectRef = useLatestRef(onSelect);
  const selectedEntryRef = useRef<ReturnType<typeof dataView.getEntry> | null>(null);
  useEffect(() => {
    if (dataView) {
      const unsubscribe = dataView.addListener((change) => {
        if (
          change.type === 'update' &&
          latestSelectionRef.current.items.has(change.index)
        ) {
          latestOnSelectRef.current?.(
            getSelectedItem(dataView, latestSelectionRef.current),
            getSelectedItems(dataView, latestSelectionRef.current),
          );
        } else if (
          (change.type === 'shift' && change.location === 'before') ||
          change.type === 'reset'
        ) {
          const entry = selectedEntryRef.current;
          if (entry != null && latestSelectionRef.current.current >= 0) {
            const newIdx = dataView.getViewIndexOfEntry(entry);
            if (newIdx === -1) {
              dispatch({type: 'clearSelection'});
            } else if (newIdx !== latestSelectionRef.current.current) {
              dispatch({
                type: 'selectItem',
                nextIndex: newIdx,
                addToSelection: false,
                allowUnselect: false,
              });
            }
          }
        }
      });

      return unsubscribe;
    }
  }, [dataView, latestSelectionRef, latestOnSelectRef]);
```

- [ ] **Step 2: Update `triggerSelection` to keep `selectedEntryRef` current (line 462)**

Find this block (lines 462–474):

```ts
  const isMounted = useRef(false);
  useEffect(
    function triggerSelection() {
      if (isMounted.current) {
        onSelect?.(
          getSelectedItem(dataView, tableState.selection),
          getSelectedItems(dataView, tableState.selection),
        );
      }
      isMounted.current = true;
    },
    [onSelect, dataView, tableState.selection],
  );
```

Replace it with:

```ts
  const isMounted = useRef(false);
  useEffect(
    function triggerSelection() {
      if (isMounted.current) {
        onSelect?.(
          getSelectedItem(dataView, tableState.selection),
          getSelectedItems(dataView, tableState.selection),
        );
      }
      isMounted.current = true;
      selectedEntryRef.current =
        tableState.selection.current >= 0
          ? dataView.getEntry(tableState.selection.current)
          : null;
    },
    [onSelect, dataView, tableState.selection],
  );
```

---

### Task 3: Run tests to verify the fix

- [ ] **Step 1: Run the three new tests**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn jest flipper-plugin/src/ui/data-table/__tests__/DataTable.node.tsx -t 'reanchors'
```

Expected: all 3 PASS.

- [ ] **Step 2: Run the full DataTable test suite for regressions**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn jest flipper-plugin/src/ui/data-table/__tests__/DataTable.node.tsx
```

Expected: all existing tests PASS.

---

### Task 4: Mirror changes in `DataTableWithPowerSearch.tsx`

**Files:**
- Modify: `desktop/flipper-plugin/src/ui/data-table/DataTableWithPowerSearch.tsx` — lines 310–328 (addListener) and 788–800 (triggerSelection)

- [ ] **Step 1: Declare `selectedEntryRef` and extend the `addListener` effect (line 310)**

Find this block (lines 310–328):

```ts
  const latestSelectionRef = useLatestRef(selection);
  const latestOnSelectRef = useLatestRef(onSelect);
  useEffect(() => {
    if (dataView) {
      const unsubscribe = dataView.addListener((change) => {
        if (
          change.type === 'update' &&
          latestSelectionRef.current.items.has(change.index)
        ) {
          latestOnSelectRef.current?.(
            getSelectedItem(dataView, latestSelectionRef.current),
            getSelectedItems(dataView, latestSelectionRef.current),
          );
        }
      });

      return unsubscribe;
    }
  }, [dataView, latestSelectionRef, latestOnSelectRef]);
```

Replace it with:

```ts
  const latestSelectionRef = useLatestRef(selection);
  const latestOnSelectRef = useLatestRef(onSelect);
  const selectedEntryRef = useRef<ReturnType<typeof dataView.getEntry> | null>(null);
  useEffect(() => {
    if (dataView) {
      const unsubscribe = dataView.addListener((change) => {
        if (
          change.type === 'update' &&
          latestSelectionRef.current.items.has(change.index)
        ) {
          latestOnSelectRef.current?.(
            getSelectedItem(dataView, latestSelectionRef.current),
            getSelectedItems(dataView, latestSelectionRef.current),
          );
        } else if (
          (change.type === 'shift' && change.location === 'before') ||
          change.type === 'reset'
        ) {
          const entry = selectedEntryRef.current;
          if (entry != null && latestSelectionRef.current.current >= 0) {
            const newIdx = dataView.getViewIndexOfEntry(entry);
            if (newIdx === -1) {
              dispatch({type: 'clearSelection'});
            } else if (newIdx !== latestSelectionRef.current.current) {
              dispatch({
                type: 'selectItem',
                nextIndex: newIdx,
                addToSelection: false,
                allowUnselect: false,
              });
            }
          }
        }
      });

      return unsubscribe;
    }
  }, [dataView, latestSelectionRef, latestOnSelectRef]);
```

- [ ] **Step 2: Update `triggerSelection` to keep `selectedEntryRef` current (line 788)**

Find this block (lines 788–800):

```ts
  const isMounted = useRef(false);
  useEffect(
    function triggerSelection() {
      if (isMounted.current) {
        onSelect?.(
          getSelectedItem(dataView, tableState.selection),
          getSelectedItems(dataView, tableState.selection),
        );
      }
      isMounted.current = true;
    },
    [onSelect, dataView, tableState.selection],
  );
```

Replace it with:

```ts
  const isMounted = useRef(false);
  useEffect(
    function triggerSelection() {
      if (isMounted.current) {
        onSelect?.(
          getSelectedItem(dataView, tableState.selection),
          getSelectedItems(dataView, tableState.selection),
        );
      }
      isMounted.current = true;
      selectedEntryRef.current =
        tableState.selection.current >= 0
          ? dataView.getEntry(tableState.selection.current)
          : null;
    },
    [onSelect, dataView, tableState.selection],
  );
```

---

### Task 5: Run full data-table test suite

- [ ] **Step 1: Run all tests under the data-table directory**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn jest flipper-plugin/src/ui/data-table/
```

Expected: all tests PASS.

---

### Task 6: Commit

- [ ] **Step 1: Stage and commit**

```bash
git -C /Users/mbhealth/Workspace/flipper add \
  desktop/flipper-plugin/src/ui/data-table/DataTable.tsx \
  desktop/flipper-plugin/src/ui/data-table/DataTableWithPowerSearch.tsx \
  desktop/flipper-plugin/src/ui/data-table/__tests__/DataTable.node.tsx

git -C /Users/mbhealth/Workspace/flipper commit -m "$(cat <<'EOF'
fix(data-table): reanchor selection by entry on view reshuffles

When sorted descending and new rows arrive at the top, selection.current
(a view index) silently drifted to a different item. Track the selected
Entry<T> in selectedEntryRef; on shift-before and reset events, look up
its new view index via getViewIndexOfEntry and dispatch a silent
selectItem to reanchor.

Fixes the long-standing TODO in DataTableManager.tsx:292.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected output: 3 files changed.
