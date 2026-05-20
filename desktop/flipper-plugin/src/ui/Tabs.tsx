/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import * as React from 'react';
import {Tabs as AntdTabs, TabsProps} from 'antd';
import {css, cx} from '@emotion/css';
import {Layout} from './Layout';
import {Spacing} from './theme';
import {useLocalStorageState} from '../utils/useLocalStorageState';

/**
 * A Tabs component.
 */
export function Tabs({
  grow,
  children,
  className,
  localStorageKeyOverride, //set this if you need to have a dynamic number of tabs, you do *not* need to namespace with the plugin name
  ...baseProps
}: {grow?: boolean; localStorageKeyOverride?: string} & TabsProps) {
  const keys: string[] = baseProps.items?.map((item) => item.key as string) ?? [];

  // Convert child Tab components into antd v5 items format
  const childItems = React.Children.toArray(children)
    .filter((child): child is React.ReactElement => React.isValidElement(child))
    .map((child, idx) => {
      const tabKey =
        (child.props.tabKey && typeof child.props.tabKey === 'string' && child.props.tabKey) ||
        (child.props.tab && typeof child.props.tab === 'string' && child.props.tab) ||
        (typeof child.key === 'string' && child.key) ||
        `tab_${idx}`;
      keys.push(tabKey);
      return {
        key: tabKey,
        label: child.props.tab,
        disabled: child.props.disabled,
        children: (
          <Layout.Container
            gap={child.props.gap}
            pad={child.props.pad}
            grow
            style={{maxWidth: '100%'}}>
            {child.props.children}
          </Layout.Container>
        ),
      };
    });

  const items =
    childItems.length > 0
      ? [...(baseProps.items ?? []), ...childItems]
      : baseProps.items;

  const [activeTab, setActiveTab] = useLocalStorageState<string | undefined>(
    `Tabs:${localStorageKeyOverride ?? keys.join(',')}`,
    undefined,
  );

  return (
    <AntdTabs
      activeKey={keys.includes(activeTab ?? 'not-there') ? activeTab : keys[0]}
      onChange={(key) => {
        setActiveTab(key);
      }}
      {...baseProps}
      items={items}
      className={cx(
        className,
        baseTabs,
        grow !== false ? growingTabs : undefined,
      )}
    />
  );
}

export type TabProps = {
  tab: React.ReactNode;
  tabKey?: string;
  pad?: Spacing;
  gap?: Spacing;
  disabled?: boolean;
  children?: React.ReactNode;
};

/**
 * A tab pane. Must be used as a direct child of Tabs.
 * Props are consumed by the parent Tabs component to build the items array.
 */
export const Tab: React.FC<TabProps> = function Tab() {
  return null;
};

const baseTabs = css`
  & .ant-tabs-nav {
    margin: 0;
    padding-left: 8px;
    padding-right: 8px;
  }
`;

const growingTabs = css`
  flex: 1;
  & .tabpanel {
    display: flex;
  }
  & .ant-tabs-content {
    height: 100%;
  }
  & .ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
`;
