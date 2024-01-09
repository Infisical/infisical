import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectEnvDalFactory = ReturnType<typeof projectEnvDalFactory>;

export const projectEnvDalFactory = (db: TDbClient) => {
  const projectEnvOrm = ormify(db, TableName.Environment);

  const findBySlugs = async (projectId: string, env: string[], tx?: Knex) => {
    try {
      const envs = await (tx || db)(TableName.Environment)
        .where("projectId", projectId)
        .whereIn("slug", env);
      return envs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by slugs" });
    }
  };

  // we are using postion based sorting as its a small list
  // this will return the last value of the position in a folder with secret imports
  const findLastEnvPosition = async (projectId: string, tx?: Knex) => {
    const lastPos = await (tx || db)(TableName.Environment)
      .where({ projectId })
      .max({ position: "position" })
      .first();
    return lastPos?.position || 0;
  };

  const updateAllPosition = async (
    projectId: string,
    pos: number,
    targetPos: number,
    tx?: Knex
  ) => {
    try {
      if (targetPos === -1) {
        // this means delete
        await (tx || db)(TableName.Environment)
          .where({ projectId })
          .andWhere("position", ">", pos)
          .decrement("position", 1);
        return;
      }

      if (targetPos > pos) {
        await (tx || db)(TableName.Environment)
          .where({ projectId })
          .where("position", "<=", targetPos)
          .andWhere("position", ">", pos)
          .decrement("position", 1);
      } else {
        await (tx || db)(TableName.Environment)
          .where({ projectId })
          .where("position", ">=", targetPos)
          .andWhere("position", "<", pos)
          .increment("position", 1);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateEnvPos" });
    }
  };

  return {
    ...projectEnvOrm,
    findBySlugs,
    findLastEnvPosition,
    updateAllPosition
  };
};
