/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import {Store} from '../../reducers/index';
import {getErrorFromErrorLike, getStringFromErrorLike} from 'flipper-common';
import {LoggerArgs, Logger} from 'flipper-common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jestFn = (globalThis as any).jest?.fn ?? (() => () => {});
const instance = {
  track: jestFn(),
  trackTimeSince: jestFn(),
  info: jestFn(),
  warn: jestFn(),
  error: jestFn(),
  debug: jestFn(),
};

export function LoggerExtractError(...data: Array<any>): {
  message: string;
  error: Error;
} {
  const message = getStringFromErrorLike(data);
  const error = getErrorFromErrorLike(data) ?? new Error(message);
  return {
    message,
    error,
  };
}

export function init(_store: Store, _args?: LoggerArgs): Logger {
  return instance;
}

export function getInstance(): Logger {
  return instance;
}
