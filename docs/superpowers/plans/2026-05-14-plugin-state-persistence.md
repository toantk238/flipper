# Plugin List & State Persistence Across Reconnects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an app reconnects with a new session ID (same app + device), automatically switch to the new client, preserve the selected plugin, and carry over queued plugin messages.

**Architecture:** A new `CLIENT_RECONNECTED` action is dispatched by both the `connections` and `pluginMessageQueue` reducers. `handleClientConnected` in `flipperServer.tsx` detects a stale client (same app+device, disconnected, different session ID) and dispatches `CLIENT_RECONNECTED` instead of `NEW_CLIENT`, triggering client replacement and message-queue re-keying atomically.

**Tech Stack:** TypeScript, Redux (Immer), Jest

---

## Background: Why the plugin list resets today

When an app disconnects, its `Client` object stays in the `clients` map (connected = false, `selectedAppId` still pointing to it). The "Application disconnected" banner appears. When the app reconnects, `handleClientConnected` is called with a **new session ID**. The existing check `connections.clients.get(id)` finds nothing (different ID), so it skips cleanup and dispatches `NEW_CLIENT`. The `NEW_CLIENT` reducer's `selectNewClient` condition is false (`selectedAppId` is non-null and the device is still connected), so the new client is **never selected**. The user remains on the stale disconnected client indefinitely until they manually click away.

---

## File Map

| File | Change |
|---|---|
| `desktop/flipper-ui/src/reducers/connections.tsx` | Add `CLIENT_RECONNECTED` to `Action` union; add reducer case |
| `desktop/flipper-ui/src/reducers/pluginMessageQueue.tsx` | Add `CLIENT_RECONNECTED` to `Action` union; add re-key case |
| `desktop/flipper-ui/src/dispatcher/flipperServer.tsx` | In `handleClientConnected`: detect stale client; dispatch `CLIENT_RECONNECTED` instead of `NEW_CLIENT` |
| `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx` | Add `CLIENT_RECONNECTED` unit test |
| `desktop/flipper-ui/src/reducers/__tests__/pluginMessageQueue.node.tsx` | Create; add re-key unit test |
| `desktop/flipper-ui/src/__tests__/disconnect.node.tsx` | Add reconnect integration test |

---

## Task 1: CLIENT_RECONNECTED in connections reducer

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/connections.tsx`
- Test: `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx`

- [ ] **Step 1: Add CLIENT_RECONNECTED to the Action union**

In `connections.tsx`, find the `Action` union type. Add after the `CLIENT_REMOVED` entry:

```typescript
| {
    type: 'CLIENT_RECONNECTED';
    payload: {
      oldClientId: string;
      newClient: Client;
    };
  }
```

- [ ] **Step 2: Write the failing test**

In `connections.node.tsx`, add at the end of the `describe` block (or as a top-level test, matching the file's style):

```typescript
test('CLIENT_RECONNECTED replaces stale client and updates selectedAppId', async () => {
  const TestPlugin = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      plugin(_client: PluginClient) {
        return {};
      },
      Component() {
        return null;
      },
    },
  );
  const {store, device, client: oldClient, createClient} =
    await createMockFlipperWithPlugin(TestPlugin);

  store.dispatch(
    selectPlugin({
      selectedPlugin: TestPlugin.id,
      selectedAppId: oldClient.id,
      selectedDevice: device,
    }),
  );
  expect(store.getState().connections.selectedAppId).toBe(oldClient.id);
  expect(store.getState().connections.selectedPlugin).toBe(TestPlugin.id);

  oldClient.disconnect();

  const newClient = await createClient(device, oldClient.query.app);

  store.dispatch({
    type: 'CLIENT_RECONNECTED',
    payload: {oldClientId: oldClient.id, newClient},
  });

  expect(store.getState().connections.clients.has(oldClient.id)).toBe(false);
  expect(store.getState().connections.clients.has(newClient.id)).toBe(true);
  expect(store.getState().connections.selectedAppId).toBe(newClient.id);
  expect(store.getState().connections.selectedPlugin).toBe(TestPlugin.id);
});
```

- [ ] **Step 3: Run to confirm it fails**

```bash
cd desktop && yarn jest --testPathPattern "reducers/__tests__/connections.node" --testNamePattern "CLIENT_RECONNECTED replaces stale client" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — TypeScript error on unhandled action type.

- [ ] **Step 4: Implement CLIENT_RECONNECTED case in the connections reducer**

In `connections.tsx`, add before `default:` in the reducer switch:

```typescript
case 'CLIENT_RECONNECTED': {
  const {oldClientId, newClient} = action.payload;
  return produce(state, (draft) => {
    draft.clients.delete(oldClientId);
    draft.clients.set(newClient.id, newClient);
    if (draft.selectedAppId === oldClientId) {
      draft.selectedAppId = newClient.id;
    }
    const unitialisedIndex = draft.uninitializedClients.findIndex(
      (c) =>
        c.deviceName === newClient.query.device ||
        c.appName === newClient.query.app,
    );
    if (unitialisedIndex !== -1) {
      draft.uninitializedClients.splice(unitialisedIndex, 1);
    }
  });
}
```

