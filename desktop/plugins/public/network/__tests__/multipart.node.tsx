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
  return new Uint8Array(Buffer.from(lines.join(''), 'utf-8'));
}

test('parses text fields from multipart body', () => {
  const boundary = 'testboundary';
  const body = makeMultipartBody(boundary, [
    'Content-Disposition: form-data; name="username"\r\n\r\nalice\r\n',
    'Content-Disposition: form-data; name="email"\r\n\r\nalice@example.com\r\n',
  ]);
  const parts = parseMultipartBody(body, boundary);
  expect(parts).toHaveLength(2);
  expect(parts[0]).toEqual({
    name: 'username',
    textValue: 'alice',
    byteLength: 5,
  });
  expect(parts[1]).toEqual({
    name: 'email',
    textValue: 'alice@example.com',
    byteLength: 17,
  });
});

test('parses file fields — records metadata, not binary content', () => {
  const boundary = 'testboundary';
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]);
  const header =
    'Content-Disposition: form-data; name="avatar"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n';
  const trailer = '\r\n';
  const prefix = new Uint8Array(
    Buffer.from(`--${boundary}\r\n${header}`, 'utf-8'),
  );
  const suffix = new Uint8Array(
    Buffer.from(`${trailer}--${boundary}--\r\n`, 'utf-8'),
  );
  const combined = new Uint8Array(
    prefix.length + fakeJpeg.length + suffix.length,
  );
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
  const body = new Uint8Array(
    Buffer.from('this is not a multipart body', 'utf-8'),
  );
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
