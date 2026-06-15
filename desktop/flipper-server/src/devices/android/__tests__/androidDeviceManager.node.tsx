/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {buildDeviceName} from '../androidDeviceManager';

test('appends label in brackets when label is non-empty', () => {
  expect(buildDeviceName('Pixel 6', 'remote')).toBe('Pixel 6 [remote]');
});

test('returns name unchanged when label is empty string', () => {
  expect(buildDeviceName('Pixel 6', '')).toBe('Pixel 6');
});

test('applies label to emulator names', () => {
  expect(buildDeviceName('Pixel_6_API_33', 'ci')).toBe('Pixel_6_API_33 [ci]');
});
