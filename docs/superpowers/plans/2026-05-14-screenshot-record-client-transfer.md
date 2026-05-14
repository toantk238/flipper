# Screenshot & Recording Client File Delivery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make screenshot and screen recording features deliver output files to the browser client instead of saving them on the server machine.

**Architecture:** For screenshots, the buffer is already in client memory — skip the server filesystem write entirely and call `exportFileBinary()` directly. For recordings, after `stopScreenCapture()` returns the server-side file path, read the binary back to the client via `remoteServerContext.fs.readFileBinary()`, trigger a browser download with `exportFileBinary()`, then delete the server temp file.

**Tech Stack:** TypeScript, React, `file-saver` (via existing `exportFileBinary` utility), Flipper's `remoteServerContext` RPC layer.

---

## File Map

| File | Change |
|---|---|
| `desktop/flipper-ui/src/utils/screenshot.tsx` | Remove `writeFileBinary` round-trip; call `exportFileBinary` directly; return `Promise<void>` |
| `desktop/flipper-ui/src/utils/__tests__/screenshot.node.tsx` | New — unit tests for `capture()` |
| `desktop/flipper-ui/src/chrome/ScreenCaptureButtons.tsx` | Remove `openFile` from screenshot path; replace recording stop's `openFile` with `readFileBinary` → `exportFileBinary` → `unlink` |

---

## Task 1: Fix `capture()` in `screenshot.tsx`

**Files:**
- Modify: `desktop/flipper-ui/src/utils/screenshot.tsx`
- Create: `desktop/flipper-ui/src/utils/__tests__/screenshot.node.tsx`

- [ ] **Step 1.1 — Write the failing tests**

Create `desktop/flipper-ui/src/utils/__tests__/screenshot.node.tsx`:

```typescript
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {capture} from '../screenshot';
import * as exportFileModule from '../exportFile';

jest.mock('../exportFile', () => ({
  exportFileBinary: jest.fn(),
}));

jest.mock('flipper-plugin', () => {
  const actual = jest.requireActual('flipper-plugin');
  return {
    ...actual,
    path: {join: (...parts: string[]) => parts.join('/')},
  };
});

// Note: resolved relative to this test file (src/utils/__tests__/), so ../../ reaches src/
jest.mock('../../flipperServer', () => ({
  getFlipperServerConfig: () => ({
    processConfig: {screenCapturePath: '/capture'},
    paths: {desktopPath: '/desktop'},
  }),
}));

describe('capture()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls exportFileBinary with the screenshot buffer and a .png filename', async () => {
    const buffer = new Uint8Array([1, 2, 3]);
    const mockDevice = {
      connected: {get: () => true},
      description: {deviceType: 'physical', os: 'iOS'},
      screenshot: jest.fn().mockResolvedValue(buffer),
    } as any;

    await capture(mockDevice);

    expect(exportFileModule.exportFileBinary).toHaveBeenCalledWith(
      buffer,
      expect.objectContaining({defaultPath: expect.stringMatching(/\.png$/)}),
    );
  });

  it('returns early without calling exportFileBinary when device is disconnected', async () => {
    const mockDevice = {
      connected: {get: () => false},
      description: {deviceType: 'physical', os: 'iOS'},
      screenshot: jest.fn(),
    } as any;

    await capture(mockDevice);

    expect(exportFileModule.exportFileBinary).not.toHaveBeenCalled();
    expect(mockDevice.screenshot).not.toHaveBeenCalled();
  });

  it('throws when screenshot() returns null/undefined', async () => {
    const mockDevice = {
      connected: {get: () => true},
      description: {deviceType: 'physical', os: 'iOS'},
      screenshot: jest.fn().mockResolvedValue(undefined),
    } as any;

    await expect(capture(mockDevice)).rejects.toThrow();
  });
});
```

- [ ] **Step 1.2 — Run tests, confirm they fail**

```bash
cd desktop
yarn test --testPathPattern=flipper-ui/src/utils/__tests__/screenshot
```

Expected: FAIL — `capture` still calls `writeFileBinary` and doesn't call `exportFileBinary`.

