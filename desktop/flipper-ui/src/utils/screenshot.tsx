/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {reportPlatformFailures} from 'flipper-common';
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
