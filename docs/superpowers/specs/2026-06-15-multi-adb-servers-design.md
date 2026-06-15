# Multi ADB Servers Design

**Date:** 2026-06-15  
**Branch:** feat/multi_adb_servers  
**Status:** Approved

## Problem

Flipper currently supports exactly one ADB server, hardwired to a single `{host, port}` from `adbKitSettings` in settings (defaulting to `127.0.0.1:5037`). Teams that forward ADB from a remote machine (e.g. port 5038) cannot see those devices alongside local ones in the same Flipper session.

## Goal

Allow Flipper to connect to multiple ADB servers simultaneously, showing devices from each server in the UI with a configurable label suffix to distinguish their origin.

---

## Section 1: Data Model

### `Settings` type (`desktop/flipper-common/src/settings.tsx`)

Add:

```ts
adbServers?: Array<{
  label: string;  // suffix appended to device names; empty string = no suffix
  host: string;
  port: number;
}>;
```

Deprecate (kept only for migration):

```ts
/** @deprecated Use adbServers instead */
adbKitSettings?: { host?: string; port?: number };
```

### Migration (`desktop/flipper-server/src/utils/settings.tsx`)

Applied on settings load, before any client is initialized:

| `adbServers` | `adbKitSettings` | Result |
|---|---|---|
| present | any | use `adbServers` as-is |
| absent | present | `[{label: '', host: adbKitSettings.host ?? '127.0.0.1', port: adbKitSettings.port ?? 5037}]` |
| absent | absent | `[{label: '', host: '127.0.0.1', port: 5037}]` |

Env vars (`ANDROID_ADB_SERVER_PORT`, `ADB_SERVER_SOCKET`) continue to set the default only when `adbServers` is absent from settings (backwards compat).

### Example `~/.config/flipper/settings.json`

```json
{
  "adbServers": [
    { "label": "",       "host": "127.0.0.1", "port": 5037 },
    { "label": "remote", "host": "127.0.0.1", "port": 5038 }
  ]
}
```

Devices on port 5037 show as `Pixel 6`. Devices on port 5038 show as `Pixel 6 [remote]`.

---

## Section 2: ADB Client & Config Layer

### `adbConfig.tsx` — unchanged

Its role narrows to resolving the env-var fallback `{host, port}` when `adbServers` is absent. No API change.

### `adbClient.tsx` — unchanged

`initializeAdbClient({androidHome, adbKitSettings?})` is reused as-is for each server entry. No new functions needed.

### Initialization loop (in `FlipperServerImpl`)

```ts
const servers = resolveAdbServers(settings); // migration logic
for (const server of servers) {
  const client = await initializeAdbClient({
    androidHome: settings.androidHome,
    adbKitSettings: { host: server.host, port: server.port },
  });
  if (client) {
    const manager = new AndroidDeviceManager(this, client, server.label);
    await manager.watchAndroidDevices(true);
    this.androidManagers.push(manager);
  }
}
```

`resolveAdbServers` is a pure helper (extracted to `utils/settings.tsx`) that implements the migration table above.

---

## Section 3: `AndroidDeviceManager` & Device Naming

### Constructor signature change

```ts
// Before
constructor(
  private readonly flipperServer: FlipperServerImpl,
  private readonly adbClient: ADBClient,
)

// After
constructor(
  private readonly flipperServer: FlipperServerImpl,
  private readonly adbClient: ADBClient,
  private readonly serverLabel: string = '',
)
```

### Name suffix in `createDevice`

```ts
let name = props['ro.product.model'];
if (type === 'emulator') {
  name = (await this.getRunningEmulatorName(device.id)) || name;
}
if (this.serverLabel) {
  name = `${name} [${this.serverLabel}]`;
}
```

Empty label → no suffix (default 5037 server shows clean names).

### `FlipperServerImpl` field

```ts
// Before
android?: AndroidDeviceManager;

// After
androidManagers: AndroidDeviceManager[] = [];
```

### Fan-out for existing commands

| Command | Before | After |
|---|---|---|
| `android-adb-kill` | `this.android.adbKill()` | `Promise.all(this.androidManagers.map(m => m.adbKill()))` |
| `android-get-emulators` | `this.android.getAndroidEmulators()` | flatten results from all managers |
| guard checks | `assertNotNull(this.android)` | `if (this.androidManagers.length === 0) throw ...` |

---

## Section 4: Testing

### Existing tests — unchanged

`adbConfig.node.tsx` tests all pass; `adbConfig.tsx` is not modified.

### New tests: migration logic (`settings.node.tsx` or `adbConfig.node.tsx`)

- `adbKitSettings` present, `adbServers` absent → single-entry array with `label: ''`
- Both absent → `[{label: '', host: '127.0.0.1', port: 5037}]`
- `adbServers` already present → used as-is, `adbKitSettings` ignored

### New tests: `AndroidDeviceManager`

- Device created with non-empty `serverLabel` → name has ` [label]` suffix
- Device created with empty `serverLabel` → name unchanged

---

## Files Changed

| File | Change |
|---|---|
| `desktop/flipper-common/src/settings.tsx` | Add `adbServers`, deprecate `adbKitSettings` |
| `desktop/flipper-server/src/utils/settings.tsx` | `resolveAdbServers()` migration helper |
| `desktop/flipper-server/src/devices/android/androidDeviceManager.tsx` | Add `serverLabel` param, apply name suffix in `createDevice` |
| `desktop/flipper-server/src/FlipperServerImpl.tsx` | `androidManagers[]`, loop init, fan-out commands |
| `desktop/flipper-server/src/devices/android/__tests__/adbConfig.node.tsx` | Add migration tests |

`adbConfig.tsx` and `adbClient.tsx` are **not changed**.
