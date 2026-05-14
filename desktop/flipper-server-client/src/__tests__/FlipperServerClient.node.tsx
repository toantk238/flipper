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
  MockRWS.mockClear();
  createFlipperServer(host, port, () => token, () => {}, secure);
  expect(MockRWS).toHaveBeenCalledTimes(1);
  const urlProvider = MockRWS.mock.calls[0][0] as () => string;
  return urlProvider();
}

describe('createFlipperServer - WebSocket URL construction', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('HTTP on localhost: uses ws:// with port', () => {
    expect(captureUrl('localhost', 52342, 'my-token')).toBe(
      'ws://localhost:52342?token=my-token',
    );
  });

  test('HTTPS no port: uses wss:// and omits port suffix when port is NaN', () => {
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

  // Separate test from the explicit `false` case above to verify the default
  // (undefined) also produces ws://, not just explicit false.
  test('secure omitted: defaults to ws://', () => {
    expect(captureUrl('localhost', 52342, 'my-token', undefined)).toBe(
      'ws://localhost:52342?token=my-token',
    );
  });
});
