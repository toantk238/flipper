# HTTPS-Compatible WebSocket Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Flipper's WebSocket connection so it works when the server is exposed through an HTTPS reverse proxy.

**Architecture:** Two isolated changes — the URL construction logic in `FlipperServerClient.tsx` gets a `secure` flag and NaN-safe port handling; `index.tsx` detects `location.protocol` and passes it through. No new dependencies, no changes to the reverse proxy, no changes to device connections.

**Tech Stack:** TypeScript, Jest, ReconnectingWebSocket, browser `window.location`

**Spec:** `docs/superpowers/specs/2026-05-14-https-websocket-compat-design.md`

---

## File map

| File | Change |
|------|--------|
| `desktop/flipper-server-client/src/FlipperServerClient.tsx` | Add `secure?: boolean` param; update `URLProvider` to use `wss`/`ws` and guard port suffix |
| `desktop/flipper-server-client/src/__tests__/FlipperServerClient.node.tsx` | New — unit tests for the URL construction logic |
| `desktop/flipper-ui/src/index.tsx` | Pass `location.protocol === 'https:'` to `createFlipperServer`; fix dev-mode socket protocol |

---

## Task 1: Unit-test and fix URL construction in FlipperServerClient.tsx

**Files:**
- Modify: `desktop/flipper-server-client/src/FlipperServerClient.tsx:32-48`
- Create: `desktop/flipper-server-client/src/__tests__/FlipperServerClient.node.tsx`

### Context

`createFlipperServer` currently constructs:

```typescript
return `ws://${host}:${port}?token=${token}`;
```

Two bugs:
1. `ws://` is hardcoded — browser blocks this from HTTPS pages as mixed content.
2. When `port` is `NaN` (from `parseInt("", 10)` on a default-port HTTPS URL) the URL becomes `ws://host:NaN?token=...` which is invalid.

The test file mocks `reconnecting-websocket` as a jest function so we can capture the URL provider without creating a real WebSocket.

- [ ] **Step 1: Create the test file with failing tests**

Create `desktop/flipper-server-client/src/__tests__/FlipperServerClient.node.tsx`:

```typescript
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {createFlipperServer} from '../FlipperServerClient';

jest.mock('reconnecting-websocket', () =>
  jest.fn().mockImplementation(() => ({addEventListener: jest.fn()})),
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MockRWS = require('reconnecting-websocket') as jest.Mock;

function captureUrl(
  host: string,
  port: number,
  token: string,
  secure?: boolean,
): string {
  jest.useFakeTimers();
  MockRWS.mockClear();
  createFlipperServer(host, port, () => token, () => {}, secure);
  const urlProvider = MockRWS.mock.calls[0][0] as () => string;
  jest.useRealTimers();
  return urlProvider();
}

describe('createFlipperServer - WebSocket URL construction', () => {
  test('HTTP on localhost: uses ws:// with port', () => {
    expect(captureUrl('localhost', 52342, 'my-token')).toBe(
      'ws://localhost:52342?token=my-token',
    );
  });

  test('HTTPS default port: uses wss:// and omits port when port is NaN', () => {
    expect(captureUrl('flipper.example.com', NaN, 'my-token', true)).toBe(
      'wss://flipper.example.com?token=my-token',
    );
  });

  test('HTTPS non-standard port: uses wss:// and includes port', () => {
    expect(captureUrl('flipper.example.com', 8443, 'my-token', true)).toBe(
      'wss://flipper.example.com:8443?token=my-token',
    );
  });

  test('HTTP explicit insecure: uses ws:// with port', () => {
    expect(captureUrl('localhost', 52342, 'my-token', false)).toBe(
      'ws://localhost:52342?token=my-token',
    );
  });

  test('secure defaults to false: ws:// when flag omitted', () => {
    expect(captureUrl('localhost', 52342, 'my-token', undefined)).toBe(
      'ws://localhost:52342?token=my-token',
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd desktop && yarn test flipper-server-client/src/__tests__/FlipperServerClient.node.tsx --no-coverage
```

