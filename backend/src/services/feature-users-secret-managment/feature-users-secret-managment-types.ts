import { TGenericPermission } from "@app/lib/types";

export type TGetAllSecretsDTO = {
  offset: number;
  limit: number;
} & TGenericPermission;
