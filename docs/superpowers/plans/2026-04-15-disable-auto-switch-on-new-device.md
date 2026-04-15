# Disable auto-switch on new device/app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Flipper from auto-switching the active device/app selection when a new device or new app connects, unless the currently selected device is disconnected.

**Architecture:** Narrow the auto-switch conditions in the `REGISTER_DEVICE` and `NEW_CLIENT` cases of the connections reducer. `userPreferredDevice` / `userPreferredApp` remain as state but stop driving auto-switch. Client-level disconnect no longer triggers an auto-switch; only device-level disconnect does.

**Tech Stack:** TypeScript, Redux, Jest. Relevant files live under `desktop/flipper-ui/src/reducers/`. Tests are run with `yarn test` from `desktop/`.

**Spec:** `docs/superpowers/specs/2026-04-15-disable-auto-switch-on-new-device-design.md`

---

## File Structure

- **Modify** `desktop/flipper-ui/src/reducers/connections.tsx`
  - `REGISTER_DEVICE` case (~lines 221–263): change `selectNewDevice` predicate.
  - `NEW_CLIENT` case (~lines 338–369): change `selectNewClient` predicate.
- **Modify** `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx`
  - Update two existing tests that encode the old behavior.
  - Add three new tests that lock in the new behavior.

No new files. No interface changes. Tests ride alongside the code they exercise.

---

## Background: key code to understand before starting

From `desktop/flipper-ui/src/reducers/connections.tsx`:

**Current `REGISTER_DEVICE` predicate (~line 238):**
```ts
const selectNewDevice =
  !state.selectedDevice ||
  !state.selectedDevice.isConnected ||
  state.userPreferredDevice === payload.title;
```

**Current `NEW_CLIENT` predicate (~line 350):**
```ts
const selectNewClient =
  !draft.selectedAppId ||
  draft.userPreferredApp === payload.query.app ||
  draft.clients.get(draft.selectedAppId!)?.connected.get() === false;
```

`BaseDevice` exposes `isConnected` (a plain boolean getter). `state.selectedDevice` is `BaseDevice | null`. The tests use `createMockFlipperWithPlugin` to build a store with `device1`/`d1app1` pre-registered and `d1app2` created in `beforeEach`.

**Important runtime note:** When `createMockFlipperWithPlugin` initializes, it registers a device and client automatically, so `selectedDevice`/`selectedAppId` are already populated in tests. That matters because the `!draft.selectedAppId` branch in `NEW_CLIENT` would otherwise hide the behavior we're changing.

---

## Task 1: Update `REGISTER_DEVICE` auto-switch predicate

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/connections.tsx:238-241`
- Test: `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx`

- [ ] **Step 1: Write the new failing test (preferred-device name should NOT pull focus)**

Append this test inside the existing `describe(...)` block that contains `'basic/ device selection change'` (near line 350 — the block that sets up `device1`, `device2`, `d1app1`, `d1app2`, `d2app2`):

```ts
test('new device matching userPreferredDevice does NOT steal selection', async () => {
  // device1 is currently selected, d1app2 is the active client.
  // userPreferredDevice is device1.title. Create a new device with the same title.
  const device3 = mockFlipper.createDevice({serial: 'serial-3'});
  // Title on TestDevice defaults to 'MockAndroidDevice'; match it explicitly:
  (device3 as any).title = device1.title;

  // Simulate the device registering via the reducer path used in app code.
  // createDevice() above already dispatches REGISTER_DEVICE.
  expect(store.getState().connections).toMatchObject({
    selectedDevice: device1,
    selectedAppId: d1app2.id,
  });
});
```

**Note for the implementer:** If `createDevice` in the mock auto-assigns a unique title and there is no way to force a matching title, instead dispatch `REGISTER_DEVICE` directly:

```ts
import {TestDevice} from '../../devices/TestDevice';
test('new device matching userPreferredDevice does NOT steal selection', () => {
  const device3 = new TestDevice('serial-3', 'physical', device1.title, 'Android');
  store.dispatch({type: 'REGISTER_DEVICE', payload: device3});
  expect(store.getState().connections.selectedDevice).toBe(device1);
  expect(store.getState().connections.selectedAppId).toBe(d1app2.id);
});
```

Use whichever of the two shapes actually compiles — the direct-dispatch version is preferred because it has no dependency on mock internals.

- [ ] **Step 2: Run the new test to confirm it fails**

Run from `desktop/`:
```bash
yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx -t 'userPreferredDevice does NOT steal'
```
Expected: FAIL — `selectedDevice` is the new `device3` instead of `device1`, because the current predicate's third branch fires.

- [ ] **Step 3: Change the predicate in `REGISTER_DEVICE`**

In `desktop/flipper-ui/src/reducers/connections.tsx`, replace:
```ts
const selectNewDevice =
  !state.selectedDevice ||
  !state.selectedDevice.isConnected ||
  state.userPreferredDevice === payload.title;
