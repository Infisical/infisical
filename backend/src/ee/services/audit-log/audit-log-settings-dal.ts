import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAuditLogSettingsDALFactory = ReturnType<typeof auditLogSettingsDALFactory>;

export const auditLogSettingsDALFactory = (db: TDbClient) => ormify(db, TableName.AuditLogSettings);
