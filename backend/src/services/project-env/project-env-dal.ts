import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectEnvironments } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TProjectEnvDALFactory = ReturnType<typeof projectEnvDALFactory>;

export const projectEnvDALFactory = (db: TDbClient) => {
  const projectEnvOrm = ormify(db, TableName.Environment);

  const findById: typeof projectEnvOrm.findById = async (id, tx) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Environment)
        .where({ id })
        .whereNull("expireAfter")
        .first("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  const findOne: typeof projectEnvOrm.findOne = async (filter, tx) => {
    try {
      const res = await (tx || db.replicaNode())(TableName.Environment)
        .where(filter)
        .whereNull("expireAfter")
        .first("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const find = (async (
    filter: TFindFilter<TProjectEnvironments>,
    { offset, limit, sort, tx }: TFindOpt<TProjectEnvironments> = {}
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Environment)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter))
        .whereNull("expireAfter");
      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }
      const res = await query;
      return res as TProjectEnvironments[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  }) as typeof projectEnvOrm.find;

  const findBySlugs = async (projectId: string, env: string[], tx?: Knex) => {
    try {
      const envs = await (tx || db.replicaNode())(TableName.Environment)
        .where("projectId", projectId)
        .whereIn("slug", env)
        .whereNull("expireAfter");
      return envs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by slugs" });
    }
  };

  const softDeleteById = async (
    id: string,
    projectId: string,
    expireAfter: Date,
    requestedSoftDeleteAt: Date,
    deletedByUserId: string | null,
    deletedByIdentityId: string | null,
    tx?: Knex
  ) => {
    try {
      const [doc] = await (tx || db)(TableName.Environment)
        .where({ id, projectId })
        .whereNull("expireAfter")
        .update({ expireAfter, requestedSoftDeleteAt, deletedByUserId, deletedByIdentityId })
        .returning("*");
      return doc as TProjectEnvironments | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Soft delete environment" });
    }
  };

  // Bypasses the soft-delete read filter on findById/findOne/find. Only intended
  // for the restore flow — every other read path must keep soft-deleted envs hidden.
  const findByIdIncludingExpired = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Environment).where({ id }).first("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id including expired" });
    }
  };

  const restoreById = async (id: string, projectId: string, position: number, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.Environment)
        .where({ id, projectId })
        .whereNotNull("expireAfter")
        .update({
          expireAfter: null,
          requestedSoftDeleteAt: null,
          deletedByUserId: null,
          deletedByIdentityId: null,
          position
        })
        .returning("*");
      return doc as TProjectEnvironments | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Restore environment" });
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
    findById,
    findOne,
    find,
    findBySlugs,
    softDeleteById,
    findByIdIncludingExpired,
    restoreById,
    findLastEnvPosition,
    updateAllPosition,
    shiftPositions
  };
};
