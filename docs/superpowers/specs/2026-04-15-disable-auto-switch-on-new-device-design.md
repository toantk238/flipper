# Disable auto-switch to new device/app unless current device is disconnected

**Date:** 2026-04-15
**Scope:** `desktop/flipper-ui` connections reducer

## Problem

When a new device (or a new app on any device) connects to Flipper, the UI can auto-switch the active selection away from what the user is currently inspecting. The user wants to stay on their current selection unless the device they're on has actually gone away.

## Rule

Auto-switch to a newly connecting device/app **only** when the currently selected device is disconnected (or nothing is selected). An app-level disconnect on a still-connected device must **not** trigger an auto-switch.

## Current behavior

In `desktop/flipper-ui/src/reducers/connections.tsx`:

- **`REGISTER_DEVICE`** (lines ~238–261) auto-switches if:
  1. no device is selected, or
  2. the selected device is disconnected, or
  3. `userPreferredDevice === payload.title` (the new device's name matches the last manually-selected device name).

- **`NEW_CLIENT`** (lines ~350–360) auto-switches if:
  1. no app is selected, or
  2. `userPreferredApp === payload.query.app`, or
  3. the currently selected client is disconnected.

Conditions (3) under `REGISTER_DEVICE` and (2) under `NEW_CLIENT` can pull focus away from a live selection. Condition (3) under `NEW_CLIENT` triggers on client-level disconnect even when the device is still alive.

## New behavior

### `REGISTER_DEVICE`

Auto-switch only when:
- no device is selected, **or**
- `!state.selectedDevice.isConnected`.

Remove the `userPreferredDevice === payload.title` branch.

### `NEW_CLIENT`

Auto-switch only when:
- no app is selected (`!draft.selectedAppId`), **or**
- the currently selected **device** is disconnected (`draft.selectedDevice && !draft.selectedDevice.isConnected`, or no device selected).

Remove the `userPreferredApp === payload.query.app` branch. Replace the client-level disconnect check with a device-level check, per the rule.

### State fields

`userPreferredDevice` and `userPreferredApp` remain in state and continue to be set on manual selection (`SELECT_PLUGIN`, `SELECT_CLIENT`). They simply no longer drive auto-switch on connect events. No migration needed.

## Files touched

- `desktop/flipper-ui/src/reducers/connections.tsx` — edit `REGISTER_DEVICE` and `NEW_CLIENT` cases.
- `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx` — update affected tests and add new ones.

## Test cases

1. New device connects while current device is still connected → selection unchanged.
2. Current device disconnects, then new device connects → switch to the new device.
3. No device selected, new device connects → select it.
4. A previously-preferred device (by name) reconnects while current device is live → **no** switch. *(Behavior change.)*
5. New app connects on a different device while current device is still connected → selection unchanged.
6. Current device disconnects, new app connects on a new device → switch to that app/device.
7. A previously-preferred app (by name) connects while current device is live → **no** switch. *(Behavior change.)*
8. The currently selected app/client drops but its device is still connected → selection unchanged; no auto-switch to other apps.

## Risks

- User-visible behavior change: users who relied on "preferred device/app" auto-reselection will notice. Call this out in the commit message.
- `selectedAppId` may point at a disconnected client while the device is still connected. This is already a valid state elsewhere in the codebase; no new handling required.

## Out of scope

- No new user-facing setting to toggle this behavior.
- No changes to `SELECT_PLUGIN` / `SELECT_CLIENT` / `UNREGISTER_DEVICE` / `CLIENT_REMOVED`.
- No refactor of `userPreferredDevice` / `userPreferredApp` (they stay, unused by auto-switch).
