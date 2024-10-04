import { TProjectPermission } from "@app/lib/types";

export type TCreateEnvDTO = {
  name: string;
  slug: string;
} & TProjectPermission;

export type TUpdateEnvDTO = {
  id: string;
  name?: string;
  slug?: string;
  position?: number;
} & TProjectPermission;

export type TDeleteEnvDTO = {
  id: string;
} & TProjectPermission;

export type TReorderEnvDTO = {
  id: string;
  pos: number;
} & TProjectPermission;

export type TGetEnvDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
