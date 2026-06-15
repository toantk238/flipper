# Multi ADB Servers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Flipper to connect to multiple ADB servers simultaneously, each identified by a label that is appended to device names.

**Architecture:** Add `adbServers` array to `Settings`, implement a `resolveAdbServers` migration helper, add a `serverLabel` param to `AndroidDeviceManager` (exposed via exported `buildDeviceName`), and fan-out initialization in `FlipperServerImpl` from one manager to N managers.

**Tech Stack:** TypeScript, adbkit, Jest, Yarn workspaces (monorepo under `desktop/`)

**Spec:** `docs/superpowers/specs/2026-06-15-multi-adb-servers-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `desktop/flipper-common/src/settings.tsx` | Modify | Add `adbServers` field, deprecate `adbKitSettings` |
| `desktop/flipper-server/src/utils/settings.tsx` | Modify | Add `resolveAdbServers()` migration helper |
| `desktop/flipper-server/src/utils/__tests__/settings.node.tsx` | Create | Tests for `resolveAdbServers` |
| `desktop/flipper-server/src/devices/android/androidDeviceManager.tsx` | Modify | Add `serverLabel` constructor param, export `buildDeviceName`, apply suffix in `createDevice` |
| `desktop/flipper-server/src/devices/android/__tests__/androidDeviceManager.node.tsx` | Create | Tests for `buildDeviceName` |
| `desktop/flipper-server/src/FlipperServerImpl.tsx` | Modify | `androidManagers[]`, loop init, fan-out commands |

---

## Task 1: Add `adbServers` to the `Settings` type

**Files:**
- Modify: `desktop/flipper-common/src/settings.tsx`

- [ ] **Step 1: Edit `Settings` type**

In `desktop/flipper-common/src/settings.tsx`, replace the `adbKitSettings` block:

```ts
  /**
   * Adbkit settings are needed because localhost can resolve to
   * 127.0.0.1 or [::1] depending on the machine (IPV4 or IPV6)
   * this unknown behaviour of which address will be used by the
   * adbkit may cause it not to connect to the correct address where the
   * adb server is running. Notice that using the env variable ADB_SERVER_SOCKET
   * set to tcp:127.0.0.1:5037 would make the adb start-server fail and so
   * cannot be used as a solution.
   */
  adbKitSettings?: {
    host?: string;
    port?: number;
  };
```

With:

```ts
  /**
   * List of ADB servers to connect to. Each entry creates an independent
   * device watcher. Devices from a server with a non-empty label are shown
   * as `<device name> [<label>]` in the UI.
   *
   * Replaces adbKitSettings. If absent, falls back to adbKitSettings or
   * env vars (ANDROID_ADB_SERVER_PORT / ADB_SERVER_SOCKET).
   */
  adbServers?: Array<{
    label: string;
    host: string;
    port: number;
  }>;
  /** @deprecated Use adbServers instead. */
  adbKitSettings?: {
    host?: string;
    port?: number;
  };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd desktop && yarn tsc --noEmit -p flipper-common/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add desktop/flipper-common/src/settings.tsx
git commit -m "feat(settings): add adbServers array field, deprecate adbKitSettings"
```

---

## Task 2: Implement `resolveAdbServers` (TDD)

**Files:**
- Create: `desktop/flipper-server/src/utils/__tests__/settings.node.tsx`
- Modify: `desktop/flipper-server/src/utils/settings.tsx`

- [ ] **Step 1: Write failing tests**

Create `desktop/flipper-server/src/utils/__tests__/settings.node.tsx`:

```ts
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {resolveAdbServers} from '../settings';
import type {Settings, Tristate} from 'flipper-common';

const BASE: Settings = {
  androidHome: '/sdk',
  enableAndroid: true,
  enableIOS: false,
  enablePhysicalIOS: false,
  enablePrefetching: 'Unset' as unknown as Tristate,
  idbPath: '',
  darkMode: 'light',
  showWelcomeAtStartup: false,
  suppressPluginErrors: false,
  persistDeviceData: false,
  enablePluginMarketplace: false,
  marketplaceURL: '',
  enablePluginMarketplaceAutoUpdate: false,
};

test('returns adbServers as-is when present', () => {
  const settings: Settings = {
    ...BASE,
    adbServers: [
      {label: '', host: '127.0.0.1', port: 5037},
      {label: 'remote', host: '127.0.0.1', port: 5038},
    ],
  };
  expect(resolveAdbServers(settings)).toEqual([
    {label: '', host: '127.0.0.1', port: 5037},
    {label: 'remote', host: '127.0.0.1', port: 5038},
  ]);
});

test('migrates adbKitSettings to single-entry array when adbServers is absent', () => {
  const settings: Settings = {
    ...BASE,
    adbKitSettings: {host: '::1', port: 5038},
  };
  expect(resolveAdbServers(settings)).toEqual([
    {label: '', host: '::1', port: 5038},
  ]);
});

