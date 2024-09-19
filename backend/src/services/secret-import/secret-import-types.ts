import { TProjectPermission } from "@app/lib/types";

export type TCreateSecretImportDTO = {
  environment: string;
  path: string;
  data: {
    environment: string;
    path: string;
  };
  isReplication?: boolean;
} & TProjectPermission;

export type TUpdateSecretImportDTO = {
  environment: string;
  path: string;
  id: string;
  data: Partial<{ environment: string; path: string; position: number }>;
} & TProjectPermission;

export type TResyncSecretImportReplicationDTO = {
  environment: string;
  path: string;
  id: string;
} & TProjectPermission;

export type TDeleteSecretImportDTO = {
  environment: string;
  path: string;
  id: string;
} & TProjectPermission;

export type TGetSecretImportsDTO = {
  environment: string;
  path: string;
  search?: string;
  limit?: number;
  offset?: number;
} & TProjectPermission;

export type TGetSecretsFromImportDTO = {
  environment: string;
  path: string;
} & TProjectPermission;
