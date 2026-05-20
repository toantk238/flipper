# Dependency Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all build deprecation warnings and bring the full dependency tree current, including antd 5→6, eslint 8→9, and metro 0.70→0.81, through four phased commits.

**Architecture:** Sequential phases ordered by risk — patch/minor first, then the metro bundler, then eslint flat config, then antd major. Each phase is verified before the next begins; a failing verification is a blocker, not a suggestion.

**Tech Stack:** Yarn 1.x workspaces, TypeScript, Metro bundler, antd v6, ESLint 9 flat config, typescript-eslint v8.

**Spec:** `docs/superpowers/specs/2026-05-20-dependency-upgrade-design.md`

---

## File Map

| File | Phase | Change |
|---|---|---|
| `flipper-common/package.json` | 1 | uuid `^9` → `^11` |
| `flipper-common/package.json` | 1 | Remove `@types/uuid` devDep (uuid 11 ships own types) |
| `babel-transformer/package.json` | 1 | All `@babel/*` 7.20.x → 7.29.x, `@emotion/babel-plugin` 11.10→11.13 |
| `flipper-ui/package.json` | 1 | Minor `@types/*` bumps |
| `pkg-lib/package.json` | 2 | `metro` + `metro-cache` `^0.70.2` → `^0.81.0`, `metro-minify-terser` `^0.75.0` → `^0.81.0` |
| `flipper-server/package.json` | 2 | `metro` `^0.70.2` → `^0.81.0` |
| `scripts/build-utils.tsx` | 2 | Fix `blacklistRE` → `blockList`, MetroResolver call signature |
| `package.json` (root) | 3 | `eslint` `^8.57.1` → `^9.0.0`, `@typescript-eslint/*` `^6` → `^8`, update all eslint plugins |
| `eslint-plugin-flipper/package.json` | 3 | `@typescript-eslint/experimental-utils` → `@typescript-eslint/utils ^8`, parser `^8` |
| `.eslintrc.js` | 3 | Deleted — replaced by `eslint.config.js` |
| `.eslintignore` | 3 | Deleted — merged into `eslint.config.js` `ignores` |
| `eslint.config.js` | 3 | New flat config file |
| `eslint-plugin-flipper/src/` | 3 | Update rule helpers from `experimental-utils` to `utils` |
| `flipper-ui/package.json` | 4 | `antd` `^5` → `^6`, `@ant-design/icons` `^5` → `^6` |
| `flipper-plugin/package.json` | 4 | `@ant-design/colors` `^6` → `^8` |
| `flipper-ui/src/**` | 4 | Component API fixes (codemod + manual) |

---

## Task 1: Phase 1 — Patch/minor dep bumps (uuid, @babel/*, @types/*)

**Files:**
- Modify: `desktop/flipper-common/package.json`
- Modify: `desktop/babel-transformer/package.json`
- Modify: `desktop/flipper-ui/package.json`

---

- [ ] **Step 1.1: Bump uuid in flipper-common and remove @types/uuid**

Edit `desktop/flipper-common/package.json`. uuid 11 ships its own TypeScript types, so `@types/uuid` must be removed to avoid conflicts.

Change `"uuid"` in `dependencies`:
```json
"dependencies": {
  "uuid": "^11.0.0"
},
```

Remove the `@types/uuid` entry from `devDependencies` entirely. If `devDependencies` only contained `@types/uuid`, delete the whole block:
```json
"devDependencies": {}
```

Also check `desktop/flipper-ui/package.json` and `desktop/flipper-server/package.json` for any `@types/uuid` entries — remove them from those files too.

