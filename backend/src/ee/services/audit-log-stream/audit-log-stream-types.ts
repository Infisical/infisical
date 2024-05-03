import { TOrgPermission } from "@app/lib/types";

export type LogStreamHeaders = {
  key: string;
  value: string;
};

export type TCreateAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  url: string;
  headers?: LogStreamHeaders[];
};

export type TUpdateAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
  url?: string;
  headers?: LogStreamHeaders[];
};

export type TDeleteAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
};

export type TListAuditLogStreamDTO = Omit<TOrgPermission, "orgId">;

export type TGetDetailsAuditLogStreamDTO = Omit<TOrgPermission, "orgId"> & {
  id: string;
};
