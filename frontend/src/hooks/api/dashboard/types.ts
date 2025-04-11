import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { SecretV3Raw, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

export type DashboardProjectSecretsOverviewResponse = {
  folders?: (TSecretFolder & { environment: string })[];
  dynamicSecrets?: (TDynamicSecret & { environment: string })[];
  secrets?: SecretV3Raw[];
  imports?: TSecretImport[];
  totalSecretCount?: number;
  totalFolderCount?: number;
  totalDynamicSecretCount?: number;
  totalImportCount?: number;
  secretRotations?: (TSecretRotationV2 & {
    secrets: (SecretV3Raw | null)[];
  })[];
  totalSecretRotationCount?: number;
  totalCount: number;
  totalUniqueSecretsInPage: number;
  totalUniqueDynamicSecretsInPage: number;
  totalUniqueFoldersInPage: number;
  totalUniqueSecretImportsInPage: number;
  importedByEnvs?: { environment: string; importedBy: ProjectSecretsImportedBy[] }[];
  totalUniqueSecretRotationsInPage: number;
};

export type DashboardProjectSecretsDetailsResponse = {
  imports?: TSecretImport[];
  folders?: TSecretFolder[];
  dynamicSecrets?: TDynamicSecret[];
  secrets?: SecretV3Raw[];
  secretRotations?: (TSecretRotationV2 & {
    secrets: (SecretV3Raw | null)[];
  })[];
  totalImportCount?: number;
  totalFolderCount?: number;
  totalDynamicSecretCount?: number;
  totalSecretCount?: number;
  totalSecretRotationCount?: number;
  totalCount: number;
  importedBy?: ProjectSecretsImportedBy[];
};

export type ProjectSecretsImportedBy = {
  environment: { name: string; slug: string };
  folders: {
    name: string;
    secrets?: { secretId: string; referencedSecretKey: string }[];
    isImported: boolean;
  }[];
};

export type DashboardProjectSecretsByKeys = {
  secrets: SecretV3Raw[];
};

export type DashboardProjectSecretsOverview = Omit<
  DashboardProjectSecretsOverviewResponse,
  "secrets" | "secretRotations"
> & {
  secrets?: SecretV3RawSanitized[];
  secretRotations?: (TSecretRotationV2 & {
    secrets: (SecretV3RawSanitized | null)[];
  })[];
};

export type DashboardProjectSecretsDetails = Omit<
  DashboardProjectSecretsDetailsResponse,
  "secrets"
> & {
  secrets?: SecretV3RawSanitized[];
  secretRotations?: (TSecretRotationV2 & {
    secrets: (SecretV3RawSanitized | null)[];
  })[];
};

export enum DashboardSecretsOrderBy {
  Name = "name"
}

export type TGetDashboardProjectSecretsOverviewDTO = {
  projectId: string;
  secretPath: string;
  offset?: number;
  limit?: number;
  orderBy?: DashboardSecretsOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  includeSecrets?: boolean;
  includeFolders?: boolean;
  includeDynamicSecrets?: boolean;
  includeImports?: boolean;
  includeSecretRotations?: boolean;
  environments: string[];
};

export type TGetDashboardProjectSecretsDetailsDTO = Omit<
  TGetDashboardProjectSecretsOverviewDTO,
  "environments"
> & {
  viewSecretValue: boolean;
  environment: string;
  includeImports?: boolean;
  tags: Record<string, boolean>;
};

export type TDashboardProjectSecretsQuickSearchResponse = {
  folders: (TSecretFolder & { envId: string; path: string })[];
  dynamicSecrets: (TDynamicSecret & { environment: string; path: string })[];
  secretRotations: TSecretRotationV2[];
  secrets: SecretV3Raw[];
};

export type TDashboardProjectSecretsQuickSearch = {
  folders: Record<string, TDashboardProjectSecretsQuickSearchResponse["folders"]>;
  secrets: Record<string, SecretV3RawSanitized[]>;
  dynamicSecrets: Record<string, TDashboardProjectSecretsQuickSearchResponse["dynamicSecrets"]>;
  secretRotations: Record<string, TDashboardProjectSecretsQuickSearchResponse["secretRotations"]>;
};

export type TGetDashboardProjectSecretsQuickSearchDTO = {
  projectId: string;
  secretPath: string;
  tags: Record<string, boolean>;
  search: string;
  environments: string[];
};

export type TGetDashboardProjectSecretsByKeys = {
  projectId: string;
  secretPath: string;
  environment: string;
  keys: string[];
};

export type TGetAccessibleSecretsDTO = {
  projectId: string;
  secretPath: string;
  environment: string;
  recursive?: boolean;
  filterByAction:
    | ProjectPermissionSecretActions.DescribeSecret
    | ProjectPermissionSecretActions.ReadValue;
};
