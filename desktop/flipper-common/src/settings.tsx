/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

export enum Tristate {
  True,
  False,
  Unset,
}

/** Settings used by both Server and UI.
 * TODO: some settings might be flipper environment specific,
 * and should ideally bemoved to local storage, like 'darkMode'
 */
export type Settings = {
  androidHome: string;
  enableAndroid: boolean;
  enableIOS: boolean;
  enablePhysicalIOS: boolean;
  /**
   * If unset, this will assume the value of the GK setting.
   * Note that this setting has no effect in the open source version
   * of Flipper.
   */
  enablePrefetching: Tristate;
  idbPath: string;
  darkMode: 'dark' | 'light' | 'system';
  showWelcomeAtStartup: boolean;
  suppressPluginErrors: boolean;
  persistDeviceData: boolean;
  /**
   * Plugin marketplace - allow internal plugin distribution
   */
  enablePluginMarketplace: boolean;
  marketplaceURL: string;
  enablePluginMarketplaceAutoUpdate: boolean;
  /**
   * List of ADB servers to connect to. Each entry creates an independent
   * device watcher. Devices from a server with a non-empty label are shown
   * as `<device name> [<label>]` in the UI.
   *
   * Replaces adbKitSettings. If absent, falls back to adbKitSettings or
   * env vars (ANDROID_ADB_SERVER_PORT / ADB_SERVER_SOCKET).
   */
  adbServers?: Array<{
    label: string;
    host: string;
    port: number;
  }>;
  /** @deprecated Use adbServers instead. */
  adbKitSettings?: {
    host?: string;
    port?: number;
  };
  server?: {
    enabled: boolean;
  };
};

export enum ReleaseChannel {
  DEFAULT = 'default',
  STABLE = 'stable',
  INSIDERS = 'insiders',
}

/** Launcher settings only appllied to Electron, and aren't managed or relevant for flipper-server */
export type LauncherSettings = {
  releaseChannel: ReleaseChannel;
  ignoreLocalPin: boolean;
};

// Settings that primarily only applied to Electron atm
// TODO: further separate between flipper-ui config and Electron config
export type ProcessConfig = {
  disabledPlugins: string[];
  lastWindowPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  screenCapturePath: string | null;
  launcherMsg: string | null;
  // Controls whether to delegate to the launcher if present.
  launcherEnabled: boolean;
  updaterEnabled: boolean;
  // Control whether to suppress "update available" notifications
  suppressPluginUpdateNotifications?: boolean;
};

export type Platform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd';

export type EnvironmentInfo = {
  processId: number;
  isProduction: boolean;
  releaseChannel: ReleaseChannel;
  flipperReleaseRevision?: string;
  appVersion: string;
  os: {
    arch: string;
    platform: Platform;
    unixname: string;
  };
  versions: {
    node: string;
    platform: string;
  };
};
