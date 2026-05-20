/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

const path = require('path');
const {FlatCompat} = require('@eslint/eslintrc');
const _globals = require('globals');

// globals v11 has some keys with trailing whitespace; ESLint 9 rejects those.
// Strip whitespace from all global keys.
function cleanGlobals(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.trim(), v]));
}
const globals = {
  browser: cleanGlobals(_globals.browser),
  node: cleanGlobals(_globals.node),
  es2015: cleanGlobals(_globals.es2015),
  jest: cleanGlobals(_globals.jest),
  jasmine: cleanGlobals(_globals.jasmine),
};

const babelParser = require('@babel/eslint-parser');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const importPlugin = require('eslint-plugin-import');
const _headerPlugin = require('eslint-plugin-header');
// eslint-plugin-header@3.1.1 has no schema defined; ESLint 9 rejects rules
// without schema (defaults to 0 args). Patch it to accept any arguments.
const headerPlugin = {
  ..._headerPlugin,
  rules: {
    header: {
      ..._headerPlugin.rules.header,
      meta: {
        ..._headerPlugin.rules.header.meta,
        schema: {type: 'array', items: {}, minItems: 0},
      },
    },
  },
};
const prettierPlugin = require('eslint-plugin-prettier');
const promisePlugin = require('eslint-plugin-promise');
const nPlugin = require('eslint-plugin-n');
const communistSpellingPlugin = require('eslint-plugin-communist-spelling');
const rulesDirPlugin = require('eslint-plugin-rulesdir');
const ftFlowPlugin = require('eslint-plugin-ft-flow');
const flipperPlugin = require('eslint-plugin-flipper');

rulesDirPlugin.RULES_DIR = path.join(__dirname, 'eslint-rules');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

// enforces copy-right header and @format directive to be present in every file
const pattern = /^\*\r?\n[\S\s]*Meta Platforms, Inc\.[\S\s]* \* @format\r?\n/;

// This list should match the replacements defined in `replace-flipper-requires.ts` and `dispatcher/plugins.tsx`
const builtInModules = [
  'flipper',
  'flipper-plugin',
  'flipper-plugin-lib',
  'react',
  'react-dom',
  'antd',
  'immer',
  '@emotion/styled',
  '@ant-design/icons',
  '@testing-library/react',
  'jest',
  'ts-jest',
];

const prettierConfig = require('./.prettierrc.json');

// We should forbid using "flipper" import. However, we have hundreds of plugins using it.
// So we forbid it everywhere but in "plugins" directory.
// To do that we need to keep "error" level of linting for most imports, but downlevel warning for "flipper" import to "warn".
// It is not possible OOTB by eslint.
// Instead, we create a clone of the "no-restricted-imports" rule and use it to split out restricted imports in two groups: warn and error.
// https://github.com/eslint/eslint/issues/14061#issuecomment-772490154
const restrictedImportsUniversalErrorConfig = {
  patterns: [
    {
      group: ['flipper-plugin/*'],
      message:
        "Imports from nested flipper-plugin directories are not allowed. Import from 'flipper-plugin' module directly. If it is missing an export, add it there with corresponding documentation (https://fbflipper.com/docs/extending/flipper-plugin/).",
    },
    {
      group: ['flipper-common/*'],
      message:
        "Imports from nested flipper-common directories are not allowed. Import from 'flipper-common' module directly. If it is missing an export, add it there.",
    },
    {
      group: ['antd/*'],
      message:
        "Imports from nested antd directories are not allowed. Import from 'antd' module directly. If you want to import only a type, use `import type` syntax and silence this warning.",
    },
    {
      group: ['immer/*'],
      message:
        "Imports from nested antd directories are not allowed. Import from 'antd' module directly. If you want to import only a type, use `import type` syntax and silence this warning.",
    },
    {
      group: ['@emotion/styled/*'],
      message:
        "Imports from nested @emotion/styled directories are not allowed. Import from '@emotion/styled' module directly. If you want to import only a type, use `import type` syntax and silence this warning.",
    },
    {
      group: ['@ant-design/icons/*'],
      message:
        "Imports from nested @ant-design/icons directories are not allowed. Import from '@ant-design/icons' module directly. If you want to import only a type, use `import type` syntax and silence this warning.",
    },
  ],
};

