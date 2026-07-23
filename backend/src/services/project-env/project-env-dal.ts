import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectEnvironments } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TProjectEnvDALFactory = ReturnType<typeof projectEnvDALFactory>;

export const projectEnvDALFactory = (db: TDbClient) => {
  const projectEnvOrm = ormify(db, TableName.Environment);

  const findById: typeof projectEnvOrm.findById = async (id, tx) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Environment)
        .where({ id })
        .whereNull("deleteAfter")
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
        .whereNull("deleteAfter")
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
        .whereNull("deleteAfter");
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
        .whereNull("deleteAfter");
      return envs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by slugs" });
    }
  };

  const softDeleteById = async (
    id: string,
    projectId: string,
    deleteAfter: Date,
    softDeletedAt: Date,
    deletedByUserId: string | null,
    deletedByIdentityId: string | null,
    position: number,
    tx?: Knex
  ) => {
    try {
      const [doc] = await (tx || db)(TableName.Environment)
        .where({ id, projectId })
        .whereNull("deleteAfter")
        .update({ deleteAfter, softDeletedAt, deletedByUserId, deletedByIdentityId, position })
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

  // Worker read: env row + orgId via a soft-delete-blind project join, so the hard-delete audit
  // log resolves its org even while the parent project is pending deletion.
  const findByIdWithOrgIncludingExpired = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Environment)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Environment}.id`, id)
        .select(selectAllTableCols(TableName.Environment), db.ref("orgId").withSchema(TableName.Project).as("orgId"))
        .first();
      return result as (TProjectEnvironments & { orgId: string }) | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id with org including expired" });
    }
  };

  // Bypasses the soft-delete read filter. Used by create/update to detect when a
  // slug is held by a pending-deletion env so we can surface a friendly error
  // instead of the DB unique-constraint failure.
  const findBySlugIncludingExpired = async (projectId: string, slug: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Environment).where({ projectId, slug }).first("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by slug including expired" });
    }
  };

  const restoreById = async (id: string, projectId: string, position: number, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.Environment)
        .where({ id, projectId })
        .whereNotNull("deleteAfter")
        .andWhere("deleteAfter", ">", new Date())
        .update({
          deleteAfter: null,
          softDeletedAt: null,
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

  // Closes a gap at `pos` across all environments in a project.
  // Used by hard-delete flows to keep deleted entries compact as well.
  const closePositionGap = async (projectId: string, pos: number, tx?: Knex) => {
    await (tx || db)(TableName.Environment)
      .where({ projectId })
      .andWhere("position", ">", pos)
      .decrement("position", 1);
  };

  // Oldest-first, bounded discovery for the hard-delete cron. The LIMIT keeps the enqueued set bounded
  // regardless of backlog size.
  const findExpiredForHardDelete = async (limit: number, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Environment)
        .whereNotNull("deleteAfter")
        .andWhere("deleteAfter", "<=", new Date())
        .orderBy("deleteAfter", "asc")
        .limit(limit)
        .select("*");
      return result as TProjectEnvironments[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find expired for hard delete" });
    }
  };

  // Atomic hard-delete guard for the worker: removes the env only while it is still expired
  const hardDeleteIfExpired = async (id: string, projectId: string, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.Environment)
        .where({ id, projectId })
        .whereNotNull("deleteAfter")
        .andWhere("deleteAfter", "<=", new Date())
        .del()
        .returning("*");
      return doc as TProjectEnvironments | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Hard delete environment if expired" });
    }
  };

  // Batched delete of an environment's secret_versions_v2 rows. Must run before the environment is
  // deleted, since those rows have no FK back to the folder/env tree and would otherwise be orphaned.
  const hardDeleteEnvironmentSecretVersionsInBatches = async (
    envId: string,
    batchSize: number,
    statementTimeoutMs: number,
    interBatchSleepMs: number
  ) => {
    let totalDeleted = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const deletedCount = await db.transaction(async (tx): Promise<number> => {
        await tx.raw(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
        const folderIdsSubquery = tx(TableName.SecretFolder).where("envId", envId).select("id");
        const idsToDelete = tx(TableName.SecretVersionV2)
          .whereIn("folderId", folderIdsSubquery)
          .select("id")
          .limit(batchSize);
        const deleted = await tx(TableName.SecretVersionV2).whereIn("id", idsToDelete).delete();
        return deleted;
      });
      totalDeleted += deletedCount;
      if (deletedCount < batchSize) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, interBatchSleepMs + Math.floor(Math.random() * interBatchSleepMs));
      });
    }
    return totalDeleted;
  };

  return {
    ...projectEnvOrm,
    findById,
    findOne,
    find,
    findBySlugs,
    softDeleteById,
    findByIdIncludingExpired,
    findByIdWithOrgIncludingExpired,
    findBySlugIncludingExpired,
    restoreById,
    findLastEnvPosition,
    updateAllPosition,
    shiftPositions,
    closePositionGap,
    findExpiredForHardDelete,
    hardDeleteIfExpired,
    hardDeleteEnvironmentSecretVersionsInBatches
  };
};
