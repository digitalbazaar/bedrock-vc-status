# bedrock-vc-status ChangeLog

## 2.2.0 - 2025-10-dd

### Changed
- Include cache headers for route `GET ${namespacedStatusList}`.

## 2.1.1 - 2025-10-15

### Fixed
- Fix `@bedrock/app-identity` peer dependency version constraint.

## 2.1.0 - 2025-05-22

### Changed
- Use `@digitalbazaar/lru-memoize@4`. Existing cache defaults and options
  are coerced from previous versions to the new version.

## 2.0.0 - 2025-03-18

### Changed
- Update dependencies.
  - `@digitalbazaar/vc-bitstring-status-list@2.0.1`.
  - `@digitalbazaar/vc-status-list@8.0.1`.
- Update peer dependencies.
  - `@bedrock/core@6.3.0`.
  - **BREAKING**: `@bedrock/mongodb@11`.
    - Use MongoDB driver 6.x and update error names and details.
    - See changelog for details.
  - **BREAKING**: `@bedrock/service-agent@10`.
    - Updated for `@bedrock/mongodb@11`.
  - **BREAKING**: `@bedrock/service-core@11`.
    - Updated for `@bedrock/mongodb@11`.
  - `@bedrock/validation@7.1.1`.
- Update dev dependencies.
- Update test dependencies.

## 1.1.1 - 2025-03-17

### Fixed
- Use `result.modifiedCount` to enable newer mongodb driver.
- Remove unused `background` option from mongodb index creation.

## 1.1.0 - 2025-02-27

### Changed
- Increase `MAX_LIST_SIZE` to accommodate lists of up to size `2^26`, which is
  how large terse bitstring status lists are by default.

## 1.0.0 - 2024-08-02

### Added
- Added core files.
- See git history for changes.
