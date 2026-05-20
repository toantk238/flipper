/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

// https://github.com/eslint/eslint/issues/14061#issuecomment-772490154
// In ESLint 9, getRules() was removed. Use builtinRules from the internal API.
const {builtinRules} = require('eslint/use-at-your-own-risk');
module.exports = builtinRules.get('no-restricted-imports');
