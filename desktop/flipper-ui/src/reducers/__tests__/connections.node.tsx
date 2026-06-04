/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import reducer, {selectClient, selectDevice} from '../connections';
import {State, selectPlugin} from '../connections';
import {
  _SandyPluginDefinition,
  _setFlipperLibImplementation,
  TestUtils,
} from 'flipper-plugin';
import {
  createMockFlipperWithPlugin,
  MockFlipperResult,
} from '../../__tests__/test-utils/createMockFlipperWithPlugin';
import {Store} from '..';
import {getActiveClient, getActiveDevice} from '../../selectors/connections';
import Client from '../../Client';
import {
  mockConsole,
  MockedConsole,
} from '../../__tests__/test-utils/mockConsole';
import {TestDevice} from '../../devices/TestDevice';
import BaseDevice from '../../devices/BaseDevice';

let mockedConsole: MockedConsole;
beforeEach(() => {
  mockedConsole = mockConsole();
  _setFlipperLibImplementation(TestUtils.createMockFlipperLib());
});

afterEach(() => {
  mockedConsole.unmock();
  _setFlipperLibImplementation(undefined);
});

test('doing a double REGISTER_DEVICE fails', () => {
  const device1 = new TestDevice('serial', 'physical', 'title', 'Android');
  const device2 = new TestDevice('serial', 'physical', 'title2', 'Android');
  const initialState: State = reducer(undefined, {
    type: 'REGISTER_DEVICE',
    payload: device1,
  });
  expect(initialState.devices.length).toBe(1);
  expect(initialState.devices[0]).toBe(device1);

  expect(() => {
    reducer(initialState, {
      type: 'REGISTER_DEVICE',
      payload: device2,
    });
  }).toThrow('still connected');
});

test('selectPlugin sets deepLinkPayload correctly', () => {
  const device1 = new TestDevice(
    'http://localhost:8081',
    'emulator',
    'React Native',
    'Metro',
  );
  let state = reducer(undefined, {
    type: 'REGISTER_DEVICE',
    payload: device1,
  });
  state = reducer(
    undefined,
    selectPlugin({
      selectedPlugin: 'myPlugin',
      deepLinkPayload: 'myPayload',
      selectedDevice: device1,
    }),
  );
  expect(state.deepLinkPayload).toBe('myPayload');
});

test('can handle plugins that throw at start', async () => {
  const TestPlugin = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      Component() {
        return null;
      },
      plugin() {
        throw new Error('Broken plugin');
      },
    },
  );

  const {client, store, createClient, createDevice} =
    await createMockFlipperWithPlugin(TestPlugin);

  // not initialized
  expect(client.sandyPluginStates.get(TestPlugin.id)).toBe(undefined);

  expect(store.getState().connections.clients.size).toBe(1);
  expect(client.connected.get()).toBe(true);

  expect((console.error as any).mock.calls[0]).toMatchInlineSnapshot(`
    [
      "Failed to start plugin 'TestPlugin': ",
      [Error: Broken plugin],
    ]
  `);

  const device2 = await createDevice({});
  const client2 = await createClient(device2, client.query.app);

  expect((console.error as any).mock.calls[1]).toMatchInlineSnapshot(`
    [
      "Failed to start plugin 'TestPlugin': ",
      [Error: Broken plugin],
    ]
  `);
  expect(store.getState().connections.clients.size).toBe(2);
  expect(client2.connected.get()).toBe(true);
  expect(client2.sandyPluginStates.size).toBe(0);
});

test('can handle device plugins that throw at start', async () => {
  const TestPlugin = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      Component() {
        return null;
      },
      devicePlugin() {
        throw new Error('Broken device plugin');
      },
    },
  );

  const {device, store, createDevice} =
    await createMockFlipperWithPlugin(TestPlugin);

  expect(mockedConsole.errorCalls[0]).toMatchInlineSnapshot(`
    [
      "Failed to start device plugin 'TestPlugin': ",
      [Error: Broken device plugin],
    ]
  `);

  // not initialized
  expect(device.sandyPluginStates.get(TestPlugin.id)).toBe(undefined);

  expect(store.getState().connections.devices.length).toBe(1);
  expect(device.connected.get()).toBe(true);

  const device2 = await createDevice({});
  expect(store.getState().connections.devices.length).toBe(2);
  expect(device2.connected.get()).toBe(true);
  expect(mockedConsole.errorCalls[1]).toMatchInlineSnapshot(`
    [
      "Failed to start device plugin 'TestPlugin': ",
      [Error: Broken device plugin],
    ]
  `);
  expect(device2.sandyPluginStates.size).toBe(0);
});

