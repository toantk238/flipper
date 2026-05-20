/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

const os = require('os');

/** @type {import('jest').Config} */
module.exports = {
  transform: {
    '^.*__tests?__(/|\\\\).*\\.tsx?$': ['ts-jest', {isolatedModules: true}],
    '\\.(js|tsx?)$': '<rootDir>/scripts/jest-transform.js',
  },
  setupFiles: ['<rootDir>/scripts/jest-setup.tsx'],
  setupFilesAfterEnv: ['<rootDir>/scripts/jest-setup-after.tsx'],
  moduleNameMapper: {
    '^flipper$': '<rootDir>/deprecated-exports/src',
    '^flipper-plugin$': '<rootDir>/flipper-plugin/src',
    '^flipper-(server|common|ui)$': '<rootDir>/flipper-$1/src',
    '^flipper-(pkg|pkg-lib|test-utils)$': '<rootDir>/$1/src',
    '^.+\\.(css|scss)$': '<rootDir>/scripts/jest-css-stub.js',
    // antd v6 icons exports an ESM-only "node" condition; force CJS build for jest
    '^@ant-design/icons$': '<rootDir>/node_modules/@ant-design/icons/lib/index.js',
  },
  modulePathIgnorePatterns: ['<rootDir>/(?!node_modules).*/lib/'],
  clearMocks: true,
  maxWorkers: os.cpus().length > 10 ? 8 : '50%',
  coverageReporters: [
    'json-summary',
    'lcov',
    'html',
    ...(process.env.COVERAGE_TEXT === 'detailed' ? ['text'] : []),
  ],
  testMatch: ['**/**.(node|spec).(ts|tsx)'],
  testEnvironment: 'jsdom',
  resolver: '<rootDir>/jest.resolver.js',
  // Prettier 3 changed its API; disable Prettier for inline snapshot formatting
  prettierPath: null,
  // react-markdown v8+ and its deps are ESM-only; transform them through babel
  transformIgnorePatterns: [
    'node_modules/(?!(react-markdown|is-plain-obj|comma-separated-tokens|hast-util-whitespace|property-information|remark-parse|mdast-util-from-markdown|decode-named-character-reference|character-entities|mdast-util-to-string|micromark|micromark-core-commonmark|micromark-factory-destination|micromark-util-character|micromark-util-symbol|micromark-util-types|micromark-factory-label|micromark-factory-space|micromark-factory-title|micromark-factory-whitespace|micromark-util-chunked|micromark-util-classify-character|micromark-util-html-tag-name|micromark-util-normalize-identifier|micromark-util-resolve-all|micromark-util-subtokenize|micromark-util-combine-extensions|micromark-util-decode-numeric-character-reference|micromark-util-encode|micromark-util-sanitize-uri|micromark-util-decode-string|unist-util-stringify-position|unified|bail|trough|vfile|vfile-message|remark-rehype|mdast-util-to-hast|mdast-util-definitions|unist-util-visit|unist-util-is|unist-util-visit-parents|trim-lines|unist-util-generated|unist-util-position|space-separated-tokens)/)',
  ],
};
