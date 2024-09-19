import { z } from "zod";

import { OrderByDirection, TProjectPermission } from "@app/lib/types";
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

export type TListDynamicSecretsDTO = {
  path: string;
  environmentSlug: string;
  projectSlug?: string;
  projectId?: string;
  offset?: number;
  limit?: number;
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
} & Omit<TProjectPermission, "projectId">;