describe('selection changes', () => {
  const TestPlugin1 = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      Component() {
        return null;
      },
      plugin() {
        return {};
      },
    },
  );
  const TestPlugin2 = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      Component() {
        return null;
      },
      plugin() {
        return {};
      },
    },
  );
  const DevicePlugin1 = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails({pluginType: 'device'}),
    {
      Component() {
        return null;
      },
      devicePlugin() {
        return {};
      },
    },
  );

  let device1: BaseDevice;
  let device2: BaseDevice;
  let d1app1: Client;
  let _d1app2: Client;
  let d2app2: Client;
  let store: Store;
  let mockFlipper: MockFlipperResult;

  beforeEach(async () => {
    mockFlipper = await createMockFlipperWithPlugin(TestPlugin1, {
      additionalPlugins: [TestPlugin2, DevicePlugin1],
      supportedPlugins: [TestPlugin1.id, TestPlugin2.id, DevicePlugin1.id],
    });

    device1 = mockFlipper.device;
    device2 = mockFlipper.createDevice({});
    d1app1 = mockFlipper.client;
    _d1app2 = await mockFlipper.createClient(device1, 'd1app2');
    d2app2 = await mockFlipper.createClient(device2, 'd2app2');
    store = mockFlipper.store;
  });

  test('basic/ device selection change', async () => {
    // initial selection is the first client registered (d1app1); subsequent
    // devices/clients must not steal the selection while device1 is connected.
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device1,
      selectedPlugin: TestPlugin1.id,
      selectedAppId: d1app1.id,
      // no preferences changes, no explicit selection was made
      userPreferredDevice: device1.title,
      userPreferredPlugin: TestPlugin1.id,
      userPreferredApp: d1app1.query.app,
    });
    expect(getActiveClient(store.getState())).toBe(d1app1);
    expect(getActiveDevice(store.getState())).toBe(device1);

    // select plugin 2 on d2app2
    store.dispatch(
      selectPlugin({
        selectedPlugin: TestPlugin2.id,
        selectedAppId: d2app2.id,
      }),
    );
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device2,
      selectedPlugin: TestPlugin2.id,
      selectedAppId: d2app2.id,
      userPreferredDevice: device2.title,
      userPreferredPlugin: TestPlugin2.id,
      userPreferredApp: d2app2.query.app,
    });

    // disconnect currently-selected device2, and then register a new
    // device should select it
    device2.disconnect();
    const device3 = await mockFlipper.createDevice({});
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device3,
      selectedPlugin: TestPlugin2.id,
      selectedAppId: null,
      // prefs not updated
      userPreferredDevice: device2.title,
      userPreferredPlugin: TestPlugin2.id,
      userPreferredApp: d2app2.query.app,
    });

    store.dispatch(selectDevice(device1));
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device1,
      selectedPlugin: TestPlugin2.id,
      selectedAppId: null,
      userPreferredDevice: device1.title,
      // other prefs not updated
      userPreferredPlugin: TestPlugin2.id,
      userPreferredApp: d2app2.query.app,
    });

    // used by plugin list, to keep main device / app selection correct
    expect(getActiveClient(store.getState())).toBe(null);
    expect(getActiveDevice(store.getState())).toBe(device1);
  });

  test('introducing new client does not select it', async () => {
    await mockFlipper.createClient(device2, 'd2app3');
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device1,
      selectedPlugin: TestPlugin1.id,
      selectedAppId: d1app1.id,
      // other prefs not updated
      userPreferredDevice: device1.title,
      userPreferredPlugin: TestPlugin1.id,
      userPreferredApp: d1app1.query.app,
    });
  });

  test('introducing new client matching userPreferredApp does NOT steal selection while current device is connected', async () => {
    await mockFlipper.createClient(
      device2,
      store.getState().connections.userPreferredApp!,
    );
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device1,
      selectedPlugin: TestPlugin1.id,
      selectedAppId: d1app1.id,
      userPreferredDevice: device1.title,
      userPreferredPlugin: TestPlugin1.id,
      userPreferredApp: d1app1.query.app,
    });
  });

  test('introducing new client does NOT steal selection when only the selected client dropped (device still connected)', async () => {
    d1app1.disconnect();
    await mockFlipper.createClient(device2, 'd2app3');
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device1,
      selectedAppId: d1app1.id,
    });
  });

  test('introducing new client DOES steal selection when selected device is disconnected', async () => {
    device1.disconnect();
    const client3 = await mockFlipper.createClient(device2, 'd2app3');
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device2,
      selectedAppId: client3.id,
    });
  });

  test('select client', () => {
    store.dispatch(selectClient(d2app2.id));
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device2,
      selectedPlugin: TestPlugin1.id,
      selectedAppId: d2app2.id,
      userPreferredDevice: device2.title,
      userPreferredPlugin: TestPlugin1.id,
      userPreferredApp: d2app2.query.app,
    });
  });

  test('select device', () => {
    store.dispatch(selectDevice(device1));
    expect(store.getState().connections).toMatchObject({
      selectedDevice: device1,
      selectedPlugin: TestPlugin1.id,
      selectedAppId: null,
      userPreferredDevice: device1.title,
      // other prefs not updated
      userPreferredPlugin: TestPlugin1.id,
      userPreferredApp: d1app1.query.app,
    });
  });

  test('new device matching userPreferredDevice does NOT steal selection', () => {
    const device3 = new TestDevice(
      'serial-3',
      'physical',
      device1.title,
      'Android',
    );
    store.dispatch({type: 'REGISTER_DEVICE', payload: device3});
    expect(store.getState().connections.selectedDevice).toBe(device1);
    expect(store.getState().connections.selectedAppId).toBe(d1app1.id);
  });
});

