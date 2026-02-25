import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TObservabilityWidgetDALFactory = ReturnType<typeof observabilityWidgetDALFactory>;

export const observabilityWidgetDALFactory = (db: TDbClient) => {
  const observabilityWidgetOrm = ormify(db, TableName.ObservabilityWidget);

  const findByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const widgets = await (tx || db.replicaNode())(TableName.ObservabilityWidget).where({ orgId });

      return widgets;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId - ObservabilityWidget" });
    }
  };

  const findByOrgIdAndProjectId = async (orgId: string, projectId: string, tx?: Knex) => {
    try {
      const widgets = await (tx || db.replicaNode())(TableName.ObservabilityWidget)
        .where({ orgId })
        .andWhere((qb) => {
          void qb.where({ projectId }).orWhereNull("projectId");
        });

      return widgets;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgIdAndProjectId - ObservabilityWidget" });
    }
  };

  return {
    ...observabilityWidgetOrm,
    findByOrgId,
    findByOrgIdAndProjectId
  };
};
