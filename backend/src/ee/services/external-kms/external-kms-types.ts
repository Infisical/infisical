import { TOrgPermission } from "@app/lib/types";

import { TExternalKmsInputSchema, TExternalKmsInputUpdateSchema } from "./providers/model";

export type TCreateExternalKmsDTO = {
  name?: string;
  description?: string;
  provider: TExternalKmsInputSchema;
} & Omit<TOrgPermission, "orgId">;

export type TUpdateExternalKmsDTO = {
  id: string;
  name?: string;
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
  name: string;
} & Omit<TOrgPermission, "orgId">;