- [ ] **Step 1.1b: Bump minor @types/* in flipper-ui (spec: @types alignment)**

Edit `desktop/flipper-ui/package.json` `devDependencies`. Bump the following to remove the minor lag visible in `yarn outdated`:

```json
"@types/redux-mock-store": "^1.5.0",
"@types/react-is": "^18.3.0",
"@types/react-virtualized-auto-sizer": "^1.0.4",
```

Leave all other `@types/*` entries as-is — they are within a valid semver range or will self-update via `yarn install`.

- [ ] **Step 1.2: Bump all @babel/* and @emotion/babel-plugin in babel-transformer**

Edit `desktop/babel-transformer/package.json` `"dependencies"` block. Replace:

```json
"@babel/core": "^7.20.12",
"@babel/generator": "^7.20.14",
"@babel/parser": "^7.20.13",
"@babel/plugin-transform-modules-commonjs": "^7.20.11",
"@babel/plugin-transform-typescript": "^7.20.13",
"@babel/preset-env": "^7.20.2",
"@babel/preset-react": "^7.18.6",
"@babel/traverse": "^7.20.13",
"@babel/types": "^7.20.7",
"@emotion/babel-plugin": "^11.10.6",
```

With:

```json
"@babel/core": "^7.29.0",
"@babel/generator": "^7.29.0",
"@babel/parser": "^7.29.0",
"@babel/plugin-transform-modules-commonjs": "^7.28.0",
"@babel/plugin-transform-typescript": "^7.28.0",
"@babel/preset-env": "^7.29.0",
"@babel/preset-react": "^7.28.0",
"@babel/traverse": "^7.29.0",
"@babel/types": "^7.29.0",
"@emotion/babel-plugin": "^11.13.5",
```

- [ ] **Step 1.3: Install updated deps**

```bash
cd /path/to/flipper/desktop && yarn install
```

Expected: yarn resolves and installs without error. The lockfile updates for the changed packages.

- [ ] **Step 1.4: Verify TypeScript compiles**

```bash
cd /path/to/flipper/desktop && yarn build:tsc
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 1.5: Run tests**

```bash
cd /path/to/flipper/desktop && yarn test
```

Expected: all tests pass (same count as before).

- [ ] **Step 1.6: Commit**

```bash
git add desktop/flipper-common/package.json desktop/babel-transformer/package.json desktop/yarn.lock
git commit -m "chore(deps): bump uuid to v11, @babel/* to 7.29, @emotion/babel-plugin to 11.13"
```

---

## Task 2: Phase 2 — Metro 0.70 → 0.81

Metro 0.70 → 0.81 has two confirmed breaking changes in `build-utils.tsx`:
1. `resolver.blacklistRE` was renamed to `resolver.blockList` (officially deprecated since 0.63, removed in 0.73).
2. `MetroResolver.resolve()` call signature changed — the third argument is no longer passed through; the resolver now receives only `(context, moduleName)`.

**Files:**
- Modify: `desktop/pkg-lib/package.json`
- Modify: `desktop/flipper-server/package.json`
- Modify: `desktop/scripts/build-utils.tsx`

---

- [ ] **Step 2.1: Bump metro in pkg-lib**

Edit `desktop/pkg-lib/package.json` `"dependencies"`:

```json
"metro": "^0.81.0",
"metro-cache": "^0.81.0",
"metro-minify-terser": "^0.81.0",
```

- [ ] **Step 2.2: Bump metro in flipper-server**

Edit `desktop/flipper-server/package.json` `"dependencies"`:

```json
"metro": "^0.81.0",
```

- [ ] **Step 2.3: Fix blacklistRE → blockList in build-utils.tsx**

In `desktop/scripts/build-utils.tsx`, locate the `resolver` block inside `buildBrowserBundle`. Change:

```ts
resolver: {
  ...baseConfig.resolver,
  resolverMainFields: ['flipperBundlerEntry', 'browser', 'module', 'main'],
  blacklistRE: [/\.native\.js$/],
  // ...
},
```

To:

```ts
resolver: {
  ...baseConfig.resolver,
  resolverMainFields: ['flipperBundlerEntry', 'browser', 'module', 'main'],
  blockList: [/\.native\.js$/],
  // ...
},
```

- [ ] **Step 2.4: Fix MetroResolver.resolve() call signature**

In `desktop/scripts/build-utils.tsx`, locate `defaultResolve`:

```ts
function defaultResolve(...rest: any[]) {
  const [context, moduleName] = rest;
  return MetroResolver.resolve(
    {
      ...context,
      resolveRequest: null,
    },
    moduleName,
    ...rest,
  );
}
```

Replace with:

```ts
function defaultResolve(context: any, moduleName: string) {
  return MetroResolver.resolve(
    {
      ...context,
      resolveRequest: null,
    },
    moduleName,
  );
}
```

And update the call site in the `customResolver` that uses `defaultResolve` — replace `defaultResolve(context, moduleName, ...rest)` with `defaultResolve(context, moduleName)`.

- [ ] **Step 2.5: Install updated deps**

```bash
cd /path/to/flipper/desktop && yarn install
```

Expected: resolves without error.

- [ ] **Step 2.6: Run TypeScript**

```bash
cd /path/to/flipper/desktop && yarn build:tsc
```

Expected: exits 0. If metro 0.81 ships updated type definitions that conflict with the `// @ts-ignore` imports in `build-utils.tsx`, remove the `@ts-ignore` comments and fix the types.

- [ ] **Step 2.7: Run full build and check warnings**

```bash
cd /path/to/flipper && just build 2>&1 | grep -E '(warning|deprecated|WARN)' | grep -v 'flipper-pkg-lib > metro'
```

Expected: the long list of `flipper-pkg-lib > metro > ...` warnings is gone. Any remaining warnings are from other sources and should be noted for the spec out-of-scope list.

- [ ] **Step 2.8: Run tests**

```bash
cd /path/to/flipper/desktop && yarn test
```

Expected: all tests pass.

- [ ] **Step 2.9: Commit**

```bash
git add desktop/pkg-lib/package.json desktop/flipper-server/package.json desktop/scripts/build-utils.tsx desktop/yarn.lock
git commit -m "chore(deps): upgrade metro 0.70 → 0.81, fix blacklistRE and resolver signature"
```

---

## Task 3: Phase 3 — ESLint 8 → 9, typescript-eslint 6 → 8

ESLint 9 requires flat config (`eslint.config.js`) instead of `.eslintrc.js`. `@typescript-eslint` v8 replaces the separate `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` packages with a unified `typescript-eslint` package. `@typescript-eslint/experimental-utils` (used by `eslint-plugin-flipper`) was renamed to `@typescript-eslint/utils` and is included in the v8 monorepo.

**Files:**
- Modify: `desktop/package.json` (root devDeps)
- Modify: `desktop/eslint-plugin-flipper/package.json`
- Modify: `desktop/eslint-plugin-flipper/src/*.ts` (rule files using `experimental-utils`)
- Delete: `desktop/.eslintrc.js`
- Delete: `desktop/.eslintignore`
- Create: `desktop/eslint.config.js`

---

- [ ] **Step 3.1: Update root devDeps for eslint 9 and typescript-eslint 8**

Edit `desktop/package.json` `"devDependencies"`. Update these entries:

```json
"eslint": "^9.0.0",
"@typescript-eslint/eslint-plugin": "^8.0.0",
"@typescript-eslint/parser": "^8.0.0",
"@babel/eslint-parser": "^7.29.0",
"eslint-plugin-react": "^7.37.0",
"eslint-plugin-react-hooks": "^5.0.0",
"eslint-plugin-import": "^2.32.0",
"eslint-plugin-jsx-a11y": "^6.10.0",
"eslint-plugin-prettier": "^5.5.0",
"eslint-plugin-promise": "^7.0.0",
```

> Note: `eslint-plugin-node` is unmaintained; replace with `eslint-plugin-n` in the config later. `eslint-config-fbjs` may not have an eslint-9 release — check the package's eslint peerDep before installing. If it doesn't support eslint 9, it will need to be wrapped with `@eslint/compat` in the flat config.

- [ ] **Step 3.2: Update eslint-plugin-flipper dependencies**

Edit `desktop/eslint-plugin-flipper/package.json`:

```json
"dependencies": {
  "@typescript-eslint/utils": "^8.0.0",
  "@typescript-eslint/parser": "^8.0.0",
  "fs-extra": "^11.1.1"
}
```

(Replace `@typescript-eslint/experimental-utils` with `@typescript-eslint/utils`.)

- [ ] **Step 3.3: Update imports in eslint-plugin-flipper source files**

Find all files in `desktop/eslint-plugin-flipper/src/` that import from `@typescript-eslint/experimental-utils`:

```bash
grep -rn 'experimental-utils' /path/to/flipper/desktop/eslint-plugin-flipper/src/
```

For each file found, replace the import:

```ts
// Before:
import { RuleContext, RuleModule } from '@typescript-eslint/experimental-utils/dist/ts-eslint';
// or:
import { ESLintUtils } from '@typescript-eslint/experimental-utils';

// After:
import { RuleContext, RuleModule } from '@typescript-eslint/utils/dist/ts-eslint';
// or:
import { ESLintUtils } from '@typescript-eslint/utils';
```

The package path mirrors exactly — only the package name changes from `experimental-utils` to `utils`.

- [ ] **Step 3.4: Install updated deps**

```bash
cd /path/to/flipper/desktop && yarn install
```

Expected: resolves without error. If `eslint-config-fbjs` fails its peerDep check, note it for Step 3.6.

- [ ] **Step 3.5: Run the ESLint config migration codemod**

```bash
cd /path/to/flipper/desktop && npx @eslint/migrate-config .eslintrc.js
```

Expected: creates `eslint.config.mjs` (or `eslint.config.js`). Rename to `eslint.config.js` if needed:

```bash
mv eslint.config.mjs eslint.config.js 2>/dev/null || true
```

- [ ] **Step 3.6: Wrap legacy plugins with compat helper**

ESLint 9 flat config requires plugins that don't natively support it to be wrapped. Open the generated `desktop/eslint.config.js`. At the top, ensure this import is present:

```js
const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat({ baseDirectory: __dirname });
```

Install the compat helper if not already there:

```bash
cd /path/to/flipper/desktop && yarn add -D @eslint/eslintrc
```

For each legacy plugin in the generated config (e.g., `eslint-config-fbjs`, `eslint-plugin-header`, `eslint-plugin-rulesdir`, `eslint-plugin-communist-spelling`), wrap them:

```js
// Instead of:
...compat.extends('fbjs'),
// Use:
...compat.config({ extends: ['fbjs'] }),
```

For `eslint-plugin-rulesdir`, which uses a custom `RULES_DIR` setup, keep the initialization logic from the original `.eslintrc.js`:

```js
const rulesDirPlugin = require('eslint-plugin-rulesdir');
rulesDirPlugin.RULES_DIR = path.join(__dirname, 'eslint-rules');
```

And include it in the plugins object of the relevant config object.

- [ ] **Step 3.7: Migrate .eslintignore to eslint.config.js**

Open `desktop/.eslintignore` and move its patterns into the `ignores` array in `eslint.config.js`:

```js
module.exports = [
  {
    ignores: [
      'node_modules/',
      '**/*.tsbuildinfo',
      // ... paste entries from .eslintignore here
    ],
  },
  // ... rest of config
];
```

Delete `.eslintignore`:

```bash
rm /path/to/flipper/desktop/.eslintignore
```

- [ ] **Step 3.8: Delete the old config**

```bash
rm /path/to/flipper/desktop/.eslintrc.js
```

- [ ] **Step 3.9: Run lint and fix errors iteratively**

```bash
cd /path/to/flipper/desktop && yarn lint:eslint 2>&1 | head -80
```

Address errors in this priority order:
1. Plugin-not-found errors → check Step 3.6 compat wrapping
2. Rule-not-found errors → rule was renamed or removed in eslint 9 (common: `no-new-object` → `no-object-constructor`)
3. Parser errors → ensure `@typescript-eslint/parser` is correctly set in the TypeScript file override block
4. Type-aware rule errors → `project` in `parserOptions.project` must be set for `@typescript-eslint` type-aware rules

Re-run `yarn lint:eslint` after each fix until it exits 0.

- [ ] **Step 3.10: Build eslint-plugin-flipper**

```bash
cd /path/to/flipper/desktop && yarn build:eslint
```

Expected: exits 0.

- [ ] **Step 3.11: Run TypeScript and tests**

```bash
cd /path/to/flipper/desktop && yarn build:tsc && yarn test
```

Expected: both exit 0.

- [ ] **Step 3.12: Commit**

```bash
git add desktop/.eslintrc.js desktop/.eslintignore desktop/eslint.config.js \
  desktop/package.json desktop/eslint-plugin-flipper/package.json \
  desktop/eslint-plugin-flipper/src/ desktop/yarn.lock
