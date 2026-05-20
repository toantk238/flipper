# Dependency Upgrade Design — desktop/

**Date:** 2026-05-20  
**Scope:** `/Users/mbhealth/Workspace/flipper/desktop`  
**Branch:** `v2.0`

## Goal

Eliminate build warnings caused by deprecated/outdated dependencies and bring the full dependency tree up to date, including major-version upgrades for antd, eslint, and typescript-eslint.

## Background

Running `just build` produces two categories of warnings:

1. **Direct dep**: `uuid@9` in `flipper-common` — deprecated, uuid@10 and below no longer supported.
2. **Transitive via `metro@0.70.2`** (in `flipper-server`, `flipper-pkg-lib`) — the majority of warnings:
   - Old `@babel/plugin-proposal-*` plugins (ECMAScript standard merged; use `@babel/plugin-transform-*`)
   - `rimraf@2.x` (multiple, via metro and its deps)
   - `glob@7.x` (security warnings)
   - `uglify-es` and `inflight` (memory leak, abandoned)
   - `metro-react-native-babel-preset` (superseded by `@react-native/babel-preset`)

Additionally, `yarn outdated` reveals significant major version lag:

| Package | Current | Latest |
|---|---|---|
| `antd` | 5.29.3 | 6.4.3 |
| `@ant-design/icons` | 5.6.1 | 6.2.3 |
| `@ant-design/colors` | 6.0.0 | 8.0.1 |
| `@typescript-eslint/*` | 6.21.0 | 8.59.4 |
| `eslint` | 8.57.1 | 9.x |
| `metro` | 0.70.2 | 0.81.x |
| `@babel/*` (babel-transformer) | 7.20.x | 7.29.x |

## Approach

**Upgrade-and-fix-forward**, phased by risk level. Each phase gets its own commit(s). Use official migration codemods where available (antd, eslint). Run `yarn build` and `yarn test` after each phase before proceeding to the next.

## Phase Breakdown

### Phase 1 — Low-risk patch/minor upgrades

**Packages:**
- `uuid` 9 → 11 in `flipper-common` (and `flipper-server-client` if used)
- All `@babel/*` in `babel-transformer`: `7.20.x` → `7.29.x`
  - `@babel/core`, `@babel/generator`, `@babel/parser`, `@babel/traverse`, `@babel/types`
  - `@babel/plugin-transform-modules-commonjs`, `@babel/plugin-transform-typescript`
  - `@babel/preset-env`, `@babel/preset-react`
- `@emotion/babel-plugin` `11.10.6` → `11.13.5`
- `@emotion/css`, `@emotion/react`, `@emotion/styled` minor bumps
- `@types/*` alignment: `@types/uuid`, `@types/jest`, `@types/redux-mock-store`, `@types/split2`, etc.
- `immer`, `dayjs`, `lodash`, `semver`, `jszip` patch/minor bumps where safe
- `ajv` `6.12.6` → `6.15.0` (patch)

**Verification:** `yarn build:tsc && yarn test`

**Risk:** Low. All semver-compatible. No API surface changes expected.

### Phase 2 — Metro upgrade

**Packages:**
- `metro` `0.70.2` → latest stable `0.81.x` in `flipper-server/package.json` and `pkg-lib/package.json` (the `pkg-lib/` workspace, package name `flipper-pkg-lib`)
- `metro-cache`, `metro-runtime` aligned to the same metro version
- Remove or replace deprecated transitive plugins if metro upgrade doesn't resolve them

**Effect:** Clears the largest warning cluster — all the `@babel/plugin-proposal-*`, `rimraf@2`, `glob@7`, `uglify-es`, and `inflight` warnings originate here.

**Verification:** `just build` (full server build) — confirm warnings are gone. Run `yarn test`.

**Risk:** Medium. Metro is a bundler with internal API surface. Flipper uses metro for plugin bundling. Review metro 0.71–0.81 changelogs for breaking changes to the APIs used in `build-plugin.tsx` and `bundle-all-plugins.tsx`.

### Phase 3 — ESLint 9 + typescript-eslint v8

**Packages:**
- `eslint` `8.57.1` → `9.x`
- `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` `6.21.0` → `8.x`
- All dependent eslint plugins updated to eslint-9-compatible versions:
  - `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, etc.

**Migration steps:**
1. Run `npx @eslint/migrate-config .eslintrc.js` to generate `eslint.config.js` flat config.
2. Audit the generated config — the migrator handles most rules but may miss custom plugins.
3. Update `eslint-plugin-flipper` (internal) to be compatible with the flat config API.
4. Remove `.eslintignore` — migrate patterns into `eslint.config.js` `ignores` array.
5. Update `package.json` lint scripts if any referenced `--ext` flag (removed in eslint 9).
6. `@typescript-eslint` v8 ships as `typescript-eslint` (unified package) — update imports in config.

**Verification:** `yarn lint` — zero errors. No new warnings.

**Risk:** Medium-high. Flat config is a breaking format change. Rule names and some behaviors changed. The internal `eslint-plugin-flipper` may need updates.

### Phase 4 — antd 6 + ant-design ecosystem

**Packages:**
- `antd` `5.29.3` → `6.x` in `flipper-ui`
- `@ant-design/icons` `5.x` → `6.x` in `flipper-ui`
- `@ant-design/colors` `6.x` → `8.x` in `flipper-plugin`

**Migration steps:**
1. Run `npx @ant-design/codemod` for automated API migrations (renamed/removed props, component moves).
2. Review antd 6 changelog for theme token changes — recent `AntdThemeProvider` work may be affected.
3. Check `ConfigProvider` and `App` wrapper usage — antd 6 has changes to the design token system.
4. Fix any remaining type errors from the upgraded `@ant-design/icons` (icon name changes).
5. Run visual smoke test: start dev server and verify key UI surfaces (notifications, modals, tables, plugin panels).

**Verification:** `yarn build`, `yarn test`, manual visual check of main UI.

**Risk:** High. antd 6 has API breaking changes across components. The recent theme work (`AntdThemeProvider`, dark/light CSS) intersects directly with antd 6 token system changes. Budget time for manual fixes beyond what codemod covers.

## Testing Strategy

After each phase:
- `yarn build:tsc` — TypeScript must compile clean
- `yarn test` — test suite must pass
- `just build` — full server build (Phase 2 only, to verify warning elimination)
- `yarn lint` — lint must pass clean (Phase 3+)
- Manual visual check in browser (Phase 4 only)

## Out of Scope

- `@oclif/*` major upgrade (flipper-pkg CLI tooling, separate concern)
- `algoliasearch` 4→5 (flipper-plugin-lib, separate concern)
- `react` / `react-dom` (already at 18.x, no v19 migration planned)
- `node-fetch` `2.x` → `3.x` (ESM-only, would require larger refactor in flipper-server)

## Affected Workspaces

| Workspace | Phase |
|---|---|
| `flipper-common` | 1 |
| `babel-transformer` | 1 |
| `flipper-plugin` | 1, 4 |
| `flipper-server` | 2 |
| `pkg-lib` | 2 |
| `flipper-project` (root) | 3 |
| `eslint-plugin-flipper` | 3 |
| `flipper-ui` | 4 |
