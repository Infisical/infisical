import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAuditLogStreamDALFactory = ReturnType<typeof auditLogStreamDALFactory>;

export const auditLogStreamDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AuditLogStream);

  return orm;
};