```
with:
```ts
const selectNewDevice =
  !state.selectedDevice || !state.selectedDevice.isConnected;
```

- [ ] **Step 4: Run the new test to confirm it passes**

```bash
yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx -t 'userPreferredDevice does NOT steal'
```
Expected: PASS.

- [ ] **Step 5: Run the full connections test file to check for regressions**

```bash
yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx
```
Expected: All tests pass. The `'basic/ device selection change'` test covers the "current device disconnects → new device is selected" path and should still pass since that branch is untouched.

- [ ] **Step 6: Commit**

```bash
git add desktop/flipper-ui/src/reducers/connections.tsx \
        desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx
git commit -m "Do not auto-switch to new device just because its name matches userPreferredDevice

New device only steals selection when there is no selected device or the
selected device is already disconnected."
```

---

## Task 2: Invert the "introducing new client does select it if preferred" test

This test currently asserts the old behavior. Under the new rule, a new client whose app name matches `userPreferredApp` must NOT steal the selection while the current device is connected.

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx:295-310`

- [ ] **Step 1: Rewrite the test to assert the new behavior**

Replace the existing test (currently lines ~295–310):
```ts
test('introducing new client does select it if preferred', async () => {
  // pure testing evil
  const client3 = await mockFlipper.createClient(
    device2,
    store.getState().connections.userPreferredApp!,
  );
  expect(store.getState().connections).toMatchObject({
    selectedDevice: device2,
    selectedPlugin: TestPlugin1.id,
    selectedAppId: client3.id,
    // other prefs not updated
    userPreferredDevice: device1.title,
    userPreferredPlugin: TestPlugin1.id,
    userPreferredApp: d1app1.query.app,
  });
});
```

with:

```ts
test('introducing new client matching userPreferredApp does NOT steal selection while current device is connected', async () => {
  await mockFlipper.createClient(
    device2,
    store.getState().connections.userPreferredApp!,
  );
  expect(store.getState().connections).toMatchObject({
    selectedDevice: device1,
    selectedPlugin: TestPlugin1.id,
    selectedAppId: d1app2.id,
    userPreferredDevice: device1.title,
    userPreferredPlugin: TestPlugin1.id,
    userPreferredApp: d1app1.query.app,
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails (old code still in place)**

```bash
yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx -t 'userPreferredApp does NOT steal'
```
Expected: FAIL — selection gets pulled to `device2`/new client because of the `draft.userPreferredApp === payload.query.app` branch.

*Do not commit yet — predicate change comes in Task 3.*

---

## Task 3: Update `NEW_CLIENT` auto-switch predicate

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/connections.tsx:350-355`

- [ ] **Step 1: Change the predicate**

Replace:
```ts
const selectNewClient =
  !draft.selectedAppId ||
  draft.userPreferredApp === payload.query.app ||
  // TODO: Fix this the next time the file is edited.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  draft.clients.get(draft.selectedAppId!)?.connected.get() === false;
```
with:
```ts
const selectNewClient =
  !draft.selectedAppId ||
  !draft.selectedDevice ||
  !draft.selectedDevice.isConnected;
```

