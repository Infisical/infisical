import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { OrderByDirection, TActorInput, TDynamicSecretWithMetadata } from "@app/lib/types";
import { ResourceMetadataDTO } from "@app/services/resource-metadata/resource-metadata-schema";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

import { TApiConnectApp, TApiConnectResource, TIbmApiConnectBaseCredentials } from "./providers/ibm-api-connect";
import { DynamicSecretProviderSchema } from "./providers/models";

// various status for dynamic secret that happens in background
export enum DynamicSecretStatus {
  Deleting = "Revocation in process",
  FailedDeletion = "Failed to delete"
}

type TProvider = z.infer<typeof DynamicSecretProviderSchema>;
export type TCreateDynamicSecretDTO = {
  provider: TProvider;
  defaultTTL: string;
  maxTTL?: string | null;
  path: string;
  environmentSlug: string;
  name: string;
  projectSlug: string;
  metadata?: ResourceMetadataDTO;
  usernameTemplate?: string | null;
} & TActorInput;

export type TUpdateDynamicSecretDTO = {
  name: string;
  newName?: string;
  defaultTTL?: string;
  maxTTL?: string | null;
  path: string;
  environmentSlug: string;
  inputs?: TProvider["inputs"];
  projectSlug: string;
  metadata?: ResourceMetadataDTO;
  usernameTemplate?: string | null;
} & TActorInput;

export type TDeleteDynamicSecretDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
  isForced?: boolean;
} & TActorInput;

export type TDetailsDynamicSecretDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & TActorInput;

export type TGetSshCaPublicKeyDTO = {
  dynamicSecretId: string;
} & TActorInput;

export type TDynamicSecretProviderDiscoveryDTO = {
  projectSlug: string;
} & TActorInput;

export type ListDynamicSecretsFilters = {
  offset?: number;
  limit?: number;
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TListDynamicSecretsDTO = {
  path: string;
  environmentSlug: string;
  projectSlug?: string;
  projectId?: string;
} & ListDynamicSecretsFilters &
  TActorInput;

export type TListDynamicSecretsByFolderMappingsDTO = {
  projectId: string;
  folderMappings: { folderId: string; path: string; environment: string }[];
  filters: ListDynamicSecretsFilters;
};

export type TListDynamicSecretsMultiEnvDTO = Omit<
  TListDynamicSecretsDTO,
  "projectId" | "environmentSlug" | "projectSlug"
> & { projectId: string; environmentSlugs: string[]; isInternal?: boolean };

export type TGetDynamicSecretsCountDTO = Omit<TListDynamicSecretsDTO, "projectSlug" | "projectId"> & {
  projectId: string;
};

export type TDynamicSecretServiceFactory = {
  create: (
    arg: TCreateDynamicSecretDTO
  ) => Promise<TDynamicSecrets & { projectId: string; environment: string; secretPath: string }>;
  updateByName: (arg: TUpdateDynamicSecretDTO) => Promise<{
    dynamicSecret: TDynamicSecrets;
    updatedFields: string[];
    projectId: string;
    environment: string;
    secretPath: string;
  }>;
  deleteByName: (
    arg: TDeleteDynamicSecretDTO
  ) => Promise<TDynamicSecrets & { projectId: string; environment: string; secretPath: string }>;
  getDetails: (
    arg: TDetailsDynamicSecretDTO
  ) => Promise<TDynamicSecretWithMetadata & { projectId: string; environment: string; secretPath: string }>;
  listDynamicSecretsByEnv: (arg: TListDynamicSecretsDTO) => Promise<{
    dynamicSecrets: Array<TDynamicSecretWithMetadata>;
    environment: string;
    secretPath: string;
    projectId: string;
  }>;
  listDynamicSecretsByEnvs: (
    arg: TListDynamicSecretsMultiEnvDTO
  ) => Promise<Array<TDynamicSecretWithMetadata & { environment: string }>>;
  getDynamicSecretCount: (arg: TGetDynamicSecretsCountDTO) => Promise<number>;
  getCountMultiEnv: (arg: TListDynamicSecretsMultiEnvDTO) => Promise<number>;
  fetchAzureEntraIdUsers: (
    arg: {
      tenantId: string;
      applicationId: string;
      clientSecret: string;
    } & TDynamicSecretProviderDiscoveryDTO
  ) => Promise<
    {
      name: string;
      id: string;
      email: string;
    }[]
  >;
  fetchIbmApiConnectOrgs: (
    arg: TIbmApiConnectBaseCredentials & TDynamicSecretProviderDiscoveryDTO
  ) => Promise<TApiConnectResource[]>;
  fetchIbmApiConnectOrgCatalogs: (
    arg: TIbmApiConnectBaseCredentials & { orgId: string } & TDynamicSecretProviderDiscoveryDTO
  ) => Promise<TApiConnectResource[]>;
  fetchIbmApiConnectOrgApps: (
    arg: TIbmApiConnectBaseCredentials & { orgId: string; catalogId: string } & TDynamicSecretProviderDiscoveryDTO
  ) => Promise<TApiConnectApp[]>;
  listDynamicSecretsByFolderIds: (
    arg: TListDynamicSecretsByFolderMappingsDTO,
    actor: TActorContext
  ) => Promise<{
    dynamicSecrets: Array<TDynamicSecretWithMetadata & { environment: string; path: string }>;
    isLimitReached: boolean;
  }>;
  getSshCaPublicKey: (arg: TGetSshCaPublicKeyDTO) => Promise<{ caPublicKey: string }>;
};
