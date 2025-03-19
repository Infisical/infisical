## 1.4.1 (March 19, 2025)

Changes:
* Added support for supplying extra volume mounts and volumes via `infisical.extraVolumeMounts` and `infisical.extraVolumes`

## 1.4.0 (November 06, 2024)

Changes:
* Chart is now fully documented 
* New fields introduced: `infisical.databaseSchemaMigrationJob.image` and `infisical.serviceAccount`

Features:

* Added support for auto creating service account with required permissions via `infisical.serviceAccount.create`

## 1.3.0 (October 28, 2024)

Changes:
* Fixed issue causing database migration to not run in non `default` namespace

Features:

* Added support for supplying Postgres secret as K8s secret via `postgresql.useExistingPostgresSecret`
* Support overriding init container image via `infisical.databaseSchemaMigrationInitContainer`
