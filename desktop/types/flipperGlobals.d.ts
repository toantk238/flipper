/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

declare const __REVISION__: string | undefined;
declare const __VERSION__: string;

declare module 'react-virtualized-auto-sizer' {
  import React from 'react';
  type Size = {width: number; height: number};
  type Props = {
    children: (size: Size) => React.ReactNode;
    className?: string;
    defaultHeight?: number;
    defaultWidth?: number;
    disableHeight?: boolean;
    disableWidth?: boolean;
    nonce?: string;
    onResize?: (size: Size) => void;
    style?: React.CSSProperties;
    tagName?: string;
  };
  const AutoSizer: React.ComponentType<Props>;
  export default AutoSizer;
}
