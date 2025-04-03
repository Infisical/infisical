import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
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
  totalCount: number;
  totalUniqueSecretsInPage: number;
  totalUniqueDynamicSecretsInPage: number;
  totalUniqueFoldersInPage: number;
  totalUniqueSecretImportsInPage: number;
};

export type DashboardProjectSecretsDetailsResponse = {
  imports?: TSecretImport[];
  folders?: TSecretFolder[];
  dynamicSecrets?: TDynamicSecret[];
  secrets?: SecretV3Raw[];
  totalImportCount?: number;
  totalFolderCount?: number;
  totalDynamicSecretCount?: number;
  totalSecretCount?: number;
  totalCount: number;
};

export type DashboardProjectSecretsByKeys = {
  secrets: SecretV3Raw[];
};

export type DashboardProjectSecretsOverview = Omit<
  DashboardProjectSecretsOverviewResponse,
  "secrets"
> & {
  secrets?: SecretV3RawSanitized[];
};

export type DashboardProjectSecretsDetails = Omit<
  DashboardProjectSecretsDetailsResponse,
  "secrets"
> & {
  secrets?: SecretV3RawSanitized[];
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
  secrets: SecretV3Raw[];
};

export type TDashboardProjectSecretsQuickSearch = {
  folders: Record<string, TDashboardProjectSecretsQuickSearchResponse["folders"]>;
  secrets: Record<string, SecretV3RawSanitized[]>;
  dynamicSecrets: Record<string, TDashboardProjectSecretsQuickSearchResponse["dynamicSecrets"]>;
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