- [ ] **Step 5: Run to confirm it passes**

```bash
cd desktop && yarn jest --testPathPattern "reducers/__tests__/connections.node" --testNamePattern "CLIENT_RECONNECTED replaces stale client" --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add desktop/flipper-ui/src/reducers/connections.tsx \
        desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx
git commit -m "feat(connections): handle CLIENT_RECONNECTED to replace stale client and restore selection"
```

---

## Task 2: CLIENT_RECONNECTED re-keys pluginMessageQueue

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/pluginMessageQueue.tsx`
- Create: `desktop/flipper-ui/src/reducers/__tests__/pluginMessageQueue.node.tsx`

- [ ] **Step 1: Add CLIENT_RECONNECTED to the pluginMessageQueue Action union**

In `pluginMessageQueue.tsx`, find the `Action` union. Add:

```typescript
| {
    type: 'CLIENT_RECONNECTED';
    payload: {
      oldClientId: string;
      newClient: {id: string};
    };
  }
```

- [ ] **Step 2: Write the failing test**

Create `desktop/flipper-ui/src/reducers/__tests__/pluginMessageQueue.node.tsx`:

```typescript
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import reducer, {State} from '../pluginMessageQueue';

test('CLIENT_RECONNECTED re-keys queued messages from old to new client ID', () => {
  // Client IDs contain '#' themselves; pluginKeys are ${clientId}#${pluginName}
  const oldClientId = 'com.example.app#device-serial#old-session';
  const newClientId = 'com.example.app#device-serial#new-session';

  const initial: State = {
    [`${oldClientId}#Network`]: [{method: 'networkRequest', rawSize: 100}],
    [`${oldClientId}#Layout`]: [{method: 'layoutUpdate', rawSize: 50}],
    'other.app#device-serial#session1#Logs': [{method: 'log', rawSize: 20}],
  };

  const next = reducer(initial, {
    type: 'CLIENT_RECONNECTED',
    payload: {oldClientId, newClient: {id: newClientId}},
  });

  // Old keys removed
  expect(next[`${oldClientId}#Network`]).toBeUndefined();
  expect(next[`${oldClientId}#Layout`]).toBeUndefined();
  // Re-keyed to new client
  expect(next[`${newClientId}#Network`]).toEqual([{method: 'networkRequest', rawSize: 100}]);
  expect(next[`${newClientId}#Layout`]).toEqual([{method: 'layoutUpdate', rawSize: 50}]);
  // Unrelated client untouched
  expect(next['other.app#device-serial#session1#Logs']).toEqual([{method: 'log', rawSize: 20}]);
});
```

- [ ] **Step 3: Run to confirm it fails**

```bash
cd desktop && yarn jest --testPathPattern "reducers/__tests__/pluginMessageQueue.node" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — action not handled.

- [ ] **Step 4: Implement CLIENT_RECONNECTED case in pluginMessageQueue**

In `pluginMessageQueue.tsx`, add before `default:`. `deconstructPluginKey` is already imported from `flipper-common` at the top of this file:

```typescript
case 'CLIENT_RECONNECTED': {
  const {oldClientId, newClient} = action.payload;
  const result: State = {};
  for (const pluginKey of Object.keys(state)) {
    const {client: keyClientId, pluginName} = deconstructPluginKey(pluginKey);
    if (keyClientId === oldClientId) {
      result[`${newClient.id}#${pluginName}`] = state[pluginKey];
    } else {
      result[pluginKey] = state[pluginKey];
    }
  }
  return result;
}
```

- [ ] **Step 5: Run to confirm it passes**

```bash
cd desktop && yarn jest --testPathPattern "reducers/__tests__/pluginMessageQueue.node" --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add desktop/flipper-ui/src/reducers/pluginMessageQueue.tsx \
        desktop/flipper-ui/src/reducers/__tests__/pluginMessageQueue.node.tsx
