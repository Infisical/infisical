export type TAuditLogStream = {
  id: string;
  url: string;
  token: string;
};

export type TCreateAuditLogStreamDTO = {
  projectSlug: string;
  url: string;
  token?: string;
};

export type TUpdateAuditLogStreamDTO = {
  id: string;
  projectSlug: string;
  url?: string;
  token?: string;
};

export type TDeleteAuditLogStreamDTO = {
  id: string;
  projectSlug: string;
};