Expected output (tests fail because `createFlipperServer` doesn't accept a `secure` param yet and always uses `ws://`):
```
FAIL flipper-server-client/src/__tests__/FlipperServerClient.node.tsx
  ✕ HTTPS default port: uses wss:// and omits port when port is NaN
  ✕ HTTPS non-standard port: uses wss:// and includes port
  ✓ HTTP on localhost (passes by accident — same result as current code)
```

- [ ] **Step 3: Update FlipperServerClient.tsx**

Open `desktop/flipper-server-client/src/FlipperServerClient.tsx`. Replace lines 32–48 (the `createFlipperServer` function):

```typescript
export function createFlipperServer(
  host: string,
  port: number,
  tokenProvider: () => string | null | undefined,
  onStateChange: (state: FlipperServerState) => void,
  secure?: boolean,
): Promise<FlipperServer> {
  const URLProvider = () => {
    const token = tokenProvider();
    const scheme = secure ? 'wss' : 'ws';
    const portSuffix = port && !isNaN(port) ? `:${port}` : '';
    return `${scheme}://${host}${portSuffix}?token=${token}`;
  };

  const socket = new ReconnectingWebSocket(URLProvider);
  return createFlipperServerWithSocket(
    socket as WebSocket,
    port,
    onStateChange,
  );
}
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd desktop && yarn test flipper-server-client/src/__tests__/FlipperServerClient.node.tsx --no-coverage
```

Expected:
```
PASS flipper-server-client/src/__tests__/FlipperServerClient.node.tsx
  ✓ HTTP on localhost: uses ws:// with port
  ✓ HTTPS default port: uses wss:// and omits port when port is NaN
  ✓ HTTPS non-standard port: uses wss:// and includes port
  ✓ HTTP explicit insecure: uses ws:// with port
  ✓ secure defaults to false: ws:// when flag omitted

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

- [ ] **Step 5: Commit**

```bash
git add desktop/flipper-server-client/src/FlipperServerClient.tsx \
        desktop/flipper-server-client/src/__tests__/FlipperServerClient.node.tsx
git commit -m "fix(server-client): use wss:// when secure and omit port when NaN"
```

---

## Task 2: Fix protocol detection in index.tsx

**Files:**
- Modify: `desktop/flipper-ui/src/index.tsx:93` (dev-mode socket)
- Modify: `desktop/flipper-ui/src/index.tsx:149-153` (production WebSocket)

### Context

`index.tsx` is the browser-side entry point. It creates two WebSocket connections:

1. **Line 93** — dev-mode HMR socket. Hardcodes `ws://`. Only reached when `!isProduction()`.
2. **Lines 149-153** — production `createFlipperServer` call. Uses `location.hostname` and `parseInt(location.port, 10)` but never tells `createFlipperServer` whether to use TLS.

Both need to read `location.protocol` and use `'https:'` as the signal for secure connections.

TypeScript compilation (`yarn build:tsc`) is the verification step here — the changes are 2-line browser-only patches that wire up values already available at the call site.

- [ ] **Step 1: Fix the dev-mode socket (line 93)**

In `desktop/flipper-ui/src/index.tsx`, find the block starting with `if (!isProduction()) {` (around line 87). Replace the WebSocket construction line:

```typescript
// Before
const socket = new WebSocket(`ws://${location.host}?token=${token}`);

// After
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${wsProtocol}//${location.host}?token=${token}`);
```

`location.host` already includes the port when non-default (e.g., `yourdomain.com:8443`) so only the protocol needs fixing here.

- [ ] **Step 2: Fix the production createFlipperServer call (line 149)**

In the same file, find the `createFlipperServer` call (around line 149). Add `location.protocol === 'https:'` as the fifth argument:

```typescript
// Before
const flipperServer = await createFlipperServer(
  location.hostname,
  parseInt(location.port, 10),
  tokenProvider,
  (state: FlipperServerState) => {
    // ... state handler ...
  },
);

// After
const flipperServer = await createFlipperServer(
  location.hostname,
  parseInt(location.port, 10),
  tokenProvider,
  (state: FlipperServerState) => {
    // ... state handler (leave unchanged) ...
  },
  location.protocol === 'https:',
);
```

- [ ] **Step 3: Run TypeScript compilation to verify no type errors**

```bash
cd desktop && yarn build:tsc 2>&1 | grep -E "error TS|flipper-ui/src/index"
```

Expected: no output (zero errors in these files). If errors appear, the `secure` param type may need to be checked against `FlipperServerClient.tsx` — it should be `secure?: boolean` which accepts a `boolean` value.

- [ ] **Step 4: Run the full flipper-ui test suite to catch regressions**

```bash
cd desktop && yarn test flipper-ui/src/__tests__ --no-coverage
```

Expected: all tests pass (the changes don't touch any logic these tests exercise).

- [ ] **Step 5: Commit**

```bash
git add desktop/flipper-ui/src/index.tsx
git commit -m "fix(ui): use wss:// when page is served over HTTPS"
```

---

## Manual verification

After both tasks are complete:

1. Start the flipper-server locally: `cd desktop && yarn flipper-server`
2. Expose it through an HTTPS reverse proxy (Caddy example):
   ```
   yourdomain.com {
     reverse_proxy localhost:52342
   }
   ```
3. Open `https://yourdomain.com` in Chrome.
4. Open DevTools → Network → WS filter. You should see a `wss://yourdomain.com` connection established (not blocked as mixed content).
5. The Flipper UI should load past "Loading..." and show the main interface.
6. Verify localhost still works: open `http://localhost:52342` — the WS connection should be `ws://localhost:52342`.