// Inlined rules from eslint-config-fbjs (minus babel/ rules and removed/deprecated rules)
// eslint-config-fbjs cannot be loaded via FlatCompat because it requires hermes-eslint parser
const fbjsRules = {
  'comma-dangle': [1, 'always-multiline'],
  'no-cond-assign': 0,
  'no-console': [1, {allow: ['warn', 'error', 'time', 'timeEnd', 'timeStamp']}],
  'no-constant-condition': 0,
  'no-control-regex': 0,
  'no-debugger': 2,
  'no-dupe-args': 2,
  'no-dupe-keys': 2,
  'no-duplicate-case': 1,
  'no-empty-character-class': 1,
  'no-empty': 0,
  'no-ex-assign': 1,
  'no-extra-boolean-cast': 1,
  'no-extra-parens': [1, 'functions'],
  'no-extra-semi': 1,
  'no-func-assign': 2,
  'no-inner-declarations': 0,
  'no-invalid-regexp': 1,
  'no-irregular-whitespace': 1,
  'no-negated-in-lhs': 2,
  'no-obj-calls': 2,
  'no-regex-spaces': 1,
  'no-sparse-arrays': 2,
  'no-unreachable': 2,
  'use-isnan': 2,
  'valid-jsdoc': 0,
  'valid-typeof': 2,
  'no-unexpected-multiline': 0,
  'accessor-pairs': [1, {setWithoutGet: true}],
  'block-scoped-var': 0,
  complexity: 0,
  'consistent-return': 1,
  curly: [1, 'all'],
  'default-case': 0,
  'dot-notation': 0,
  'dot-location': 0,
  eqeqeq: [0, 'allow-null'],
  'guard-for-in': 0,
  'no-alert': 0,
  'no-caller': 2,
  'no-case-declarations': 0,
  'no-div-regex': 0,
  'no-else-return': 0,
  'no-empty-pattern': 1,
  'no-eq-null': 0,
  'no-eval': 2,
  'no-extend-native': 1,
  'no-extra-bind': 1,
  'no-fallthrough': 1,
  'no-floating-decimal': 2,
  'no-implicit-coercion': 0,
  'no-implied-eval': 2,
  'no-invalid-this': 0,
  'no-iterator': 0,
  'no-labels': [2, {allowLoop: true, allowSwitch: true}],
  'no-lone-blocks': 1,
  'no-loop-func': 0,
  'no-magic-numbers': 0,
  'no-multi-spaces': 0,
  'no-multi-str': 2,
  'no-native-reassign': 2,
  'no-new-func': 2,
  'no-new': 1,
  'no-new-wrappers': 1,
  'no-octal-escape': 1,
  'no-octal': 1,
  'no-param-reassign': 0,
  'no-process-env': 0,
  'no-proto': 2,
  'no-redeclare': 1,
  'no-return-assign': 0,
  'no-script-url': 2,
  'no-self-compare': 1,
  'no-sequences': 1,
  'no-throw-literal': 2,
  'no-unused-expressions': 0,
  'no-useless-call': 1,
  'no-useless-concat': 1,
  'no-void': 0,
  'no-warning-comments': 0,
  'no-with': 0,
  radix: 1,
  'vars-on-top': 0,
  'wrap-iife': 0,
  yoda: 0,
  strict: 0,
  'init-declarations': 0,
  'no-catch-shadow': 2,
  'no-delete-var': 2,
  'no-label-var': 1,
  'no-shadow-restricted-names': 1,
  'no-shadow': 0,
  'no-undef-init': 0,
  'no-undef': 2,
  'no-undefined': 0,
  'no-unused-vars': [1, {args: 'none', varsIgnorePattern: '^_'}],
  'no-use-before-define': 0,
  'callback-return': 0,
  'global-require': 0,
  'handle-callback-err': 0,
  'no-mixed-requires': 0,
  'no-new-require': 0,
  'no-path-concat': 0,
  'no-process-exit': 0,
  'no-restricted-modules': 0,
  'no-sync': 0,
  'array-bracket-spacing': 1,
  'block-spacing': 0,
  'brace-style': [1, '1tbs', {allowSingleLine: true}],
  camelcase: [0, {properties: 'always'}],
  'comma-spacing': [1, {before: false, after: true}],
  'comma-style': [1, 'last'],
  'computed-property-spacing': [1, 'never'],
  'consistent-this': [0, 'self'],
  'eol-last': 0,
  'func-names': 0,
  'func-style': [0, 'declaration'],
  'id-length': 0,
  'id-match': 0,
  indent: [1, 2, {SwitchCase: 1}],
  'jsx-quotes': [1, 'prefer-double'],
  'key-spacing': [1, {beforeColon: false, afterColon: true}],
  'linebreak-style': [1, 'unix'],
  'max-len': 0,
  'max-nested-callbacks': 0,
  'new-cap': [1, {newIsCap: true, capIsNew: false}],
  'new-parens': 1,
  'newline-after-var': 0,
  'no-array-constructor': 1,
  'no-continue': 0,
  'no-inline-comments': 0,
  'no-lonely-if': 0,
  'no-mixed-spaces-and-tabs': 1,
  'no-multiple-empty-lines': 0,
  'no-nested-ternary': 0,
  'no-new-object': 1,
  'no-restricted-syntax': 0,
  'no-spaced-func': 1,
  'no-ternary': 0,
  'no-trailing-spaces': 0,
  'no-underscore-dangle': 0,
  'no-unneeded-ternary': 0,
  'object-curly-spacing': [1, 'never'],
  'one-var': 0,
  'operator-assignment': 0,
  'operator-linebreak': 0,
  'padded-blocks': 0,
  'quote-props': 0,
  quotes: [1, 'single', 'avoid-escape'],
  'semi-spacing': [1, {before: false, after: true}],
  semi: [1, 'always'],
  'sort-vars': 0,
  'space-after-keywords': 0,
  'space-before-blocks': [1, 'always'],
  'space-before-function-paren': 0,
  'space-in-parens': [1, 'never'],
  'space-infix-ops': 1,
  'space-return-throw-case': 0,
  'space-unary-ops': [1, {words: true, nonwords: false}],
  'spaced-comment': [1, 'always'],
  'wrap-regex': 0,
  'arrow-body-style': 0,
  'arrow-parens': 0,
  'arrow-spacing': 1,
  'constructor-super': 2,
  'no-class-assign': 1,
  'no-const-assign': 2,
  'no-dupe-class-members': 1,
  'no-this-before-super': 2,
  'no-var': 1,
  'object-shorthand': 0,
  'prefer-arrow-callback': 0,
  'prefer-const': 0,
  'prefer-spread': 0,
  'prefer-template': 0,
  // react rules from fbjs
  'react/display-name': 0,
  'react/jsx-boolean-value': 0,
  'react/jsx-no-duplicate-props': 2,
  'react/jsx-no-undef': 2,
  'react/jsx-sort-props': 0,
  'react/jsx-uses-react': 1,
  'react/jsx-uses-vars': 1,
  'react/no-did-mount-set-state': 1,
  'react/no-did-update-set-state': 1,
  'react/no-multi-comp': 0,
  'react/no-unknown-property': 2,
  'react/prop-types': 0,
  'react/react-in-jsx-scope': 1,
  'react/self-closing-comp': 1,
  'react/sort-prop-types': 0,
  // jsx-a11y rules from fbjs
  'jsx-a11y/accessible-emoji': 0,
  'jsx-a11y/alt-text': 1,
  'jsx-a11y/anchor-has-content': 1,
  'jsx-a11y/anchor-is-valid': 0,
  'jsx-a11y/aria-activedescendant-has-tabindex': 1,
  'jsx-a11y/aria-props': 1,
  'jsx-a11y/aria-proptypes': 1,
  'jsx-a11y/aria-role': 1,
  'jsx-a11y/aria-unsupported-elements': 1,
  'jsx-a11y/click-events-have-key-events': 0,
  'jsx-a11y/heading-has-content': 1,
  'jsx-a11y/html-has-lang': 0,
  'jsx-a11y/img-redundant-alt': 1,
  'jsx-a11y/interactive-supports-focus': 0,
  'jsx-a11y/label-has-associated-control': 0,
  'jsx-a11y/media-has-caption': 0,
  'jsx-a11y/mouse-events-have-key-events': 0,
  'jsx-a11y/no-access-key': 1,
  'jsx-a11y/no-autofocus': 0,
  'jsx-a11y/no-distracting-elements': 1,
  'jsx-a11y/no-interactive-element-to-noninteractive-role': 0,
  'jsx-a11y/no-noninteractive-element-interactions': 0,
  'jsx-a11y/no-noninteractive-element-to-interactive-role': 0,
  'jsx-a11y/no-noninteractive-tabindex': 0,
  'jsx-a11y/no-onchange': 0,
  'jsx-a11y/no-redundant-roles': 1,
  'jsx-a11y/no-static-element-interactions': 0,
  'jsx-a11y/role-has-required-aria-props': 1,
  'jsx-a11y/role-supports-aria-props': 1,
  'jsx-a11y/scope': 1,
  'jsx-a11y/tabindex-no-positive': 1,
  // ft-flow rules from fbjs
  'ft-flow/define-flow-type': 1,
  'ft-flow/use-flow-type': 1,
  'ft-flow/valid-syntax': 1,
};

