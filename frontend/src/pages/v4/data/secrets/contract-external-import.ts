import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type {
  TDopplerConfig,
  TDopplerProject,
  TImportDopplerSecretsDTO,
  TImportVaultSecretsDTO,
  TImportVaultSecretsResponse
} from "@app/hooks/api/migration/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TVaultMount = { path: string; type: string; version: string | null };
export type TVaultSecretPaths = { secretPaths: string[]; skippedWildcardPaths: string[] };
export type Queryable<TData> = V4QueryResult<TData> & { refetch?: () => unknown };

export type SecretsExternalImportAdapter = {
  useImportConnections: (
    app: AppConnection.HCVault | AppConnection.Doppler,
    projectId: string,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TAvailableAppConnection[]>;
  useVaultNamespaces: (connectionId?: string) => Queryable<{ id: string; name: string }[]>;
  useVaultMounts: (
    enabled: boolean,
    namespace?: string,
    connectionId?: string
  ) => Queryable<TVaultMount[]>;
  useVaultSecretPaths: (
    enabled: boolean,
    namespace?: string,
    mountPath?: string,
    connectionId?: string
  ) => Queryable<TVaultSecretPaths>;
  useDopplerProjects: (connectionId?: string) => Queryable<TDopplerProject[]>;
  useDopplerConfigs: (connectionId?: string, projectSlug?: string) => Queryable<TDopplerConfig[]>;
  useImportVaultSecrets: V4Mutation<TImportVaultSecretsDTO, TImportVaultSecretsResponse>;
  useImportDopplerSecrets: V4Mutation<
    TImportDopplerSecretsDTO,
    { status: string; imported: number }
  >;
};