- [ ] **Step 1.3 — Implement the fix in `screenshot.tsx`**

Replace the entire file content of `desktop/flipper-ui/src/utils/screenshot.tsx`:

```typescript
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {reportPlatformFailures} from 'flipper-common';
import {path} from 'flipper-plugin';
import BaseDevice from '../devices/BaseDevice';
import {getFlipperServerConfig} from '../flipperServer';
import {assertNotNull} from './assertNotNull';
import {exportFileBinary} from './exportFile';

export function getCaptureLocation() {
  return (
    getFlipperServerConfig().processConfig.screenCapturePath ||
    getFlipperServerConfig().paths.desktopPath
  );
}

// TODO: refactor so this doesn't need to be exported
export function getFileName(extension: 'png' | 'mp4'): string {
  // Windows does not like `:` in its filenames. Yes, I know ...
  return `screencap-${new Date().toISOString().replace(/:/g, '')}.${extension}`;
}

export async function capture(device: BaseDevice): Promise<void> {
  if (!device.connected.get()) {
    console.info('Skipping screenshot for disconnected device');
    return;
  }
  return reportPlatformFailures(
    device.screenshot().then((buffer) => {
      assertNotNull(
        buffer,
        `Device ${device.description.deviceType}:${device.description.os} does not support taking screenshots`,
      );
      exportFileBinary(buffer, {defaultPath: getFileName('png')});
    }),
    'captureScreenshot',
  );
}
```

Key changes from the original:
- Removed `import {getFlipperLib, path} from 'flipper-plugin'` → only `path` was used for `pngPath`, which is no longer needed. Remove the `path` import entirely. Keep `getFlipperLib` removed.
- Added `import {exportFileBinary} from './exportFile'`
- Removed `pngPath` variable and the `writeFileBinary` call
- Return type changed from `Promise<string>` to `Promise<void>`
- Removed `.then(() => pngPath)` — no path to return

- [ ] **Step 1.4 — Run tests, confirm they pass**

```bash
cd desktop
yarn test --testPathPattern=flipper-ui/src/utils/__tests__/screenshot
```

Expected: PASS — all 3 tests green.

- [ ] **Step 1.5 — Commit**

```bash
git add desktop/flipper-ui/src/utils/screenshot.tsx \
        desktop/flipper-ui/src/utils/__tests__/screenshot.node.tsx
git commit -m "fix(screenshot): deliver screenshot to client via exportFileBinary instead of server FS write"
```

---

## Task 2: Fix `ScreenCaptureButtons.tsx` — wire screenshot and recording to client download

**Files:**
- Modify: `desktop/flipper-ui/src/chrome/ScreenCaptureButtons.tsx`

- [ ] **Step 2.1 — Replace the entire file content**

`desktop/flipper-ui/src/chrome/ScreenCaptureButtons.tsx`:

