/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import reducer, {State} from '../pluginMessageQueue';

test('CLIENT_RECONNECTED re-keys queued messages from old to new client ID', () => {
  // Client IDs contain '#' themselves; pluginKeys are ${clientId}#${pluginName}
  const oldClientId = 'com.example.app#device-serial#old-session';
  const newClientId = 'com.example.app#device-serial#new-session';

  const initial: State = {
    [`${oldClientId}#Network`]: [{method: 'networkRequest', rawSize: 100}],
    [`${oldClientId}#Layout`]: [{method: 'layoutUpdate', rawSize: 50}],
    'other.app#device-serial#session1#Logs': [{method: 'log', rawSize: 20}],
  };

  const next = reducer(initial, {
    type: 'CLIENT_RECONNECTED',
    payload: {oldClientId, newClient: {id: newClientId}},
  });

  // Old keys removed
  expect(next[`${oldClientId}#Network`]).toBeUndefined();
  expect(next[`${oldClientId}#Layout`]).toBeUndefined();
  // Re-keyed to new client
  expect(next[`${newClientId}#Network`]).toEqual([
    {method: 'networkRequest', rawSize: 100},
  ]);
  expect(next[`${newClientId}#Layout`]).toEqual([
    {method: 'layoutUpdate', rawSize: 50},
  ]);
  // Unrelated client untouched
  expect(next['other.app#device-serial#session1#Logs']).toEqual([
    {method: 'log', rawSize: 20},
  ]);
});
