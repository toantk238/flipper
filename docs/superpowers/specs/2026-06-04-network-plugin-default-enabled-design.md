# Network Plugin: Auto-Enabled for New Clients

**Date:** 2026-06-04
**Status:** Approved

## Problem

The Network plugin (`flipper-plugin-network`, id: `Network`) must be manually enabled for every new app that connects to Flipper for the first time. Reconnects of a known app retain their enabled state, but first-ever connections start with no plugins enabled.

## Goal

The Network plugin should be enabled by default the first time any new app (client) connects. After that, user preferences take over — disabling Network is permanent and is not reversed on reconnect.

## Solution

Initialize `enabledPlugins[app]` to `['Network']` in the `NEW_CLIENT` reducer case when the entry does not yet exist.

### File

`desktop/flipper-ui/src/reducers/connections.tsx`

### Change

In the `NEW_CLIENT` case, after the existing client-registration logic, add:

```typescript
if (!draft.enabledPlugins[payload.query.app]) {
  draft.enabledPlugins[payload.query.app] = ['Network'];
}
```

`payload.query.app` is the app name (e.g., `"com.example.MyApp"`), the same key used throughout the enable/disable flow.

## Behavior

| Scenario | Result |
|---|---|
| First-ever connection of app X | `enabledPlugins['X']` = `['Network']` → Network shows as enabled |
| Reconnect of known app X | `enabledPlugins['X']` already exists → guard skipped, state preserved |
| User disables Network for app X | Array exists but lacks `'Network'` → guard skipped on next reconnect |
| App X does not support Network | Entry is set, but `computePluginLists` filters by `client.plugins.has(id)` → no visible effect |

## What Does Not Change

- No new Redux actions, constants, or files.
- No persistence migration required. Existing apps with an existing `enabledPlugins[app]` entry (including `[]`) are unaffected.
- `defaultEnabledBackgroundPlugins` and `defaultEnabledDevicePlugins` are untouched.
- `computePluginLists`, `Client.isEnabledPlugin`, and all consumers remain unchanged.

## Out of Scope

- Auto-enabling other plugins (Inspector, Databases, etc.) — can be added to the initializer array later if needed.
- Resetting user preferences on reconnect — intentionally not implemented.
