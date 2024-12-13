export type LogStreamHeaders = {
  key: string;
  value: string;
};

export type TAuditLogStream = {
  id: string;
  url: string;
  headers?: LogStreamHeaders[];
};

export type TCreateAuditLogStreamDTO = {
  url: string;
  headers?: LogStreamHeaders[];
  orgId: string;
};

export type TUpdateAuditLogStreamDTO = {
  id: string;
  url?: string;
  headers?: LogStreamHeaders[];
  orgId: string;
};

export type TDeleteAuditLogStreamDTO = {
  id: string;
  orgId: string;
};
