# Network Multipart File-Upload Freeze Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the UI freeze that occurs when clicking a `multipart/form-data` network request in Flipper's network tab.

**Architecture:** Remove `multipart/` from `isTextual()` so the body is stored as raw bytes (`Uint8Array`) instead of a decoded string. Add `parseMultipartBody()` to `utils.tsx` that splits those bytes into parts by boundary without converting binary data to strings. Add `MultipartFormatter` in `RequestDetails.tsx` that calls the parser and renders text fields as key-value pairs and file fields as metadata-only rows.

**Tech Stack:** TypeScript, React, `js-base64`, existing `KeyValueTable` component, Jest (run via `yarn test` in `desktop/`)

---

## File Map

| File | Change |
|---|---|
| `desktop/plugins/public/network/utils.tsx` | Delete one `isTextual()` line; add `ParsedPart` type + `parseMultipartBody()` + private helpers |
| `desktop/plugins/public/network/RequestDetails.tsx` | Import `parseMultipartBody`, `ParsedPart`; add `MultipartFormatter` class; prepend to `BodyFormatters` |
| `desktop/plugins/public/network/__tests__/encoding.node.tsx` | Add two `isTextual()` tests for multipart |
| `desktop/plugins/public/network/__tests__/multipart.node.tsx` | New file — unit tests for `parseMultipartBody()` |

---

## Task 1: Fix `isTextual()` + verify with tests

**Files:**
- Modify: `desktop/plugins/public/network/utils.tsx:49`
- Modify: `desktop/plugins/public/network/__tests__/encoding.node.tsx`

- [ ] **Step 1: Write two failing tests**

Open `desktop/plugins/public/network/__tests__/encoding.node.tsx`. Add at the bottom (before the last closing brace of any `describe` block, or at the top level):

```typescript
test('isTextual returns false for multipart/form-data', () => {
  expect(
    isTextual([{key: 'Content-Type', value: 'multipart/form-data; boundary=abc'}]),
  ).toBe(false);
});

test('isTextual returns false for multipart/mixed', () => {
  expect(
    isTextual([{key: 'Content-Type', value: 'multipart/mixed; boundary=abc'}]),
  ).toBe(false);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern="plugins/public/network/__tests__/encoding" 2>&1 | tail -20
```

Expected: two failing tests — `isTextual returns false for multipart/form-data` and `isTextual returns false for multipart/mixed`.

- [ ] **Step 3: Delete the `multipart/` line from `isTextual()`**

In `desktop/plugins/public/network/utils.tsx`, remove line 49:

```typescript
// DELETE this line:
      contentType.startsWith('multipart/') ||
```

The `isTextual()` function body goes from:
```typescript
    if (
      contentType.startsWith('text/') ||
      contentType.startsWith('application/x-www-form-urlencoded') ||
      jsonContentTypeRegex.test(contentType) ||
      contentType.startsWith('multipart/') ||      // <-- DELETE THIS LINE
      contentType.startsWith('message/') ||
      contentType.startsWith('image/svg') ||
      contentType.startsWith('application/xhtml+xml') ||
      contentType.startsWith('application/xml')
    ) {
```
to:
```typescript
    if (
      contentType.startsWith('text/') ||
      contentType.startsWith('application/x-www-form-urlencoded') ||
      jsonContentTypeRegex.test(contentType) ||
      contentType.startsWith('message/') ||
      contentType.startsWith('image/svg') ||
      contentType.startsWith('application/xhtml+xml') ||
      contentType.startsWith('application/xml')
    ) {
```

- [ ] **Step 4: Run tests again — confirm they pass**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern="plugins/public/network/__tests__/encoding" 2>&1 | tail -20
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/public/network/utils.tsx desktop/plugins/public/network/__tests__/encoding.node.tsx
git commit -m "fix(network): treat multipart/form-data as binary to prevent large-body string decode"
```

---

## Task 2: Add `parseMultipartBody()` to `utils.tsx` + unit tests

**Files:**
- Modify: `desktop/plugins/public/network/utils.tsx` (append new helpers + export)
- Create: `desktop/plugins/public/network/__tests__/multipart.node.tsx`

- [ ] **Step 1: Create the test file with a failing test**

Create `desktop/plugins/public/network/__tests__/multipart.node.tsx`:

```typescript
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {parseMultipartBody} from '../utils';

function makeMultipartBody(boundary: string, parts: string[]): Uint8Array {
  const lines: string[] = [];
  for (const part of parts) {
    lines.push(`--${boundary}\r\n${part}`);
  }
  lines.push(`--${boundary}--\r\n`);
  return new TextEncoder().encode(lines.join(''));
}

