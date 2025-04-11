import { z } from "zod";

import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { ResourceMetadataDTO } from "@app/services/resource-metadata/resource-metadata-schema";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

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
} & Omit<TProjectPermission, "projectId">;

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
} & Omit<TProjectPermission, "projectId">;

export type TDeleteDynamicSecretDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
  isForced?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TDetailsDynamicSecretDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

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
  Omit<TProjectPermission, "projectId">;

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
