/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import 'core-js/stable/structured-clone';
import 'fake-indexeddb/auto';
import {TestUtils} from 'flipper-plugin';
import * as NetworkPlugin from '../index';
import {truncateMiddle} from '../index';

test('returns strings at or below maxLength unchanged', () => {
  expect(truncateMiddle('/api/v1')).toBe('/api/v1');
  const fifty = 'a'.repeat(50);
  expect(truncateMiddle(fifty)).toBe(fifty);
  expect(truncateMiddle('')).toBe('');
});

test('truncates long strings with ellipsis in the middle', () => {
  // maxLength=10: startLen=5, endLen=4 → 'abcde…ijkl'
  expect(truncateMiddle('abcdefghijkl', 10)).toBe('abcde…ijkl');
});

test('result length equals maxLength for truncated strings', () => {
  const result = truncateMiddle('a'.repeat(51));
  expect(result.length).toBe(50);
  expect(result).toContain('…');
});

test('preserves end of string (most specific path segment)', () => {
  const path = '/api/v2/users/12345678/profile/settings/notifications/read';
  const result = truncateMiddle(path, 30);
  // endLen=floor(29/2)=14, so last 14 chars are preserved
  expect(result.endsWith(path.slice(-14))).toBe(true);
  expect(result.length).toBe(30);
});

test('handles maxLength <= 1 edge cases', () => {
  expect(truncateMiddle('abcdef', 0)).toBe('');
  expect(truncateMiddle('abcdef', 1)).toBe('a');
});

test('pathOnly defaults to true', () => {
  const {instance} = TestUtils.startPlugin(NetworkPlugin);
  expect(instance.pathOnly.get()).toBe(true);
});

test('togglePathOnly flips the state', () => {
  const {instance} = TestUtils.startPlugin(NetworkPlugin);
  instance.togglePathOnly();
  expect(instance.pathOnly.get()).toBe(false);
  instance.togglePathOnly();
  expect(instance.pathOnly.get()).toBe(true);
});
