import { z } from "zod";

import { TProjectPermission } from "@app/lib/types";

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
  environment: string;
  slug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateDynamicSecretDTO = {
  slug: string;
  newSlug?: string;
  defaultTTL?: string;
  maxTTL?: string | null;
  path: string;
  environment: string;
  inputs?: TProvider["inputs"];
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteDynamicSecretDTO = {
  slug: string;
  path: string;
  environment: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDetailsDynamicSecretDTO = {
  slug: string;
  path: string;
  environment: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TListDynamicSecretsDTO = {
  path: string;
  environment: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;
