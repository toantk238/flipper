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
import rule, {RULE_NAME} from '../noConsoleErrorWithoutContext';

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
      code: `console.error("I've made a big mistake:", err);`,
      filename: __filename,
    },
    {
      code: `console.error("This should never happen.");`,
      filename: __filename,
    },
    {
      code: `console.error("Failed to open user settings: " + err);`,
      filename: __filename,
    },
    {
      code: `console.warn(e);`,
      filename: __filename,
    },
  ],
  invalid: [
    {
      code: `console.error(err);`,
      filename: __filename,
      errors: [{messageId: 'noConsoleErrorWithoutContext'}],
    },
    {
      code: `console.error(err, "Too late for context.");`,
      filename: __filename,
      errors: [{messageId: 'noConsoleErrorWithoutContext'}],
    },
  ],
});
