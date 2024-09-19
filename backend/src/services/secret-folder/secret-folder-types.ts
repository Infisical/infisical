import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

export enum ReservedFolders {
  SecretReplication = "__reserve_replication_"
}

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

export type TUpdateManyFoldersDTO = {
  projectSlug: string;
  folders: {
    environment: string;
    path: string;
    id: string;
    name: string;
  }[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteFolderDTO = {
  environment: string;
  path: string;
  idOrName: string;
} & TProjectPermission;

export type TGetFolderDTO = {
  environment: string;
  path: string;
  search?: string;
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
} & TProjectPermission;

export type TGetFolderByIdDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
