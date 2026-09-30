import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, TOrmify } from "@app/lib/knex";

export type TAuditLogSettingsDALFactory = TOrmify<TableName.AuditLogSettings> & {
  findByOrgIds: (
    orgIds: string[],
    tx?: Knex
  ) => Promise<
    {
      orgId: string;
      projectId: string | null;
      eventClass: string;
      isEnabled: boolean;
    }[]
  >;
};

export const auditLogSettingsDALFactory = (db: TDbClient): TAuditLogSettingsDALFactory => {
  const orm = ormify(db, TableName.AuditLogSettings);

  const findByOrgIds: TAuditLogSettingsDALFactory["findByOrgIds"] = async (orgIds, tx) => {
    if (!orgIds.length) return [];
    try {
      return await (tx || db.replicaNode())(TableName.AuditLogSettings)
        .whereIn("orgId", orgIds)
        .select("orgId", "projectId", "eventClass", "isEnabled");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find audit log settings by org" });
    }
  };

  return { ...orm, findByOrgIds };
};
