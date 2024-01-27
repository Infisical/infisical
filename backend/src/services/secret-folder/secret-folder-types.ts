import { TProjectPermission } from "@app/lib/types";

export type TCreateFolderDTO = {
  environment: string;
  path: string;
  name: string;
} & TProjectPermission;

export type TUpdateFolderDTO = {
  environment: string;
  path: string;
  id: string;
  name: string;
} & TProjectPermission;

export type TDeleteFolderDTO = {
  environment: string;
  path: string;
  id: string;
} & TProjectPermission;

export type TGetFolderDTO = {
  environment: string;
  path: string;
} & TProjectPermission;
