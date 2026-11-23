import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAuditLogStreams } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, TOrmify } from "@app/lib/knex";

export type TAuditLogStreamDALFactory = TOrmify<TableName.AuditLogStream> & {
  primaryNode: () => Knex;
  lockById: (id: string, tx: Knex) => Promise<TAuditLogStreams | undefined>;
};

export const auditLogStreamDALFactory = (db: TDbClient): TAuditLogStreamDALFactory => {
  const orm = ormify(db, TableName.AuditLogStream);

  const lockById = async (id: string, tx: Knex) => {
    try {
      return (await tx(TableName.AuditLogStream).where({ id }).forUpdate().first()) as TAuditLogStreams | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock audit log stream" });
    }
  };

  return { ...orm, primaryNode: () => db.primaryNode(), lockById };
};
