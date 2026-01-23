import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectEnvDALFactory = ReturnType<typeof projectEnvDALFactory>;

export const projectEnvDALFactory = (db: TDbClient) => {
  const projectEnvOrm = ormify(db, TableName.Environment);

  const findBySlugs = async (projectId: string, env: string[], tx?: Knex) => {
    try {
      const envs = await (tx || db.replicaNode())(TableName.Environment)
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
    // acquire update lock on project environments.
    // this ensures that concurrent invocations will wait and execute sequentially
    await (tx || db)(TableName.Environment).where({ projectId }).forUpdate();

    const lastPos = await (tx || db)(TableName.Environment)
      .where({ projectId })
      .max("position", { as: "position" })
      .first();

    return lastPos?.position || 0;
  };

  const updateAllPosition = async (projectId: string, pos: number, targetPos: number, tx?: Knex) => {
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

  const shiftPositions = async (projectId: string, pos: number, tx?: Knex) => {
    // Shift all positions >= the new position up by 1
    await (tx || db)(TableName.Environment).where({ projectId }).where("position", ">=", pos).increment("position", 1);
  };

  return {
    ...projectEnvOrm,
    findBySlugs,
    findLastEnvPosition,
    updateAllPosition,
    shiftPositions
  };
};
