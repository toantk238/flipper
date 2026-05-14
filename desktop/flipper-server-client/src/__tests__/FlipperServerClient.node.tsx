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
