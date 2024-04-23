export type TAuditLogStream = {
  id: string;
  url: string;
  token: string;
};

export type TCreateAuditLogStreamDTO = {
  url: string;
  token?: string;
  orgId: string;
};

export type TUpdateAuditLogStreamDTO = {
  id: string;
  url?: string;
  token?: string;
  orgId: string;
};

export type TDeleteAuditLogStreamDTO = {
  id: string;
  orgId: string;
};
