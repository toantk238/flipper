# Design: Deliver Screenshot and Recording Output to the Client

**Date:** 2026-05-14
**Branch:** v2.0

## Problem

When Flipper runs in remote/web mode (browser client + remote server), the screenshot and screen recording features save output files on the **server machine** and call `open-file` to open them on the server. The client user never receives the file.

- **Screenshot**: `capture()` in `screenshot.tsx` receives the image buffer on the client, then writes it back to the server filesystem via `remoteServerContext.fs.writeFileBinary()`, then calls `open-file` on the server. A `TODO` comment in the code already flags this as wrong.
- **Recording**: the `.mp4` is written by the device process (simctl/adb) to a server-side path. After `stopScreenCapture()` returns the server path, `openFile(path)` opens it on the server.

## Solution

Use the existing `exportFileBinary()` utility (backed by `FileSaver.saveAs`) to deliver files to the client in both cases. This utility is already used by the export-data flow and works in all environments (browser and Electron).

### Screenshot

**Before:**
```
device.screenshot() → Uint8Array in client
  → remoteServerContext.fs.writeFileBinary(serverPath, buffer)   # round-trip back to server
  → openFile(serverPath)                                          # opens on server
```

**After:**
```
device.screenshot() → Uint8Array in client
  → exportFileBinary(buffer, { defaultPath: getFileName('png') }) # browser Save dialog
```

The `capture()` function's return type changes from `Promise<string>` (server path) to `Promise<void>`. The `.then(openFile)` call in `ScreenCaptureButtons.tsx` is removed.

### Recording

**Before:**
```
startScreenCapture(videoPath)   # server writes .mp4 to videoPath
stopScreenCapture() → serverPath
  → openFile(serverPath)        # opens on server
```

**After:**
```
startScreenCapture(videoPath)   # unchanged — server writes .mp4 to videoPath
stopScreenCapture() → serverPath
  → remoteServerContext.fs.readFileBinary(serverPath)            # fetch binary to client
  → exportFileBinary(buffer, { defaultPath: getFileName('mp4') }) # browser Save dialog
  → remoteServerContext.fs.unlink(serverPath)                     # clean up server temp file
```

The recording destination path (`videoPath`) is still constructed from `getCaptureLocation()` — no change to start behavior. The server cleanup is best-effort; failures are swallowed with `console.warn`.

## Error Handling

- Screenshot errors: existing `catch` in `ScreenCaptureButtons.tsx` shows a `message.error` toast — no change needed.
- Recording transfer errors: if `readFileBinary` or `exportFileBinary` throws after a successful stop, show an error toast and still attempt `unlink` cleanup.
- Failed recording starts already set `isRecording(false)` before any file is created — no orphaned temp files.

## Files Changed

| File | Change |
|---|---|
| `desktop/flipper-ui/src/utils/screenshot.tsx` | Remove `writeFileBinary` write; call `exportFileBinary` directly; return `Promise<void>` |
| `desktop/flipper-ui/src/chrome/ScreenCaptureButtons.tsx` | Remove `openFile` from screenshot path; replace recording stop's `openFile` with `readFileBinary` → `exportFileBinary` → `unlink` |

No server-side changes. No new dependencies (all utilities already exist in the codebase).

## Non-Goals

- Streaming/chunked transfer for large recordings (out of scope; simple all-at-once read is sufficient for typical recordings).
- Detecting Electron vs browser mode to preserve the old "open in viewer" behavior (user chose unified client-download behavior for all modes).