test('CLIENT_RECONNECTED replaces stale client and updates selectedAppId', async () => {
  const TestPlugin = new _SandyPluginDefinition(
    TestUtils.createMockPluginDetails(),
    {
      plugin(_client: any) {
        return {};
      },
      Component() {
        return null;
      },
    },
  );
  const {
    store,
    device,
    client: oldClient,
    createClient,
  } = await createMockFlipperWithPlugin(TestPlugin);

  store.dispatch(
    selectPlugin({
      selectedPlugin: TestPlugin.id,
      selectedAppId: oldClient.id,
      selectedDevice: device,
    }),
  );
  expect(store.getState().connections.selectedAppId).toBe(oldClient.id);
  expect(store.getState().connections.selectedPlugin).toBe(TestPlugin.id);

  oldClient.disconnect();

  // Create a new client with a distinct query (different device_id simulates new session)
  const newClient = await createClient(device, oldClient.query.app, {
    ...oldClient.query,
    app: oldClient.query.app,
    device_id: `${device.serial}-session2`,
  });

  expect(newClient.id).not.toBe(oldClient.id);

  store.dispatch({
    type: 'CLIENT_RECONNECTED',
    payload: {oldClientId: oldClient.id, newClient},
  });

  expect(store.getState().connections.clients.has(oldClient.id)).toBe(false);
  expect(store.getState().connections.clients.has(newClient.id)).toBe(true);
  expect(store.getState().connections.selectedAppId).toBe(newClient.id);
  expect(store.getState().connections.selectedPlugin).toBe(TestPlugin.id);
});

test('NEW_CLIENT initializes Network as enabled for first-time apps', () => {
  const device = new TestDevice('serial-1', 'emulator', 'Test', 'Android');
  const mockClient = {
    id: 'com.example.MyApp#Android#serial-1',
    query: {
      app: 'com.example.MyApp',
      os: 'Android' as const,
      device: 'Test',
      device_id: 'serial-1',
      medium: 1,
    },
    device,
  } as any;

  let state = reducer(undefined, {type: 'REGISTER_DEVICE', payload: device});
  state = reducer(state, {type: 'NEW_CLIENT', payload: mockClient});

  expect(state.enabledPlugins['com.example.MyApp']).toEqual(['Network']);
});

test('NEW_CLIENT does not re-enable Network after user has disabled it', () => {
  const device = new TestDevice('serial-1', 'emulator', 'Test', 'Android');
  const mockClient = {
    id: 'com.example.MyApp#Android#serial-1',
    query: {
      app: 'com.example.MyApp',
      os: 'Android' as const,
      device: 'Test',
      device_id: 'serial-1',
      medium: 1,
    },
    device,
  } as any;

  // First connection — Network auto-enabled
  let state = reducer(undefined, {type: 'REGISTER_DEVICE', payload: device});
  state = reducer(state, {type: 'NEW_CLIENT', payload: mockClient});
  expect(state.enabledPlugins['com.example.MyApp']).toContain('Network');

  // User disables Network
  state = reducer(state, {
    type: 'SET_PLUGIN_DISABLED',
    payload: {pluginId: 'Network', selectedApp: 'com.example.MyApp'},
  });
  expect(state.enabledPlugins['com.example.MyApp']).not.toContain('Network');

  // Reconnect — must NOT re-enable Network
  state = reducer(state, {type: 'NEW_CLIENT', payload: mockClient});
  expect(state.enabledPlugins['com.example.MyApp']).not.toContain('Network');
});
