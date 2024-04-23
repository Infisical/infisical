import { TProjectPermission } from "@app/lib/types";

export type TCreateAuditLogStreamDTO = Omit<TProjectPermission, "projectId"> & {
  projectSlug: string;
  url: string;
  token?: string;
};

export type TUpdateAuditLogStreamDTO = Omit<TProjectPermission, "projectId"> & {
  id: string;
  url?: string;
  token?: string;
};

export type TDeleteAuditLogStreamDTO = Omit<TProjectPermission, "projectId"> & {
  id: string;
};

export type TListAuditLogStreamDTO = Omit<TProjectPermission, "projectId"> & {
  projectSlug: string;
};

export type TGetDetailsAuditLogStreamDTO = Omit<TProjectPermission, "projectId"> & {
  id: string;
};