git commit -m "feat(pluginMessageQueue): re-key queued messages on CLIENT_RECONNECTED"
```

---

## Task 3: Dispatch CLIENT_RECONNECTED from flipperServer

**Files:**
- Modify: `desktop/flipper-ui/src/dispatcher/flipperServer.tsx`
- Test: `desktop/flipper-ui/src/__tests__/disconnect.node.tsx`

- [ ] **Step 1: Write the failing integration test**

In `disconnect.node.tsx`, add a new test. Follow the import and setup style of the existing tests in that file (`{store, device, client, createClient, logger}` come from `createMockFlipperWithPlugin`; `server` is created with `TestUtils.createFlipperServerMock`):

```typescript
test('reconnecting app with new session ID auto-selects new client and re-keys message queue', async () => {
  const plugin = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      plugin(_client: PluginClient) {
        return {};
      },
      Component() {
        return null;
      },
    },
  );

  const {store, device, client: client1, createClient, logger} =
    await createMockFlipperWithPlugin(plugin, {asBackgroundPlugin: true});

  const server = TestUtils.createFlipperServerMock({
    'client-request-response': async () => ({success: [], length: 0}),
  });

  // Select plugin on initial client
  store.dispatch(
    selectPlugin({
      selectedPlugin: plugin.id,
      selectedAppId: client1.id,
      selectedDevice: device,
    }),
  );

  // Simulate a queued background message for the old session
  const oldPluginKey = `${client1.id}#${plugin.id}`;
  store.dispatch({
    type: 'QUEUE_MESSAGES',
    payload: {
      pluginKey: oldPluginKey,
      messages: [{method: 'backgroundEvent', rawSize: 10}],
      maxQueueSize: 1000,
    },
  });

  // App disconnects — client stays in map, connected = false
  client1.disconnect();
  expect(client1.connected.get()).toBe(false);
  expect(store.getState().connections.clients.has(client1.id)).toBe(true);

  // App reconnects with a new session (new ID, same app + device)
  const client2 = await createClient(device, client1.query.app);
  await handleClientConnected(server, store, logger, client2);

  // New client should be selected
  expect(store.getState().connections.selectedAppId).toBe(client2.id);
  // Selected plugin preserved across reconnect
  expect(store.getState().connections.selectedPlugin).toBe(plugin.id);
  // Old stale client removed from map
  expect(store.getState().connections.clients.has(client1.id)).toBe(false);
  // Queued messages re-keyed from old to new client
  expect(store.getState().pluginMessageQueue[oldPluginKey]).toBeUndefined();
  expect(
    store.getState().pluginMessageQueue[`${client2.id}#${plugin.id}`],
  ).toEqual([{method: 'backgroundEvent', rawSize: 10}]);
});
```

- [ ] **Step 2: Add `selectPlugin` to the imports in `disconnect.node.tsx` if not already there**

Check the imports at the top of `disconnect.node.tsx`. If `selectPlugin` is not imported, add:

```typescript
import {selectPlugin} from '../reducers/connections';
```

- [ ] **Step 3: Run to confirm the test fails**

```bash
cd desktop && yarn jest --testPathPattern "disconnect.node" --testNamePattern "reconnecting app with new session ID" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `selectedAppId` still points to `client1`, queue not re-keyed.

- [ ] **Step 4: Update handleClientConnected in flipperServer.tsx**

In `handleClientConnected`, find the line:

```typescript
  store.dispatch({
    type: 'NEW_CLIENT',
    payload: client,
  });
```

Replace it with:

```typescript
  // Detect a stale client: same app + device but a prior (now disconnected) session.
  // This happens on normal app restarts where the session ID changes.
  const staleClient = existingClient
    ? undefined
    : Array.from(store.getState().connections.clients.values()).find(
        (c) =>
          c.query.app === query.app &&
          c.query.device_id === query.device_id &&
          !c.connected.get(),
      );

  if (staleClient) {
    store.dispatch({
      type: 'CLIENT_RECONNECTED',
      payload: {oldClientId: staleClient.id, newClient: client},
    });
  } else {
    store.dispatch({
      type: 'NEW_CLIENT',
      payload: client,
    });
  }
```

- [ ] **Step 5: Run to confirm the test passes**

```bash
cd desktop && yarn jest --testPathPattern "disconnect.node" --testNamePattern "reconnecting app with new session ID" --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add desktop/flipper-ui/src/dispatcher/flipperServer.tsx \
        desktop/flipper-ui/src/__tests__/disconnect.node.tsx
git commit -m "feat(dispatcher): detect app reconnect and dispatch CLIENT_RECONNECTED to restore selection and state"
```

---

## Task 4: Full test suite — verify no regressions

- [ ] **Step 1: Run all affected test files**

```bash
cd desktop && yarn jest --testPathPattern "connections.node|disconnect.node|pluginMessageQueue|sandyplugins" --no-coverage 2>&1 | tail -40
```

- [ ] **Step 2: Fix any failures**

Failures most likely to appear:

- A test that creates a second client for the same app+device (simulating a reconnect) and expects `NEW_CLIENT` behaviour (e.g. `selectedAppId` still the old client) — update the assertion to expect `selectedAppId === newClient.id` and `oldClient` removed from map.
- A test that expects a stale client to remain in the map after a same-app reconnect — update to expect it gone (replaced by the new client).

For each failure: read the test, understand its original intent, update the assertion to reflect the new correct behaviour, re-run the single test to confirm it passes, then move on.

- [ ] **Step 3: Run the full desktop test suite**

```bash
cd desktop && yarn jest --no-coverage 2>&1 | grep -E "Tests:|Test Suites:|FAIL" | tail -20
```

Expected: all suites pass. If any unrelated pre-existing failures appear, confirm they exist on `main` before treating them as regressions.

- [ ] **Step 4: Commit any test fixes**

```bash
git add -p
git commit -m "test: update tests for CLIENT_RECONNECTED auto-select behaviour"
```
