import { TProjectPermission } from "@app/lib/types";

export type TCreateEnvDTO = {
  name: string;
  slug: string;
} & TProjectPermission;

export type TUpdateEnvDTO = {
  id: string;
  name?: string;
  slug?: string;
} & TProjectPermission;

export type TDeleteEnvDTO = {
  id: string;
} & TProjectPermission;