git commit -m "chore(deps): migrate to eslint 9 flat config and typescript-eslint v8"
```

---

## Task 4: Phase 4 — antd 5 → 6, @ant-design ecosystem

antd 6 ships breaking changes across component APIs and design tokens. The `@ant-design/codemod` handles the most common migrations automatically. The recent `AntdThemeProvider` work in `flipper-ui` touches the token system — review those files carefully after the codemod.

**Files:**
- Modify: `desktop/flipper-ui/package.json`
- Modify: `desktop/flipper-plugin/package.json`
- Modify: `desktop/flipper-ui/src/**` (codemod output + manual fixes)

---

- [ ] **Step 4.1: Bump antd and icons in flipper-ui**

Edit `desktop/flipper-ui/package.json` `"dependencies"`:

```json
"antd": "^6.0.0",
"@ant-design/icons": "^6.0.0",
```

- [ ] **Step 4.2: Bump @ant-design/colors in flipper-plugin**

Edit `desktop/flipper-plugin/package.json` `"dependencies"`:

```json
"@ant-design/colors": "^8.0.0",
```

- [ ] **Step 4.3: Also bump @ant-design/colors peerDep in flipper-ui if listed**

Check `desktop/flipper-ui/package.json` for any `@ant-design/colors` reference. If found in `dependencies` or `peerDependencies`, bump it to `^8.0.0` as well.

- [ ] **Step 4.4: Install**

```bash
cd /path/to/flipper/desktop && yarn install
```

Expected: resolves without error. antd 6 may pull in new peer deps — install them if prompted.

- [ ] **Step 4.5: Run the antd codemod**

```bash
cd /path/to/flipper/desktop && npx @ant-design/codemod --antd-version=6 flipper-ui/src flipper-plugin/src
```

Expected: codemod rewrites files with deprecated prop names, renamed components, and moved imports. Review the diff with `git diff` to understand what changed before proceeding.

- [ ] **Step 4.6: Check TypeScript after codemod**

```bash
cd /path/to/flipper/desktop && yarn build:tsc 2>&1 | head -60
```

Fix TypeScript errors from antd 6 API changes. Common ones:

- **`Space.Compact` removed** → use `Space` with `compact` prop or split manually
- **`Typography.Text` `type` prop changed** → `"secondary"` is still valid; `"ghost"` removed
- **Design token names changed** → e.g., `colorPrimaryBg` may have a new name; check the antd 6 token reference at https://ant.design/docs/react/migrate-less-variables
- **`notification` API** → in antd 6, `notification.open()` is removed; use the hook `useNotification()` or the `App.useApp()` pattern (already in place via `AntdThemeProvider`)
- **`message` API** → same as notification; use hook variant

Fix errors one by one, re-running `yarn build:tsc` after each batch.

- [ ] **Step 4.7: Run tests**

```bash
cd /path/to/flipper/desktop && yarn test
```

Fix any test failures from antd 6 component API changes. Common test failures involve snapshot tests — update snapshots with:

```bash
cd /path/to/flipper/desktop && yarn test -- --updateSnapshot
```

Only update snapshots after visually confirming the changes look correct.

- [ ] **Step 4.8: Visual smoke test**

Start the dev server:

```bash
cd /path/to/flipper && yarn start
```

Open the app and verify:
1. Main layout renders (sidebar, plugin panels, toolbar)
2. Dark/light theme toggle works (the recent `AntdThemeProvider` changes)
3. Notifications appear correctly
4. At least one plugin panel opens without errors

- [ ] **Step 4.9: Commit**

```bash
git add desktop/flipper-ui/package.json desktop/flipper-plugin/package.json \
  desktop/flipper-ui/src desktop/flipper-plugin/src desktop/yarn.lock
git commit -m "chore(deps): upgrade antd 5→6, @ant-design/icons 5→6, @ant-design/colors 6→8"
```

---

## Verification Checklist (run after all 4 phases)

- [ ] `just build` produces zero deprecation warnings for direct and transitive deps
- [ ] `yarn build:tsc` exits 0
- [ ] `yarn test` exits 0
- [ ] `yarn lint` exits 0
- [ ] Visual smoke test passes (dark + light theme, notifications, plugins)
