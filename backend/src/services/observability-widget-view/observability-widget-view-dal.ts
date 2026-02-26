import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TObservabilityWidgetViewDALFactory = ReturnType<typeof observabilityWidgetViewDALFactory>;

export const observabilityWidgetViewDALFactory = (db: TDbClient) => {
  const observabilityWidgetViewOrm = ormify(db, TableName.ObservabilityWidgetView);

  const findByOrgAndUser = async (orgId: string, userId: string, tx?: Knex) => {
    try {
      const views = await (tx || db.replicaNode())(TableName.ObservabilityWidgetView).where({ orgId, userId });
      return views;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgAndUser - ObservabilityWidgetView" });
    }
  };

  return {
    ...observabilityWidgetViewOrm,
    findByOrgAndUser
  };
};
