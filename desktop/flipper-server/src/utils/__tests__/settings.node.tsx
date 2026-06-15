/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {resolveAdbServers} from '../settings';
import type {Settings} from 'flipper-common';

const BASE: Settings = {
  androidHome: '/sdk',
  enableAndroid: true,
  enableIOS: false,
  enablePhysicalIOS: false,
  enablePrefetching: 2, // Tristate.Unset = 2
  idbPath: '',
  darkMode: 'light',
  showWelcomeAtStartup: false,
  suppressPluginErrors: false,
  persistDeviceData: false,
  enablePluginMarketplace: false,
  marketplaceURL: '',
  enablePluginMarketplaceAutoUpdate: false,
};

test('returns adbServers as-is when present', () => {
  const settings: Settings = {
    ...BASE,
    adbServers: [
      {label: '', host: '127.0.0.1', port: 5037},
      {label: 'remote', host: '127.0.0.1', port: 5038},
    ],
  };
  expect(resolveAdbServers(settings)).toEqual([
    {label: '', host: '127.0.0.1', port: 5037},
    {label: 'remote', host: '127.0.0.1', port: 5038},
  ]);
});

test('migrates adbKitSettings to single-entry array when adbServers is absent', () => {
  const settings: Settings = {
    ...BASE,
    adbKitSettings: {host: '::1', port: 5038},
  };
  expect(resolveAdbServers(settings)).toEqual([
    {label: '', host: '::1', port: 5038},
  ]);
});

test('fills in defaults when migrating adbKitSettings with missing fields', () => {
  const settings: Settings = {...BASE, adbKitSettings: {}};
  expect(resolveAdbServers(settings)).toEqual([
    {label: '', host: '127.0.0.1', port: 5037},
  ]);
});

test('falls back to default server when both adbServers and adbKitSettings are absent', () => {
  delete process.env.ANDROID_ADB_SERVER_PORT;
  delete process.env.ADB_SERVER_SOCKET;
  expect(resolveAdbServers(BASE)).toEqual([
    {label: '', host: '127.0.0.1', port: 5037},
  ]);
});

test('ignores adbKitSettings when adbServers is present', () => {
  const settings: Settings = {
    ...BASE,
    adbServers: [{label: 'primary', host: '127.0.0.1', port: 5037}],
    adbKitSettings: {host: '::1', port: 9999},
  };
  expect(resolveAdbServers(settings)).toEqual([
    {label: 'primary', host: '127.0.0.1', port: 5037},
  ]);
});
