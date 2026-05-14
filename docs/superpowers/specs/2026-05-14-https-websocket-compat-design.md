# Design: HTTPS-compatible WebSocket connections

**Date:** 2026-05-14
**Branch:** v2.0

---

## Problem

When Flipper is exposed through an HTTPS reverse proxy (e.g., Caddy, nginx, Cloudflare Tunnel), the browser loads `index.web.html` successfully but the app never initialises — it stays at "Loading..." indefinitely.

Two bugs in the WebSocket URL construction cause this:

1. **Wrong protocol** — `FlipperServerClient` hardcodes `ws://`. Browsers block `ws://` connections from an `https://` page as mixed content. The WebSocket is never opened.
2. **Broken port** — `parseInt(location.port, 10)` returns `NaN` when the page uses the default HTTPS port (443, which browsers omit from `location.port`). This produces an invalid URL such as `ws://yourdomain.com:NaN?token=...`.

The same `ws://` bug is present in the dev-mode HMR socket path in `index.tsx`.

---

## Goals

- Flipper's web UI must work when served behind an HTTPS reverse proxy.
- The WebSocket must use `wss://` when the page is HTTPS, `ws://` when HTTP.
- No port must appear in the WebSocket URL when `location.port` is empty (so the browser uses the scheme's default — 80 for `ws://`, 443 for `wss://`).
- The fix must be backward-compatible: localhost HTTP development must continue to work unchanged.

## Non-goals

- The Flipper server itself does not need to terminate TLS — TLS termination remains the reverse proxy's responsibility.
- No changes to the reverse proxy configuration are required (standard WebSocket proxying already works in nginx/Caddy/Traefik).
- No changes to device-to-Flipper connections (those use a separate TLS-secured WebSocket on a different port managed by `SecureServerWebSocket`).

---

## Design

### Change 1 — `FlipperServerClient.tsx`: add `secure` parameter

Add an optional `secure?: boolean` parameter to `createFlipperServer`. When `true`, the WebSocket URL uses `wss://`; when `false` or omitted, it uses `ws://` (preserving existing behaviour).

The port suffix is only included when the port is a valid non-zero number. When `location.port` is empty (`""`), `parseInt("", 10)` produces `NaN`, so the suffix is omitted and the browser uses the scheme default.

```typescript
export function createFlipperServer(
  host: string,
  port: number,
  tokenProvider: () => string | null | undefined,
  onStateChange: (state: FlipperServerState) => void,
  secure?: boolean,
): Promise<FlipperServer>
```

Inside `URLProvider` (currently line 38–41):

```typescript
const URLProvider = () => {
  const token = tokenProvider();
  const scheme = secure ? 'wss' : 'ws';
  const portSuffix = port && !isNaN(port) ? `:${port}` : '';
  return `${scheme}://${host}${portSuffix}?token=${token}`;
};
```

### Change 2 — `index.tsx`: detect HTTPS and propagate `secure`

**Production WebSocket** (currently line 149):

```typescript
const flipperServer = await createFlipperServer(
  location.hostname,
  parseInt(location.port, 10),
  tokenProvider,
  onStateChange,
  location.protocol === 'https:',   // new
);
```

**Dev-mode HMR socket** (currently line 93):

```typescript
// Before
const socket = new WebSocket(`ws://${location.host}?token=${token}`);

// After
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${wsProtocol}//${location.host}?token=${token}`);
```

`location.host` (not `.hostname`) already includes non-default ports (e.g., `yourdomain.com:8443`), so the dev-mode path is already port-correct — only the protocol needs fixing.

---

## Files changed

| File | Change |
|------|--------|
| `desktop/flipper-server-client/src/FlipperServerClient.tsx` | Add `secure?: boolean` param; update `URLProvider` to use `wss`/`ws` and guard port |
| `desktop/flipper-ui/src/index.tsx` | Pass `location.protocol === 'https:'` to `createFlipperServer`; fix dev-mode socket protocol |

---

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| HTTP on localhost (dev) | `secure` is `false`, URL is `ws://localhost:52342?token=...` — unchanged |
| HTTPS on standard port 443 | `secure` is `true`, port is `NaN`, URL is `wss://yourdomain.com?token=...` |
| HTTPS on non-standard port 8443 | `secure` is `true`, port is `8443`, URL is `wss://yourdomain.com:8443?token=...` |
| HTTP on non-standard port | `secure` is `false`, port is valid, URL is `ws://host:port?token=...` — unchanged |

---

## Testing

- Manual: start server on localhost, visit via `http://localhost:52342` — app connects as before.
- Manual: expose via HTTPS reverse proxy (Caddy or nginx), visit domain — app connects using `wss://`.
- Existing unit tests for `FlipperServerClient` must still pass (`secure` defaults to `false`).
