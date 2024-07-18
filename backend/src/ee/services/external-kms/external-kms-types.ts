import { TOrgPermission } from "@app/lib/types";

import { TExternalKmsInputSchema, TExternalKmsInputUpdateSchema } from "./providers/model";

export type TCreateExternalKmsDTO = {
  slug?: string;
  description?: string;
  provider: TExternalKmsInputSchema;
} & Omit<TOrgPermission, "orgId">;

export type TUpdateExternalKmsDTO = {
  id: string;
  slug?: string;
  description?: string;
  provider?: TExternalKmsInputUpdateSchema;
} & Omit<TOrgPermission, "orgId">;

export type TDeleteExternalKmsDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

export type TListExternalKmsDTO = Omit<TOrgPermission, "orgId">;

export type TGetExternalKmsByIdDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetExternalKmsBySlugDTO = {
  slug: string;
} & Omit<TOrgPermission, "orgId">;