Rationale: per spec, only device-level disconnect triggers auto-switch. An app drop on a still-connected device must not pull focus.

- [ ] **Step 2: Run the Task 2 test and confirm it passes**

```bash
yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx -t 'userPreferredApp does NOT steal'
```
Expected: PASS.

---

## Task 4: Update "new client if old is offline" test to reflect device-level rule

Under the old rule, a client drop triggered a switch. Under the new rule, that only happens when the selected *device* drops. Split this into two cases.

**Files:**
- Modify: `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx:312-324`

- [ ] **Step 1: Replace the existing test with two tests**

Delete the current:
```ts
test('introducing new client does select it if old is offline', async () => {
  d1app2.disconnect();
  const client3 = await mockFlipper.createClient(device2, 'd2app3');
  expect(store.getState().connections).toMatchObject({
    selectedDevice: device2,
    selectedPlugin: TestPlugin1.id,
    selectedAppId: client3.id,
    userPreferredDevice: device1.title,
    userPreferredPlugin: TestPlugin1.id,
    userPreferredApp: d1app1.query.app,
  });
});
```

Replace with:

```ts
test('introducing new client does NOT steal selection when only the selected client dropped (device still connected)', async () => {
  d1app2.disconnect();
  await mockFlipper.createClient(device2, 'd2app3');
  expect(store.getState().connections).toMatchObject({
    selectedDevice: device1,
    selectedAppId: d1app2.id,
  });
});

test('introducing new client DOES steal selection when selected device is disconnected', async () => {
  device1.disconnect();
  const client3 = await mockFlipper.createClient(device2, 'd2app3');
  expect(store.getState().connections).toMatchObject({
    selectedDevice: device2,
    selectedAppId: client3.id,
  });
});
```

- [ ] **Step 2: Run just these two tests**

```bash
yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx -t 'introducing new client'
```
Expected: both PASS. The first passes because the `NEW_CLIENT` predicate no longer fires on client-only disconnect. The second passes because the `!selectedDevice.isConnected` branch fires.

---

## Task 5: Full test pass + commit

- [ ] **Step 1: Run the full connections test file**

```bash
cd desktop && yarn jest flipper-ui/src/reducers/__tests__/connections.node.tsx
```
Expected: all tests pass.

- [ ] **Step 2: Run the broader flipper-ui test suite to catch regressions**

```bash
cd desktop && yarn jest flipper-ui
```
Expected: all tests pass. If any test elsewhere relied on the removed `userPreferredApp`/`userPreferredDevice` auto-switch behavior, update it to match the new rule (stay on current selection) or to disconnect the current device first to trigger a switch.

- [ ] **Step 3: TypeScript check**

```bash
cd desktop && yarn tsc --noEmit -p flipper-ui/tsconfig.json
```
(If this project has a different type-check command, substitute. Expected: no new errors.)

- [ ] **Step 4: Commit**

```bash
git add desktop/flipper-ui/src/reducers/connections.tsx \
        desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx
git commit -m "Only auto-switch to new client when selected device is disconnected

Previously a new client would steal the active selection if its app name
matched userPreferredApp, or if the currently selected client had dropped
while its device was still connected. Both behaviors now removed: we only
auto-switch on device-level disconnect.

User-visible change: the 'preferred device/app' name-match auto-selection
no longer fires."
```

---

## Self-Review Summary

- **Spec coverage:** REGISTER_DEVICE change (Task 1), NEW_CLIENT change (Task 3), test cases 1–8 from the spec are covered across the modified and new tests in Tasks 1, 2, and 4. The `basic/ device selection change` test (untouched) already covers "device disconnects then new device connects → switch".
- **Placeholder scan:** none.
- **Type consistency:** `selectedDevice`, `isConnected`, `clients`, `selectedAppId`, `userPreferredDevice`, `userPreferredApp` all used consistently with their existing definitions in `connections.tsx`.
