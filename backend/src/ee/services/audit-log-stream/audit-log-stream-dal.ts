import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TAuditLogStreamDALFactory = TOrmify<TableName.AuditLogStream>;

export const auditLogStreamDALFactory = (db: TDbClient): TAuditLogStreamDALFactory => {
  const orm = ormify(db, TableName.AuditLogStream);

  return orm;
};
