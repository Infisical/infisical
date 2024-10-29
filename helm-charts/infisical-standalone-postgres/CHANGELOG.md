## 1.3.0 (October 28, 2024)

Changes:
* Fixed issue causing database migration to not run in non `default` namespace

Features:

* Added support for supplying Postgres secret as K8s secret via `postgresql.useExistingPostgresSecret`
* Support overriding init container image via `infisical.databaseSchemaMigrationInitContainer`
