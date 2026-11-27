import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectTemplateDALFactory = ReturnType<typeof projectTemplateDALFactory>;

export const projectTemplateDALFactory = (db: TDbClient) => {
  const projectTemplateOrm = ormify(db, TableName.ProjectTemplates);

  // Templates of one type across a root org and all its sub-orgs.
  const countByTypeInOrgTree = async (rootOrgId: string, type: ProjectType, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const doc = await conn(TableName.ProjectTemplates)
        .where({ type })
        .whereIn(
          "orgId",
          conn(TableName.Organization).where("id", rootOrgId).orWhere("rootOrgId", rootOrgId).select("id")
        )
        .count({ count: "id" })
        .first();
      return Number(doc?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count project templates in organization tree" });
    }
  };

  return { ...projectTemplateOrm, countByTypeInOrgTree };
};
