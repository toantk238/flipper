# Design: Fix UI Freeze on Multipart/File-Upload Requests in Network Tab

**Date:** 2026-05-15
**Branch:** v2.0

## Problem

Clicking a network request whose `Content-Type` is `multipart/form-data` (typically a file upload) freezes the Flipper UI. The freeze happens in the render thread when the selected request's body is displayed.

### Root Cause

`isTextual()` in `utils.tsx:49` classifies any `multipart/` content-type as textual. This causes `decodeBody` to call `Base64.decode(data)` on the entire request body — including raw binary file bytes — producing a multi-MB string stored in the DB. When the user clicks the row, `RequestBodyInspector` finds no formatter that handles `multipart/form-data` and falls through to `renderRawBody`, which renders the entire multi-MB string inside a `<CodeBlock>`. This blocks the render thread.

## Scope

Two files change:
- `desktop/plugins/public/network/utils.tsx` — one line deleted from `isTextual()`
- `desktop/plugins/public/network/RequestDetails.tsx` — one new formatter class added

No changes to `types.tsx`, `index.tsx`, `RequestDataDB.tsx`, or any other file.

## Design

### 1. Fix `isTextual()` (`utils.tsx`)

Remove `contentType.startsWith('multipart/')` from the textual check.

**Before:**
```ts
contentType.startsWith('multipart/') ||
```
**After:** that line is deleted.

With this change, `decodeBody` takes the `else` branch for any multipart body and returns a `Uint8Array` (raw bytes) instead of a decoded string. The existing `bodyAsString(Uint8Array)` safely returns `'(binary data)'` as a fallback if no formatter claims the body, so nothing else regresses.

### 2. Add `MultipartFormatter` (`RequestDetails.tsx`)

A new `BodyFormatter` class inserted at the top of the `BodyFormatters` array (before all other formatters) so it claims multipart requests before any fallback path runs.

#### Detection

`formatRequest` checks:
```
Content-Type: multipart/form-data; boundary=<boundary>
```
If the header is absent or does not start with `multipart/form-data`, returns `undefined` (falls through).
If `requestData` is not a `Uint8Array`, returns `undefined` (guards against edge cases where the body was already decoded as text from a prior session).

#### Parsing

1. Extract the `boundary` string from the `Content-Type` header value.
2. Split the `Uint8Array` body on `--<boundary>` byte sequences using byte-level search. No string conversion of the full body occurs at any point.
3. For each part:
   - Read only the part headers (bytes up to the first `\r\n\r\n`) as UTF-8. Part headers are always small (tens of bytes).
   - Parse `Content-Disposition` to extract `name` and optionally `filename`.
   - Parse `Content-Type` of the part (if present).
   - If no `filename`: treat as a text field. Decode the body bytes as UTF-8 for display.
   - If `filename` is present: treat as a file field. Record `filename`, part `Content-Type`, and `byteLength` only. Never convert binary bytes to a string.

#### Rendered Output

A `<KeyValueTable>` with one row per part:

| Field | Value |
|---|---|
| `username` | `alice` |
| `avatar` | `photo.jpg · image/jpeg · 2.3 MB` |
| `document` | `report.pdf · application/pdf · 847 kB` |

File rows display the filename, part content-type, and human-formatted byte size (using the existing `formatBytes` utility). No binary data enters the render path.

Only `formatRequest` is implemented. `formatResponse` is not implemented — multipart responses are rare and fall through to the existing `'(binary data)'` path.

### 3. Error Handling and Edge Cases

| Scenario | Behavior |
|---|---|
| `Content-Type` header missing or not `multipart/form-data` | `formatRequest` returns `undefined`; falls through to next formatter |
| Boundary string absent from `Content-Type` | `formatRequest` returns `undefined`; falls through |
| `requestData` is not `Uint8Array` | `formatRequest` returns `undefined`; falls through |
| Malformed part headers | That part rendered as `(unreadable part)`; other parts still render |
| Text field body is not valid UTF-8 | That field rendered as `(binary field)` |
| Empty multipart body (no parts found) | Returns `undefined`; existing `Empty` component shown |

## Testing

- Unit test: `MultipartFormatter.formatRequest` with a fixture containing two text fields and one file field — assert the three rows render correctly and no binary data appears.
- Unit test: malformed body (no boundary match) — assert `formatRequest` returns `undefined`.
- Unit test: `isTextual()` — assert `multipart/form-data` now returns `false`.
- Manual: click a real file-upload request in the network tab — no freeze, parts table appears.