// eslint-config-prettier rules (disable formatting conflicts)
const prettierConfigRules =
  require('./node_modules/eslint-config-prettier').rules;

module.exports = [
  // Ignore patterns (from .eslintignore)
  {
    ignores: [
      '**/*.bundle.js',
      'plugins/fb/relaydevtools/relay-devtools/**',
      'plugins/public/reactdevtools/fb/**',
      'latest/**',
      'resources/**',
      'templates/**',
      'node_modules/**',
      '**/node_modules/**',
      '**/lib/**',
      '**/dist/**',
      'dist/**',
      'website/build/**',
      'react-native/ReactNativeFlipperExample/**',
      'scripts/generate-changelog.js',
      'static/index.js',
      'static/defaultPlugins/**',
      'static/facebook/flipper-server-app-template/**',
      'generated/**',
      'flipper-server/static/**',
    ],
  },

  // Base config for all JS/TS/TSX files
  {
    files: ['**/*.js', '**/*.ts', '**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': require('eslint-plugin-jsx-a11y'),
      'ft-flow': ftFlowPlugin,
      header: headerPlugin,
      prettier: prettierPlugin,
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      n: nPlugin,
      flipper: flipperPlugin,
      promise: promisePlugin,
      'communist-spelling': communistSpellingPlugin,
      rulesdir: rulesDirPlugin,
    },
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {jsx: true},
      },
      globals: {
        // from eslint-config-fbjs: env browser, es6, node, jest, jasmine
        ...globals.browser,
        ...globals.node,
        ...globals.es2015,
        ...globals.jest,
        ...globals.jasmine,
        // fbjs custom globals
        __DEV__: 'writable',
        require: 'readonly',
        requireDynamic: 'readonly',
        requireLazy: 'readonly',
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          project: '.',
        },
      },
    },
    rules: {
      // Rules from eslint-config-fbjs (inlined)
      ...fbjsRules,

      // Rules from eslint-config-prettier (disable formatting conflicts)
      ...prettierConfigRules,

      // disable rules from eslint-config-fbjs
      'flowtype/define-flow-type': 0,
      'flowtype/use-flow-type': 0,
      'react/react-in-jsx-scope': 0, // not needed with our metro implementation
      // Disallow boolean JSX properties set to true, e.g. `grow={true}`.
      'react/jsx-boolean-value': ['error', 'never'],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-key': 'error',
      'prefer-template': 'error',
      'no-new': 0, // new keyword needed e.g. new Notification
      'no-catch-shadow': 0, // only relevant for IE8 and below
      'no-bitwise': 0, // bitwise operations needed in some places
      'consistent-return': 0,
      'no-var': 2,
      'object-shorthand': ['error', 'properties'],
      'prefer-const': [2, {destructuring: 'all'}],
      'prefer-spread': 1,
      'prefer-rest-params': 1,
      'no-console': 0, // we're setting window.console in App.js
      'no-multi-spaces': 2,
      'prefer-promise-reject-errors': 1,
      'no-throw-literal': 'error',
      'no-extra-boolean-cast': 2,
      'no-extra-semi': 2,
      'no-unsafe-negation': 2,
      'no-useless-computed-key': 2,
      'no-useless-rename': 2,
      'no-restricted-imports': [
        'error',
        {
          ...restrictedImportsUniversalErrorConfig,
          paths: [
            {
              name: 'flipper',
              message:
                "Direct imports from 'flipper' are deprecated. Import from 'flipper-plugin' instead, which can be tested and distributed stand-alone. See https://fbflipper.com/docs/extending/sandy-migration for more details.",
            },
          ],
        },
      ],

      // additional rules for this project
      'header/header': [2, 'block', {pattern}],
      'prettier/prettier': [2, prettierConfig],
      'import/no-unresolved': [2, {commonjs: true, amd: true}],
      'n/no-extraneous-import': [2, {allowModules: builtInModules}],
      'n/no-extraneous-require': [2, {allowModules: builtInModules}],
      'n/no-sync': ['error'],
      'flipper/no-relative-imports-across-packages': [2],
      'flipper/no-console-error-without-context': [2],
      'flipper/no-ts-file-extension': 2,
      'flipper/no-i-prefix-interfaces': 2,
      'flipper/no-interface-props-or-state': 2,
      'communist-spelling/communist-spelling': [1, {allow: ['cancelled']}],

      // promise rules, see https://github.com/xjamundx/eslint-plugin-promise for details on each of them
      'promise/catch-or-return': 'error',
      'promise/no-nesting': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',
    },
  },

  // TypeScript-specific overrides
  {
    files: ['**/*.tsx', '**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      'prettier/prettier': [2, {...prettierConfig, parser: 'typescript'}],
      // following rules are disabled because TS already handles it
      'no-undef': 0,
      'import/no-unresolved': 0,
      // n/no-sync requires TypeScript type information (parserOptions.project)
      // which we don't configure here; disable for TS files
      'n/no-sync': 'off',
      // following rules are disabled because they don't handle TS correctly,
      // while their @typescript-eslint counterpart does
      // for reference: https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/README.md#extension-rules
      'no-unused-vars': 0,
      'no-redeclare': 0,
      'no-dupe-class-members': 0,
      '@typescript-eslint/no-redeclare': 'error',
      '@typescript-eslint/no-unused-vars': [
        2,
        {
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase', 'snake_case'],
          leadingUnderscore: 'allowSingleOrDouble',
          trailingUnderscore: 'allowSingleOrDouble',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: ['property', 'method', 'memberLike', 'parameter'],
          // do not enforce naming convention for properties
          // no support for kebab-case
          format: null,
        },
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // UI plugin files - ban Node.js APIs
  {
    files: [
      'plugins/**/*.ts',
      'plugins/**/*.tsx',
      'flipper-common/**/*.tsx',
      'flipper-ui/**/*.tsx',
      'flipper-plugin/**/*.tsx',
    ],
    ignores: ['plugins/**/serverAddOn.ts', 'plugins/**/serverAddOn.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...restrictedImportsUniversalErrorConfig,
          paths: [
            // Ban Node.js API
            'async_hooks',
            {
              name: 'child_process',
              message:
                "Node APIs are not allowed. Use 'getFlipperLib().remoteServerContext.child_process' from 'flipper-plugin' instead. See https://fbflipper.com/docs/extending/flipper-plugin/.",
            },
            'cluster',
            'crypto',
            'dgram',
            'dns',
            {
              name: 'fs',
              message:
                "Node APIs are not allowed. Use 'getFlipperLib().remoteServerContext.fs' from 'flipper-plugin' instead. See https://fbflipper.com/docs/extending/flipper-plugin/.",
            },
            {
              name: 'fs-extra',
              message:
                "Node APIs are not allowed. Use 'getFlipperLib().remoteServerContext.fs' from 'flipper-plugin' instead. See https://fbflipper.com/docs/extending/flipper-plugin/.",
            },
            'http',
            'https',
            'net',
            {
              name: 'os',
              message:
                "Node APIs are not allowed. Use 'getFlipperLib().paths' and 'getFlipperLib().environmentInfo' from 'flipper-plugin' instead. See https://fbflipper.com/docs/extending/flipper-plugin/.",
            },
            {
              name: 'path',
              message:
                "Node APIs are not allowed. Use 'path' from 'flipper-plugin' instead. See https://fbflipper.com/docs/extending/flipper-plugin/.",
            },
            'stream',
          ],
        },
      ],
      'rulesdir/no-restricted-imports-clone': [
        'error',
        {
          paths: [
            {
              name: 'flipper',
              message:
                "Direct imports from 'flipper' are deprecated. Import from 'flipper-plugin' instead, which can be tested and distributed stand-alone. See https://fbflipper.com/docs/extending/sandy-migration for more details.",
            },
          ],
        },
      ],
    },
  },

  // Overrides for plugin tests and service scripts - allow Node APIs
  {
    files: [
      'plugins/**/__tests__/**/*.tsx',
      'plugins/**/__tests__/**/*.ts',
      'flipper-common/**/__tests__/**/*.tsx',
      'flipper-ui/**/__tests__/**/*.tsx',
      'flipper-plugin/**/__tests__/**/*.tsx',
      'plugins/postinstall.tsx',
      // TODO: Remove specific plugin overrides down below
      'plugins/fb/kaios-portal/kaios-debugger-client/client.tsx',
    ],
    rules: {
      'no-restricted-imports': ['error', restrictedImportsUniversalErrorConfig],
      'rulesdir/no-restricted-imports-clone': [
        'error',
        {
          paths: [
            {
              name: 'flipper',
              message:
                "Direct imports from 'flipper' are deprecated. Import from 'flipper-plugin' instead, which can be tested and distributed stand-alone. See https://fbflipper.com/docs/extending/sandy-migration for more details.",
            },
          ],
        },
      ],
    },
  },

  // Overrides for all tests - ! is allowed
  {
    files: ['**/__tests__/**/*.tsx', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
