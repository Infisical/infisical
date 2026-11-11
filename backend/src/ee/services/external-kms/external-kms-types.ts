import { TActorInput } from "@app/lib/types";

import { TExternalKmsGcpSchema, TExternalKmsInputSchema, TExternalKmsInputUpdateSchema } from "./providers/model";

export type TCreateExternalKmsDTO = {
  name?: string;
  description?: string;
  provider: TExternalKmsInputSchema;
} & TActorInput;

export type TUpdateExternalKmsDTO = {
  id: string;
  name?: string;
  description?: string;
  provider?: TExternalKmsInputUpdateSchema;
} & TActorInput;

export type TDeleteExternalKmsDTO = {
  id: string;
} & TActorInput;

export type TListExternalKmsDTO = TActorInput;

export type TGetExternalKmsByIdDTO = {
  id: string;
} & TActorInput;

export type TGetExternalKmsBySlugDTO = {
  name: string;
} & TActorInput;

export type TFetchGcpKmsKeysDTO = Pick<TExternalKmsGcpSchema, "credential" | "gcpRegion"> & TActorInput;
