# Design: Plugin List & State Persistence Across Reconnects

**Date:** 2026-05-14
**Branch:** v2.0

## Problem

When an app disconnects and reconnects, two things reset in a way that interrupts the user's workflow:

1. **Plugin list + focused plugin**: The sidebar briefly loses all app plugins (only device plugins remain) during the disconnect window, and occasionally the selected plugin is lost entirely.
2. **Plugin data (e.g. network requests)**: The new session starts with a blank slate — all previously captured network requests disappear.

The root cause is that `CLIENT_REMOVED` hard-deletes the client from the `clients` map and nulls `selectedAppId`. When a new client reconnects it gets a new `clientId`, so both the UI selection state and the plugin state keys are invalidated.

## Goals

- Plugin list and currently focused plugin remain stable throughout app disconnect/reconnect cycles
- Plugin data (network requests, etc.) accumulates across reconnects for the same app on the same device
- No changes required inside individual plugins

## Non-Goals

- Persisting state across Flipper restarts
- Preserving state when the user explicitly switches to a different app or device

## Design

### Approach: Soft-delete clients

Instead of hard-deleting the client from the `clients` map on `CLIENT_REMOVED`, leave it in place. The `client.connected` observable (which already exists on `Client`) becomes `false` at the moment of disconnect — all components that render "Application disconnected" banners already react to this observable and require no changes.

### Reducer changes (`connections.tsx`)

**`CLIENT_REMOVED`**

Simplified to a no-op for the `clients` map and `selectedAppId`. The client remains in the map as a stale entry. `selectedAppId` is not cleared.

Before:
```ts
case 'CLIENT_REMOVED': {
  return produce(state, (draft) => {
    draft.clients.delete(payload);
    if (draft.selectedAppId === payload) {
      draft.selectedAppId = null;
    }
  });
}
```

After:
```ts
case 'CLIENT_REMOVED': {
  // Client stays in map; client.connected observable already signals disconnection.
  return state;
}
```

**`NEW_CLIENT`**

When a new client arrives for the same `appName + deviceSerial` as an existing (stale) client:
1. Identify the stale client by matching `client.query.app + client.query.device_id`
2. Remove the stale client from the map
3. Add the new client under its new ID
4. Update `selectedAppId` to the new client's ID if the stale client was selected
5. Copy plugin state from the old client's keys to the new client's keys (see below)

The auto-select logic (`selectNewClient`) is updated: instead of checking `!draft.selectedAppId`, also check whether the selected client is disconnected.

**`UNREGISTER_DEVICE`**

Bulk-removes all clients (connected or stale) for the unregistered device from the `clients` map. This is the primary hard-delete path.

### Plugin state inheritance (`pluginMessageQueue` reducer)

Plugin state is held in the `pluginMessageQueue` reducer as `{ [pluginKey: string]: Message[] }`, where `pluginKey` encodes `clientId + pluginId`.

There is an existing `CLEAR_CLIENT_PLUGINS_STATE` action that wipes all entries for a given `clientId`. This action must **not** be dispatched when a client disconnects under the new design — the dispatcher that currently fires it on disconnect must be updated to skip this dispatch (or skip it specifically when the disconnected client was the selected client).

When `NEW_CLIENT` replaces a stale client, a new `RENAME_CLIENT_PLUGIN_STATE` action (or equivalent inline logic) is dispatched to the `pluginMessageQueue` reducer that:

1. Collects all entries whose key starts with `oldClientId#`
2. Re-keys each to `newClientId#pluginId`
3. Drops the old entries

The result: network requests and any other queued plugin messages carry over to the new session. New messages from the reconnected session are appended to the inherited queue.

### Cleanup rules

| Trigger | Effect |
|---|---|
| `UNREGISTER_DEVICE` | All clients (including stale) for that device are removed |
| `NEW_CLIENT` for same app+device | Stale client is replaced by new one |
| User selects a different app | `SELECT_CLIENT` cleans up the previously stale client entry from the map |
| Flipper restart | State is not persisted; nothing to clean up |

No timeout-based cleanup is added.

### Edge cases

**Multiple apps on the same device**: Each app has its own client entry. Only the stale client for the selected app is preserved; others follow the existing lifecycle.

**New build with different plugin set**: When the new client replaces the stale one, plugin state is copied as-is. Orphaned state entries for plugins the new build no longer supports are harmless — they are never accessed.

**Device-level disconnect (USB unplug)**: `UNREGISTER_DEVICE` fires and cleans up all clients for that device. When the device reconnects, `REGISTER_DEVICE` + `NEW_CLIENT` fire as before; no stale state is inherited because cleanup already ran.

## Files Affected

- `desktop/flipper-ui/src/reducers/connections.tsx` — `CLIENT_REMOVED`, `NEW_CLIENT`, `UNREGISTER_DEVICE`, `SELECT_CLIENT` cases
- `desktop/flipper-ui/src/reducers/pluginMessageQueue.tsx` — add re-key logic on client replace; suppress `CLEAR_CLIENT_PLUGINS_STATE` on disconnect
- `desktop/flipper-ui/src/dispatcher/` — find and suppress the `CLEAR_CLIENT_PLUGINS_STATE` dispatch that fires on client disconnect
- `desktop/flipper-ui/src/reducers/__tests__/connections.node.tsx` — update tests for new `CLIENT_REMOVED` and `NEW_CLIENT` behaviour
- `desktop/flipper-ui/src/__tests__/disconnect.node.tsx` — update / add reconnect + state-inheritance tests
