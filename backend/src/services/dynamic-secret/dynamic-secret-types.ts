import { z } from "zod";

import { TProjectPermission } from "@app/lib/types";

import { DynamicSecretProviderSchema } from "./providers/models";

type TProvider = z.infer<typeof DynamicSecretProviderSchema>;
export type TCreateDynamicSecretDTO = {
  provider: TProvider;
  defaultTTL: string;
  maxTTL?: string;
  path: string;
  environment: string;
  slug: string;
} & TProjectPermission;

export type TUpdateDynamicSecretDTO = {
  slug: string;
  newSlug?: string;
  defaultTTL?: string;
  maxTTL?: string;
  path: string;
  environment: string;
  inputs?: TProvider["inputs"];
} & TProjectPermission;

export type TDeleteDyanmicSecretDTO = {
  slug: string;
  path: string;
  environment: string;
} & TProjectPermission;

export type TListDyanmicSecretsDTO = {
  path: string;
  environment: string;
} & TProjectPermission;
