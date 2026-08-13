import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { EndpointCommandStatus } from "./endpoint-enums";

export type TEndpointCommandDALFactory = ReturnType<typeof endpointCommandDALFactory>;

export const endpointCommandDALFactory = (db: TDbClient) => {
  const commandOrm = ormify(db, TableName.EndpointDeviceCommand);

  // The device is joined rather than trusted from the caller: a command id is only readable through
  // the project that owns the device it was queued for, so an id from another org reads as missing.
  const findByIdInProject = async ({ id, projectId }: { id: string; projectId: string }, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.EndpointDeviceCommand)
        .join(
          TableName.EndpointDevice,
          `${TableName.EndpointDevice}.id`,
          `${TableName.EndpointDeviceCommand}.deviceId`
        )
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        .andWhere(`${TableName.EndpointDeviceCommand}.id`, id)
        .select(selectAllTableCols(TableName.EndpointDeviceCommand))
        .select(db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"))
        .first();

      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint command by id" });
    }
  };

  const findByProject = async (
    {
      projectId,
      deviceId,
      limit,
      cursor
    }: { projectId: string; deviceId?: string; limit: number; cursor?: { createdAt: Date; id: string } },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.EndpointDeviceCommand)
        .join(
          TableName.EndpointDevice,
          `${TableName.EndpointDevice}.id`,
          `${TableName.EndpointDeviceCommand}.deviceId`
        )
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        .orderBy([
          { column: `${TableName.EndpointDeviceCommand}.createdAt`, order: "desc" },
          { column: `${TableName.EndpointDeviceCommand}.id`, order: "desc" }
        ])
        .limit(limit)
        .select(selectAllTableCols(TableName.EndpointDeviceCommand))
        .select(db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"));

      if (deviceId) {
        void query.andWhere(`${TableName.EndpointDeviceCommand}.deviceId`, deviceId);
      }

      if (cursor) {
        void query.whereRaw(
          `("${TableName.EndpointDeviceCommand}"."createdAt", "${TableName.EndpointDeviceCommand}"."id") < (?, ?)`,
          [cursor.createdAt, cursor.id]
        );
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint commands" });
    }
  };

  // One statement, so two heartbeats racing cannot hand the same command to the device twice.
  // SKIP LOCKED rather than a plain read-then-write: the loser of the race takes the next command
  // instead of blocking on a row it is about to be told it does not own.
  const claimPendingForDevice = async ({ deviceId, limit }: { deviceId: string; limit: number }, tx?: Knex) => {
    const knex = tx || db;
    const now = new Date();

    try {
      const claimable = knex(TableName.EndpointDeviceCommand)
        .select("id")
        .where({ deviceId, status: EndpointCommandStatus.Pending })
        .andWhere("expiresAt", ">", now)
        .orderBy("createdAt", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked();

      return await knex(TableName.EndpointDeviceCommand)
        .whereIn("id", claimable)
        .update({ status: EndpointCommandStatus.Dispatched, dispatchedAt: now, updatedAt: now })
        .returning("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Claim endpoint commands" });
    }
  };

  // Runs on the agent's own poll rather than a cron: the queue only matters to the device it belongs
  // to, and that device asks about it every few seconds anyway.
  const expireStaleForDevice = async (deviceId: string, tx?: Knex) => {
    const now = new Date();

    try {
      return await (tx || db)(TableName.EndpointDeviceCommand)
        .where({ deviceId, status: EndpointCommandStatus.Pending })
        .andWhere("expiresAt", "<=", now)
        .update({ status: EndpointCommandStatus.Expired, completedAt: now, updatedAt: now })
        .returning("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Expire endpoint commands" });
    }
  };

  // Scoped to the device as well as the id, so an agent can only ever close out its own work, and
  // guarded on Dispatched so a replayed report cannot reopen a command that was already canceled.
  const completeDispatched = async (
    {
      id,
      deviceId,
      status,
      exitCode,
      stdout,
      stderr,
      outputTruncated,
      error
    }: {
      id: string;
      deviceId: string;
      status: EndpointCommandStatus;
      exitCode?: number | null;
      stdout?: string | null;
      stderr?: string | null;
      outputTruncated: boolean;
      error?: string | null;
    },
    tx?: Knex
  ) => {
    const now = new Date();

    try {
      const [row] = await (tx || db)(TableName.EndpointDeviceCommand)
        .where({ id, deviceId, status: EndpointCommandStatus.Dispatched })
        .update({
          status,
          exitCode: exitCode ?? null,
          stdout: stdout ?? null,
          stderr: stderr ?? null,
          outputTruncated,
          error: error ?? null,
          completedAt: now,
          updatedAt: now
        })
        .returning("*");

      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Complete endpoint command" });
    }
  };

  // Only a command the device has not been handed yet. Once it is dispatched the process may already
  // be running, and marking the row canceled would claim something we cannot actually do.
  const cancelPending = async (id: string, tx?: Knex) => {
    const now = new Date();

    try {
      const [row] = await (tx || db)(TableName.EndpointDeviceCommand)
        .where({ id, status: EndpointCommandStatus.Pending })
        .update({ status: EndpointCommandStatus.Canceled, completedAt: now, updatedAt: now })
        .returning("*");

      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Cancel endpoint command" });
    }
  };

  return {
    ...commandOrm,
    findByIdInProject,
    findByProject,
    claimPendingForDevice,
    expireStaleForDevice,
    completeDispatched,
    cancelPending
  };
};
