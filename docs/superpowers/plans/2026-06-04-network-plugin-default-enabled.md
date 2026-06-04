# Network Plugin Default-Enabled Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-enable the Network plugin for every new app (client) that connects to Flipper for the first time, without re-enabling it after a user disables it.

**Architecture:** The Redux connections reducer initializes `enabledPlugins[app]` to `['Network']` inside the `NEW_CLIENT` case when the key is absent (first connection). The key is `query.app` (app name), which is the same key used throughout the enable/disable flow. Reconnects, user-disabled state, and apps that don't support Network are all handled automatically by the existing machinery.

**Tech Stack:** TypeScript, Redux (via Immer `produce`), Jest

---

## File Map

| Role | Path |
|---|---|
| Modify (implementation) | `desktop/flipper-ui/src/reducers/connections.tsx` |
| Modify (tests) | `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx` |

---

### Task 1: Write Failing Tests

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx`

The test file already imports `reducer` and `TestDevice`. We add two new top-level `test()` blocks at the end of the file.

- [ ] **Step 1: Open the test file and add two tests at the bottom**

Append after the last test in `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx`:

```typescript
test('NEW_CLIENT initializes Network as enabled for first-time apps', () => {
  const device = new TestDevice('serial-1', 'emulator', 'Test', 'Android');
  const mockClient = {
    id: 'com.example.MyApp#Android#serial-1',
    query: {
      app: 'com.example.MyApp',
      os: 'Android' as const,
      device: 'Test',
      device_id: 'serial-1',
      medium: 1,
    },
    device,
  } as any;

  let state = reducer(undefined, {type: 'REGISTER_DEVICE', payload: device});
  state = reducer(state, {type: 'NEW_CLIENT', payload: mockClient});

  expect(state.enabledPlugins['com.example.MyApp']).toEqual(['Network']);
});

test('NEW_CLIENT does not re-enable Network after user has disabled it', () => {
  const device = new TestDevice('serial-1', 'emulator', 'Test', 'Android');
  const mockClient = {
    id: 'com.example.MyApp#Android#serial-1',
    query: {
      app: 'com.example.MyApp',
      os: 'Android' as const,
      device: 'Test',
      device_id: 'serial-1',
      medium: 1,
    },
    device,
  } as any;

  // First connection — Network auto-enabled
  let state = reducer(undefined, {type: 'REGISTER_DEVICE', payload: device});
  state = reducer(state, {type: 'NEW_CLIENT', payload: mockClient});
  expect(state.enabledPlugins['com.example.MyApp']).toContain('Network');

  // User disables Network
  state = reducer(state, {
    type: 'SET_PLUGIN_DISABLED',
    payload: {pluginId: 'Network', selectedApp: 'com.example.MyApp'},
  });
  expect(state.enabledPlugins['com.example.MyApp']).not.toContain('Network');

  // Reconnect — must NOT re-enable Network
  state = reducer(state, {type: 'NEW_CLIENT', payload: mockClient});
  expect(state.enabledPlugins['com.example.MyApp']).not.toContain('Network');
});
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern='reducers/__tests__/connections.node' --runInBand 2>&1 | tail -30
```

Expected: Both new tests fail. The first fails because `enabledPlugins['com.example.MyApp']` is `undefined` (not `['Network']`). The second fails for the same reason (first `toContain` assertion).

- [ ] **Step 3: Commit the failing tests**

```bash
git add desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx
git commit -m "test(connections): add failing tests for Network auto-enable on first client connection"
```

---

### Task 2: Implement the Change

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/connections.tsx` — `NEW_CLIENT` case (lines ~347–379)

- [ ] **Step 1: Add the initializer inside the `NEW_CLIENT` produce block**

In `desktop/flipper-ui/src/reducers/connections.tsx`, find the `NEW_CLIENT` case. It currently ends just before the closing `});` of the `produce` call. Add the three highlighted lines:

```typescript
    case 'NEW_CLIENT': {
      const {payload} = action;

      return produce(state, (draft) => {
        if (draft.clients.has(payload.id)) {
          console.warn(
            `Received a new connection for client ${payload.id}, but the old connection was not cleaned up`,
          );
        }
        draft.clients.set(payload.id, payload);

        const selectNewClient =
          !draft.selectedAppId ||
          !draft.selectedDevice ||
          !draft.selectedDevice.isConnected;

        if (selectNewClient) {
          draft.selectedAppId = payload.id;
          draft.selectedDevice = payload.device;
        }

        const unitialisedIndex = draft.uninitializedClients.findIndex(
          (c) =>
            c.deviceName === payload.query.device ||
            c.appName === payload.query.app,
        );
        if (unitialisedIndex !== -1)
          draft.uninitializedClients.splice(unitialisedIndex, 1);

        if (!draft.enabledPlugins[payload.query.app]) {
          draft.enabledPlugins[payload.query.app] = ['Network'];
        }
      });
    }
```

The only addition is the final `if` block. Nothing else changes.

- [ ] **Step 2: Run the tests — verify they pass**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern='reducers/__tests__/connections.node' --runInBand 2>&1 | tail -30
```

Expected: All tests pass, including the two new ones.

- [ ] **Step 3: Commit the implementation**

```bash
git add desktop/flipper-ui/src/reducers/connections.tsx
git commit -m "feat(connections): auto-enable Network plugin for first-time app connections"
```