test('fills in defaults when migrating adbKitSettings with missing fields', () => {
  const settings: Settings = {...BASE, adbKitSettings: {}};
  expect(resolveAdbServers(settings)).toEqual([
    {label: '', host: '127.0.0.1', port: 5037},
  ]);
});

test('falls back to default server when both adbServers and adbKitSettings are absent', () => {
  delete process.env.ANDROID_ADB_SERVER_PORT;
  delete process.env.ADB_SERVER_SOCKET;
  expect(resolveAdbServers(BASE)).toEqual([
    {label: '', host: '127.0.0.1', port: 5037},
  ]);
});

test('ignores adbKitSettings when adbServers is present', () => {
  const settings: Settings = {
    ...BASE,
    adbServers: [{label: 'primary', host: '127.0.0.1', port: 5037}],
    adbKitSettings: {host: '::1', port: 9999},
  };
  expect(resolveAdbServers(settings)).toEqual([
    {label: 'primary', host: '127.0.0.1', port: 5037},
  ]);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd desktop && yarn jest --testPathPattern="utils/__tests__/settings.node" --no-coverage
```

Expected: FAIL — `resolveAdbServers is not a function`

- [ ] **Step 3: Implement `resolveAdbServers`**

Add to the bottom of `desktop/flipper-server/src/utils/settings.tsx`:

First, add this import at the top of the file (alongside existing imports):

```ts
import adbConfig from '../devices/android/adbConfig';
```

Then add this export at the bottom of the file:

```ts
export function resolveAdbServers(
  settings: Settings,
): Array<{label: string; host: string; port: number}> {
  if (settings.adbServers && settings.adbServers.length > 0) {
    return settings.adbServers;
  }
  if (settings.adbKitSettings) {
    return [
      {
        label: '',
        host: settings.adbKitSettings.host ?? '127.0.0.1',
        port: settings.adbKitSettings.port ?? 5037,
      },
    ];
  }
  const {host, port} = adbConfig();
  return [{label: '', host, port}];
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd desktop && yarn jest --testPathPattern="utils/__tests__/settings.node" --no-coverage
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/flipper-server/src/utils/settings.tsx \
        desktop/flipper-server/src/utils/__tests__/settings.node.tsx
git commit -m "feat(settings): add resolveAdbServers migration helper"
```

---

## Task 3: Add `serverLabel` and `buildDeviceName` to `AndroidDeviceManager` (TDD)

**Files:**
- Create: `desktop/flipper-server/src/devices/android/__tests__/androidDeviceManager.node.tsx`
- Modify: `desktop/flipper-server/src/devices/android/androidDeviceManager.tsx`

- [ ] **Step 1: Write failing tests**

Create `desktop/flipper-server/src/devices/android/__tests__/androidDeviceManager.node.tsx`:

```ts
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {buildDeviceName} from '../androidDeviceManager';

test('appends label in brackets when label is non-empty', () => {
  expect(buildDeviceName('Pixel 6', 'remote')).toBe('Pixel 6 [remote]');
});

test('returns name unchanged when label is empty string', () => {
  expect(buildDeviceName('Pixel 6', '')).toBe('Pixel 6');
});

test('applies label to emulator names', () => {
  expect(buildDeviceName('Pixel_6_API_33', 'ci')).toBe('Pixel_6_API_33 [ci]');
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd desktop && yarn jest --testPathPattern="android/__tests__/androidDeviceManager.node" --no-coverage
```

Expected: FAIL — `buildDeviceName is not a function`

- [ ] **Step 3: Export `buildDeviceName` from `androidDeviceManager.tsx`**

Open `desktop/flipper-server/src/devices/android/androidDeviceManager.tsx`.

After the import block (before the class declaration), add:

```ts
export function buildDeviceName(name: string, label: string): string {
  return label ? `${name} [${label}]` : name;
}
```

- [ ] **Step 4: Add `serverLabel` to the constructor**

Find the constructor:

```ts
  constructor(
    private readonly flipperServer: FlipperServerImpl,
    private readonly adbClient: ADBClient,
  ) {
    this.certificateProvider = new AndroidCertificateProvider(this.adbClient);
  }
```

Replace with:

```ts
  constructor(
    private readonly flipperServer: FlipperServerImpl,
    private readonly adbClient: ADBClient,
    private readonly serverLabel: string = '',
  ) {
    this.certificateProvider = new AndroidCertificateProvider(this.adbClient);
  }
```

- [ ] **Step 5: Apply label suffix in `createDevice`**

Inside `createDevice`, find the lines that set `name` and the emulator name, then the `const androidLikeDevice = new (...)` line. Add `name = buildDeviceName(name, this.serverLabel);` immediately before the `new` call:

```ts
          if (type === 'emulator') {
            name = (await this.getRunningEmulatorName(device.id)) || name;
          }
          // ↓ add this line
          name = buildDeviceName(name, this.serverLabel);
          const isKaiOSDevice = Object.keys(props).some(
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd desktop && yarn jest --testPathPattern="android/__tests__/androidDeviceManager.node" --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add desktop/flipper-server/src/devices/android/androidDeviceManager.tsx \
        desktop/flipper-server/src/devices/android/__tests__/androidDeviceManager.node.tsx
git commit -m "feat(android): add serverLabel to AndroidDeviceManager, export buildDeviceName"
```

---

## Task 4: Wire multi-server initialization in `FlipperServerImpl`

**Files:**
- Modify: `desktop/flipper-server/src/FlipperServerImpl.tsx`

- [ ] **Step 1: Add `resolveAdbServers` import**

Open `desktop/flipper-server/src/FlipperServerImpl.tsx`.

Find the existing import from `'./utils/settings'` (or add a new one near the other utils imports). Add `resolveAdbServers` to it:

```ts
import {resolveAdbServers} from './utils/settings';
```

(If no import from `'./utils/settings'` exists yet, add this as a new import line alongside other utility imports around line 63.)

- [ ] **Step 2: Replace `android?` field with `androidManagers[]`**

Find line ~120:

```ts
  android?: AndroidDeviceManager;
```

Replace with:

```ts
  androidManagers: AndroidDeviceManager[] = [];
```

- [ ] **Step 3: Replace single-client init block with multi-server loop**

Find the block inside `startDeviceListeners` (lines ~290–305):

```ts
      asyncDeviceListenersPromises.push(
        initializeAdbClient(this.config.settings)
          .then((adbClient) => {
            if (!adbClient) {
              return;
            }
            this.android = new AndroidDeviceManager(this, adbClient);
            return this.android.watchAndroidDevices(true);
          })
          .catch((e) => {
            console.error(
              'FlipperServerImpl.startDeviceListeners.watchAndroidDevices -> unexpected error',
              e,
            );
          }),
      );
```

Replace with:

```ts
      const servers = resolveAdbServers(this.config.settings);
      asyncDeviceListenersPromises.push(
        ...servers.map((server) =>
          initializeAdbClient({
            androidHome: this.config.settings.androidHome,
            adbKitSettings: {host: server.host, port: server.port},
          })
            .then((adbClient) => {
              if (!adbClient) {
                return;
              }
              const manager = new AndroidDeviceManager(
                this,
                adbClient,
                server.label,
              );
              this.androidManagers.push(manager);
              return manager.watchAndroidDevices(true);
            })
            .catch((e) => {
              console.error(
                `FlipperServerImpl.startDeviceListeners.watchAndroidDevices -> unexpected error for ${server.label || server.port}`,
                e,
              );
            }),
        ),
      );
```

- [ ] **Step 4: Fan out `android-get-emulators` and `android-adb-kill`**

Find:

```ts
    'android-get-emulators': async () => {
      assertNotNull(this.android);
      return this.android.getAndroidEmulators();
    },
```

Replace with:

```ts
    'android-get-emulators': async () => {
      if (this.androidManagers.length === 0) {
        throw new Error('No Android managers initialized');
      }
      const results = await Promise.all(
        this.androidManagers.map((m) => m.getAndroidEmulators()),
      );
      return results.flat();
    },
```

Find:

```ts
    'android-adb-kill': async () => {
      assertNotNull(this.android);
      return this.android.adbKill();
    },
```

Replace with:

```ts
    'android-adb-kill': async () => {
      if (this.androidManagers.length === 0) {
        throw new Error('No Android managers initialized');
      }
      await Promise.all(this.androidManagers.map((m) => m.adbKill()));
    },
```

- [ ] **Step 5: Run the full desktop test suite**

```bash
cd desktop && yarn jest --no-coverage
```

Expected: All tests pass. If any test references `this.android` as a single instance (e.g. in FlipperServerImpl tests or mocks), update those tests to use `androidManagers[0]` or mock `androidManagers` as an array.

- [ ] **Step 6: TypeScript check**

```bash
cd desktop && yarn tsc --noEmit -p flipper-server/tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add desktop/flipper-server/src/FlipperServerImpl.tsx
git commit -m "feat(android): support multiple ADB servers via androidManagers array"
```

---

## Smoke Test

To manually verify after implementation:

1. Add to `~/.config/flipper/settings.json`:

```json
{
  "adbServers": [
    {"label": "",       "host": "127.0.0.1", "port": 5037},
    {"label": "remote", "host": "127.0.0.1", "port": 5038}
  ]
}
```

2. Forward ADB from a second machine to port 5038:
   ```bash
   ssh -R 5038:127.0.0.1:5037 your-host
   ```

3. Start Flipper. Devices on 5037 show plain names. Devices on 5038 show `<name> [remote]`.

4. Verify the `adbKitSettings` migration: remove `adbServers`, add `"adbKitSettings": {"host": "127.0.0.1", "port": 5037}` — Flipper still connects to one server normally.