test('parses text fields from multipart body', () => {
  const boundary = 'testboundary';
  const body = makeMultipartBody(boundary, [
    'Content-Disposition: form-data; name="username"\r\n\r\nalice\r\n',
    'Content-Disposition: form-data; name="email"\r\n\r\nalice@example.com\r\n',
  ]);
  const parts = parseMultipartBody(body, boundary);
  expect(parts).toHaveLength(2);
  expect(parts[0]).toEqual({name: 'username', textValue: 'alice', byteLength: 5});
  expect(parts[1]).toEqual({name: 'email', textValue: 'alice@example.com', byteLength: 17});
});

test('parses file fields — records metadata, not binary content', () => {
  const boundary = 'testboundary';
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]);
  const header = 'Content-Disposition: form-data; name="avatar"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n';
  const trailer = '\r\n';
  // Build manually: --boundary\r\n<header><binary bytes>\r\n--boundary--\r\n
  const prefix = new TextEncoder().encode(`--${boundary}\r\n${header}`);
  const suffix = new TextEncoder().encode(`${trailer}--${boundary}--\r\n`);
  const combined = new Uint8Array(prefix.length + fakeJpeg.length + suffix.length);
  combined.set(prefix, 0);
  combined.set(fakeJpeg, prefix.length);
  combined.set(suffix, prefix.length + fakeJpeg.length);

  const parts = parseMultipartBody(combined, boundary);
  expect(parts).toHaveLength(1);
  expect(parts[0].name).toBe('avatar');
  expect(parts[0].filename).toBe('photo.jpg');
  expect(parts[0].partContentType).toBe('image/jpeg');
  expect(parts[0].byteLength).toBe(6);
  expect(parts[0].textValue).toBeUndefined();
});

test('returns empty array for malformed body with no matching boundary', () => {
  const body = new TextEncoder().encode('this is not a multipart body');
  const parts = parseMultipartBody(body, 'nonexistent');
  expect(parts).toHaveLength(0);
});

