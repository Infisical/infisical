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
      .max("position")
      .first();
    return lastPos?.position || 1;
  };

  const incrementLastPosition = async (
    projectId: string,
    startPos: number,
    increment = 1,
    tx?: Knex
  ) =>
    (tx || db)(TableName.Environment)
      .where("projectId", projectId)
      .where("postion", ">=", startPos)
      .increment("position", increment);

  const decrementLastPosition = async (
    projectId: string,
    startPos: number,
    decrement = 1,
    tx?: Knex
  ) =>
    (tx || db)(TableName.Environment)
      .where("projectId", projectId)
      .where("postion", ">", startPos)
      .decrement("position", decrement);

  return {
    ...projectEnvOrm,
    findBySlugs,
    findLastEnvPosition,
    decrementLastPosition,
    incrementLastPosition
  };
};
