import { TProjectPermission } from "@app/lib/types";

export type TCreateSecretRotationDTO = {
  secretPath: string;
  environment: string;
  interval: number;
  provider: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, string>;
} & TProjectPermission;

export type TListByProjectIdDTO = TProjectPermission;

export type TDeleteDTO = {
  rotationId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRestartDTO = {
  rotationId: string;
} & Omit<TProjectPermission, "projectId">;
