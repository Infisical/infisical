import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { useImportDopplerSecrets, useImportVaultSecrets } from "@app/hooks/api/migration/mutations";
import {
  useGetDopplerConfigs,
  useGetDopplerProjects,
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultSecretPaths
} from "@app/hooks/api/migration/queries";

import type { SecretsExternalImportAdapter } from "./contract-external-import";

export const secretsExternalImportLive: SecretsExternalImportAdapter = {
  useImportConnections: (app, projectId, options) =>
    useListAvailableAppConnections(app, projectId, { enabled: options?.enabled }),
  useVaultNamespaces: useGetVaultNamespaces,
  useVaultMounts: useGetVaultMounts,
  useVaultSecretPaths: useGetVaultSecretPaths,
  useDopplerProjects: useGetDopplerProjects,
  useDopplerConfigs: useGetDopplerConfigs,
  useImportVaultSecrets,
  useImportDopplerSecrets
};
