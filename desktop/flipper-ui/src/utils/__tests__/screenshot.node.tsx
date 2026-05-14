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
import BaseDevice from '../../devices/BaseDevice';

jest.mock('flipper-common', () => ({
  ...jest.requireActual('flipper-common'),
  reportPlatformFailures: <T,>(promise: Promise<T>) => promise,
}));

jest.mock('../exportFile', () => ({
  exportFileBinary: jest.fn(),
}));

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
    } as unknown as BaseDevice;

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
    } as unknown as BaseDevice;

    await capture(mockDevice);

    expect(exportFileModule.exportFileBinary).not.toHaveBeenCalled();
    expect(mockDevice.screenshot).not.toHaveBeenCalled();
  });

  it('throws when screenshot() returns null/undefined', async () => {
    const mockDevice = {
      connected: {get: () => true},
      description: {deviceType: 'physical', os: 'iOS'},
      screenshot: jest.fn().mockResolvedValue(undefined),
    } as unknown as BaseDevice;

    await expect(capture(mockDevice)).rejects.toThrow(
      /does not support taking screenshots/,
    );
  });
});
