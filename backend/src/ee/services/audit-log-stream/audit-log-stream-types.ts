import { TOrgPermission } from "@app/lib/types";

export type TCreateAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  url: string;
  token?: string;
};

export type TUpdateAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
  url?: string;
  token?: string;
};

export type TDeleteAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
};

export type TListAuditLogStreamDTO = Omit<TOrgPermission, "orgId">;

export type TGetDetailsAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
};
