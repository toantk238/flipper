/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @jest-environment node
 */

import {RuleTester} from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import rule, {RULE_NAME} from '../noIPrefixInterfaces';

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      sourceType: 'module',
      ecmaVersion: 2020,
    },
  },
});

tester.run(RULE_NAME, rule, {
  valid: [
    {
      code: `interface Icon {name: string}`,
      filename: __filename,
    },
    {
      code: `interface IOSDevice {version: string}`,
      filename: __filename,
    },
  ],
  invalid: [
    {
      code: `interface IDevice {version: string;}`,
      filename: __filename,
      errors: [{messageId: 'noTsInterfacePrefixI'}],
    },
  ],
});
