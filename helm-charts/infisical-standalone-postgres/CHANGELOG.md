## 1.7.2 (October 20, 2025)
Changes:
* Updated the default `infisical.image.tag` value to `v0.151.0`.
* `autoDatabaseSchemaMigration` has been fully removed as all newer versions of Infisical automatically run migrations as apart of the startup process.
* Added automatic reloading support for the Infisical deployment when the `infisical.kubeSecretRef` kubernetes secret changes.
  * Configurable by `infisical.redeployOnSecretChange: true|false`. Defaults to `false`.

## 1.7.1 (October 10, 2025)

Changes:
* Fixed using `extraVolumes` and `extraVolumeMounts` for when Infisical auto migration enabled
    * Previously the custom volumes and custom volume mounts would only be added to the infisical core pods, but not the migration pod.

## 1.7.0 (September 30, 2025)

Changes:
* Moved PostgreSQL and Redis helm dependencies to OCI Bitnami charts
* Moved default Postgres and Redis repositories to `mirror.gcr.io/postgresql|redis`


## 1.6.1 (July 3, 2025)

Changes:
* Added support for `topologySpreadConstraints` configuration in Helm chart for the Infisical deployment

Features:
* `topologySpreadConstraints`: Configure pod distribution across availability zones and nodes for high availability

## 1.5.0 (March 26, 2025)

Changes:
* Added support for Kubernetes pod scheduling customization via `nodeSelector` and `tolerations`

Features:
* `nodeSelector`: Configure pod placement on nodes with specific labels
* `tolerations`: Enable pods to schedule on tainted nodes

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