```typescript
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {message} from 'antd';
import React, {useState, useCallback, useEffect} from 'react';
import {capture, getCaptureLocation, getFileName} from '../utils/screenshot';
import {
  CameraOutlined,
  VideoCameraFilled,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {useStore} from '../utils/useStore';
import {path, theme, getFlipperLib} from 'flipper-plugin';
import {NavbarButton} from '../sandy-chrome/Navbar';
import {exportFileBinary} from '../utils/exportFile';

export function NavbarScreenshotButton() {
  const selectedDevice = useStore((state) => state.connections.selectedDevice);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);

  const handleScreenshot = useCallback(() => {
    setIsTakingScreenshot(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return capture(selectedDevice!)
      .catch((e) => {
        console.error('Taking screenshot failed:', e);
        message.error(`Taking screenshot failed:${e}`);
      })
      .finally(() => {
        setIsTakingScreenshot(false);
      });
  }, [selectedDevice]);

  return (
    <NavbarButton
      icon={CameraOutlined}
      label="Screenshot"
      onClick={handleScreenshot}
      disabled={
        !selectedDevice ||
        !selectedDevice.description.features.screenshotAvailable
      }
      toggled={isTakingScreenshot}
    />
  );
}

export function NavbarScreenRecordButton() {
  const selectedDevice = useStore((state) => state.connections.selectedDevice);
  const [isRecording, setIsRecording] = useState(false);

  const handleRecording = useCallback(() => {
    if (!selectedDevice) {
      return;
    }
    if (!isRecording) {
      setIsRecording(true);
      const videoPath = path.join(getCaptureLocation(), getFileName('mp4'));
      return selectedDevice.startScreenCapture(videoPath).catch((e) => {
        console.warn('Failed to start recording', e);
        message.error(`Failed to start recording${e}`);
        setIsRecording(false);
      });
    } else {
      return selectedDevice
        .stopScreenCapture()
        .then(async (f) => {
          if (f) {
            const buffer =
              await getFlipperLib().remoteServerContext.fs.readFileBinary(f);
            exportFileBinary(buffer, {defaultPath: getFileName('mp4')});
            getFlipperLib()
              .remoteServerContext.fs.unlink(f)
              .catch((e: unknown) => console.warn('Failed to delete recording temp file', e));
          }
        })
        .catch((e) => {
          console.warn('Failed to stop recording', e);
          message.error(`Failed to stop recording${e}`);
        })
        .finally(() => {
          setIsRecording(false);
        });
    }
  }, [selectedDevice, isRecording]);

  const [red, setRed] = useState(false);
  useEffect(() => {
    if (isRecording) {
      setRed(true);
      const handle = setInterval(() => {
        setRed((red) => !red);
      }, FlashInterval);

      return () => {
        clearInterval(handle);
      };
    }
  }, [isRecording]);

  return (
    <NavbarButton
      icon={isRecording && red ? VideoCameraFilled : VideoCameraOutlined}
      label="Record"
      onClick={handleRecording}
      colorOverride={isRecording && red ? theme.errorColor : undefined}
      disabled={
        !selectedDevice ||
        !selectedDevice.description.features.screenCaptureAvailable
      }
      toggled={isRecording}
    />
  );
}

const FlashInterval = 600;
```

Key changes from the original:
- Removed `import {getFlipperServer} from '../flipperServer'` (no longer needed)
- Removed `async function openFile(path: string)` helper (no longer used)
- Added `getFlipperLib` to the `flipper-plugin` import
- Added `import {exportFileBinary} from '../utils/exportFile'`
- `NavbarScreenshotButton`: removed `.then(openFile)` from `capture()` chain (also removed the now-unnecessary eslint-disable-next-line comment about `no-non-null-assertion` — keep it since `selectedDevice!` is still there)
- `NavbarScreenRecordButton`: replaced `return openFile(f)` with the read→download→cleanup sequence

- [ ] **Step 2.2 — Type-check**

```bash
cd desktop/flipper-ui
yarn build
```

Expected: no TypeScript errors. If you see `error TS2345` on `capture()` return type mismatch (because `capture` now returns `Promise<void>` instead of `Promise<string>` and `.then(openFile)` is already removed), that's a sign the old call was not fully cleaned up — re-check Step 2.1.

- [ ] **Step 2.3 — Run the full test suite for flipper-ui**

```bash
cd desktop
yarn test --testPathPattern=flipper-ui
```

Expected: all existing tests pass, plus the 3 new `screenshot.node.tsx` tests from Task 1.

- [ ] **Step 2.4 — Commit**

```bash
git add desktop/flipper-ui/src/chrome/ScreenCaptureButtons.tsx
git commit -m "fix(recording): deliver recording to client via exportFileBinary instead of server openFile"
```

---

## Manual Verification Checklist

After both tasks are complete, verify in the running app:

1. **Screenshot**: click the camera button → browser shows a "Save As" dialog for a `.png` file named `screencap-<timestamp>.png`.
2. **Recording**: click the record button to start, click again to stop → browser shows a "Save As" dialog for a `.mp4` file named `screencap-<timestamp>.mp4`.
3. **Disconnected device**: click screenshot with no device selected → no dialog, no error (early return).
4. **Server temp file cleanup**: after a recording download, verify the `.mp4` is no longer present at `getCaptureLocation()` on the server machine.