test('parses mixed text and file fields', () => {
  const boundary = 'abc123';
  const body = makeMultipartBody(boundary, [
    'Content-Disposition: form-data; name="title"\r\n\r\nHello world\r\n',
    'Content-Disposition: form-data; name="doc"; filename="report.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\r\n',
  ]);
  const parts = parseMultipartBody(body, boundary);
  expect(parts).toHaveLength(2);
  expect(parts[0].textValue).toBe('Hello world');
  expect(parts[1].filename).toBe('report.pdf');
  expect(parts[1].partContentType).toBe('application/pdf');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern="plugins/public/network/__tests__/multipart" 2>&1 | tail -20
```

Expected: fail with `parseMultipartBody is not exported from '../utils'`.

- [ ] **Step 3: Add `ParsedPart` type and helpers to `utils.tsx`**

Append the following to the end of `desktop/plugins/public/network/utils.tsx`:

```typescript
export type ParsedPart = {
  name: string;
  filename?: string;
  partContentType?: string;
  textValue?: string;
  byteLength: number;
};

function findSequence(
  haystack: Uint8Array,
  needle: Uint8Array,
  start = 0,
): number {
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function tryParsePart(partBytes: Uint8Array, sepIdx: number): ParsedPart | null {
  let headerStr: string;
  try {
    headerStr = new TextDecoder('utf-8', {fatal: true}).decode(
      partBytes.slice(0, sepIdx),
    );
  } catch {
    return null;
  }

  const bodyBytes = partBytes.slice(sepIdx + 4); // skip \r\n\r\n

  const dispositionMatch = headerStr.match(
    /Content-Disposition:\s*form-data;([^\r\n]*)/i,
  );
  if (!dispositionMatch) return null;

  const nameMatch = dispositionMatch[1].match(/name="([^"]*)"/);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  const filenameMatch = dispositionMatch[1].match(/filename="([^"]*)"/);
  const filename = filenameMatch?.[1];

  const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
  const partContentType = ctMatch?.[1]?.trim();

  if (filename !== undefined) {
    return {name, filename, partContentType, byteLength: bodyBytes.length};
  }

  let textValue: string | undefined;
  try {
    textValue = new TextDecoder('utf-8', {fatal: true}).decode(bodyBytes);
  } catch {
    // non-UTF-8 bytes in a text field — leave textValue undefined
  }
  return {name, textValue, byteLength: bodyBytes.length};
}

export function parseMultipartBody(
  body: Uint8Array,
  boundary: string,
): ParsedPart[] {
  const enc = new TextEncoder();
  const delimiter = enc.encode(`--${boundary}\r\n`);
  const finalDelimiter = enc.encode(`--${boundary}--`);
  const headerSep = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]); // \r\n\r\n
  const parts: ParsedPart[] = [];

  let searchFrom = 0;
  while (true) {
    const delimPos = findSequence(body, delimiter, searchFrom);
    if (delimPos === -1) break;

    const partStart = delimPos + delimiter.length;
    const nextDelim = findSequence(body, delimiter, partStart);
    const finalDelimPos = findSequence(body, finalDelimiter, partStart);

    // partEnd: stop before the \r\n that precedes the next --boundary
    const partEnd =
      nextDelim !== -1
        ? nextDelim - 2
        : finalDelimPos !== -1
          ? finalDelimPos - 2
          : body.length;

    const partBytes = body.slice(partStart, partEnd);
    const sepIdx = findSequence(partBytes, headerSep);
    if (sepIdx !== -1) {
      const parsed = tryParsePart(partBytes, sepIdx);
      if (parsed) parts.push(parsed);
    }

    if (nextDelim === -1) break;
    searchFrom = partStart;
  }

  return parts;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern="plugins/public/network/__tests__/multipart" 2>&1 | tail -20
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full network test suite to confirm no regressions**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern="plugins/public/network" 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add desktop/plugins/public/network/utils.tsx desktop/plugins/public/network/__tests__/multipart.node.tsx
git commit -m "feat(network): add parseMultipartBody helper for structured multipart part extraction"
```

---

## Task 3: Add `MultipartFormatter` to `RequestDetails.tsx`

**Files:**
- Modify: `desktop/plugins/public/network/RequestDetails.tsx`

- [ ] **Step 1: Add `parseMultipartBody` and `ParsedPart` to the import from `./utils`**

In `desktop/plugins/public/network/RequestDetails.tsx`, update the existing import block (lines 25–32):

```typescript
import {
  bodyAsBinary,
  bodyAsString,
  formatBytes,
  getHeaderValue,
  parseJsonWithBigInt,
  parseMultipartBody,
  ParsedPart,
  queryToObj,
} from './utils';
```

- [ ] **Step 2: Add the `MultipartFormatter` class**

Add the following class immediately before the `BodyFormatters` array (before line 764):

```typescript
class MultipartFormatter {
  formatRequest(request: RequestWithData) {
    const contentType = getHeaderValue(request.requestHeaders, 'content-type');
    if (!contentType.startsWith('multipart/form-data')) {
      return undefined;
    }
    if (!(request.requestData instanceof Uint8Array)) {
      return undefined;
    }
    const boundaryMatch = contentType.match(/boundary=([^;,\s]+)/);
    if (!boundaryMatch) {
      return undefined;
    }
    // Strip optional surrounding quotes from boundary value
    const boundary = boundaryMatch[1].replace(/^"(.*)"$/, '$1');

    let parts: ParsedPart[];
    try {
      parts = parseMultipartBody(request.requestData, boundary);
    } catch {
      return undefined;
    }
    if (parts.length === 0) {
      return undefined;
    }

    const items: KeyValueItem[] = parts.map((part) => ({
      key: part.filename != null ? `${part.name} (file)` : part.name,
      value:
        part.filename != null
          ? `${part.filename} · ${part.partContentType ?? 'application/octet-stream'} · ${formatBytes(part.byteLength)}`
          : (part.textValue ?? '(binary field)'),
    }));

    return <KeyValueTable items={items} />;
  }
}
```

- [ ] **Step 3: Prepend `MultipartFormatter` to `BodyFormatters`**

Update the `BodyFormatters` array (currently at line 764) to add `new MultipartFormatter()` as the first entry:

```typescript
const BodyFormatters: Array<BodyFormatter> = [
  new MultipartFormatter(),
  new ImageFormatter(),
  new VideoFormatter(),
  new LogEventFormatter(),
  new GraphQLBatchFormatter(),
  new GraphQLFormatter(),
  new JSONFormatter(),
  new FormUrlencodedFormatter(),
  new XMLTextFormatter(),
  new ProtobufFormatter(),
  new BinaryFormatter(),
];
```

- [ ] **Step 4: Run the full network test suite to confirm no regressions**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn test --testPathPattern="plugins/public/network" 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/plugins/public/network/RequestDetails.tsx
git commit -m "feat(network): add MultipartFormatter to show multipart/form-data parts without freezing UI"
```

---

## Task 4: Manual smoke test

- [ ] **Step 1: Build the plugin and launch Flipper**

```bash
cd /Users/mbhealth/Workspace/flipper/desktop && yarn build-plugin --plugin-path plugins/public/network
```

Then launch Flipper and connect a device/simulator that makes multipart/form-data requests (e.g. a file upload).

- [ ] **Step 2: Verify fix**

Click a `multipart/form-data` request in the Network tab.

Expected:
- No UI freeze
- Request Body panel shows a table with one row per part
- Text fields show their value (e.g. `username: alice`)
- File fields show `<name> (file): photo.jpg · image/jpeg · 2.3 MB`

- [ ] **Step 3: Verify non-multipart requests are unaffected**

Click a `application/json` request. Confirm it still renders with the JSON inspector as before.

Click a `application/x-www-form-urlencoded` request. Confirm it still renders with the form fields inspector.
