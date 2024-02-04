import { TProjectPermission } from "@app/lib/types";

export type TProjectSnapshotCountDTO = {
  environment: string;
  path: string;
} & TProjectPermission;

export type TProjectSnapshotListDTO = {
  environment: string;
  path: string;
  offset?: number;
  limit?: number;
} & TProjectPermission;

export type TGetSnapshotDataDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TRollbackSnapshotDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
