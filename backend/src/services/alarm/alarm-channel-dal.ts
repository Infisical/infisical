import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmChannels } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlarmChannelDALFactory = ReturnType<typeof alarmChannelDALFactory>;

export type TAlarmChannelWithUsage = TAlarmChannels & { usageCount: number };
export type TAlarmChannelWithAlarmId = TAlarmChannels & { alarmId: string };

export const alarmChannelDALFactory = (db: TDbClient) => {
  const alarmChannelOrm = ormify(db, TableName.AlarmChannel);

  const scopeFilter = (query: Knex.QueryBuilder, orgId: string, projectId?: string | null): void => {
    void query.where(`${TableName.AlarmChannel}.orgId`, orgId);
    if (projectId) void query.where(`${TableName.AlarmChannel}.projectId`, projectId);
    else void query.whereNull(`${TableName.AlarmChannel}.projectId`);
  };

  const findWithUsageByScope = async (
    { orgId, projectId }: { orgId: string; projectId?: string | null },
    tx?: Knex
  ): Promise<TAlarmChannelWithUsage[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AlarmChannel)
        .leftJoin(
          TableName.AlarmChannelMembership,
          `${TableName.AlarmChannel}.id`,
          `${TableName.AlarmChannelMembership}.channelId`
        )
        .leftJoin(TableName.Project, `${TableName.AlarmChannel}.projectId`, `${TableName.Project}.id`)
        .whereNull(`${TableName.Project}.deleteAfter`);
      scopeFilter(query, orgId, projectId);

      const rows = await query
        .groupBy(`${TableName.AlarmChannel}.id`)
        .select(selectAllTableCols(TableName.AlarmChannel))
        .select(db.raw(`count(??.??)::int as "usageCount"`, [TableName.AlarmChannelMembership, "id"]))
        .orderBy(`${TableName.AlarmChannel}.createdAt`, "asc");

      return rows as unknown as TAlarmChannelWithUsage[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindWithUsageByScope" });
    }
  };

  const findActiveById = async (id: string, tx?: Knex): Promise<TAlarmChannels | undefined> => {
    try {
      const channel = await (tx || db.replicaNode())(TableName.AlarmChannel)
        .leftJoin(TableName.Project, `${TableName.AlarmChannel}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.AlarmChannel}.id`, id)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(selectAllTableCols(TableName.AlarmChannel))
        .first();

      return channel as TAlarmChannels | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindActiveById" });
    }
  };

  const findByIdsInScope = async (
    ids: string[],
    { orgId, projectId }: { orgId: string; projectId?: string | null },
    tx?: Knex
  ): Promise<TAlarmChannels[]> => {
    try {
      if (!ids.length) return [];
      const query = (tx || db.replicaNode())(TableName.AlarmChannel).whereIn(`${TableName.AlarmChannel}.id`, ids);
      scopeFilter(query, orgId, projectId);
      const channels = await query.select(selectAllTableCols(TableName.AlarmChannel));
      return channels as TAlarmChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdsInScope" });
    }
  };

  const findByNameInScope = async (
    name: string,
    { orgId, projectId }: { orgId: string; projectId?: string | null },
    tx?: Knex
  ): Promise<TAlarmChannels | undefined> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AlarmChannel).where(`${TableName.AlarmChannel}.name`, name);
      scopeFilter(query, orgId, projectId);
      const channel = await query.select(selectAllTableCols(TableName.AlarmChannel)).first();
      return channel as TAlarmChannels | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByNameInScope" });
    }
  };

  const findByAlarmId = async (alarmId: string, tx?: Knex): Promise<TAlarmChannels[]> => {
    try {
      const channels = await (tx || db.replicaNode())(TableName.AlarmChannel)
        .join(
          TableName.AlarmChannelMembership,
          `${TableName.AlarmChannel}.id`,
          `${TableName.AlarmChannelMembership}.channelId`
        )
        .where(`${TableName.AlarmChannelMembership}.alarmId`, alarmId)
        .select(selectAllTableCols(TableName.AlarmChannel))
        .orderBy(`${TableName.AlarmChannel}.createdAt`, "asc");

      return channels as TAlarmChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmId" });
    }
  };

  // Returns each attached channel tagged with the alarmId it is attached to, for batched list responses.
  const findByAlarmIds = async (alarmIds: string[], tx?: Knex): Promise<TAlarmChannelWithAlarmId[]> => {
    try {
      if (!alarmIds.length) return [];
      const channels = await (tx || db.replicaNode())(TableName.AlarmChannel)
        .join(
          TableName.AlarmChannelMembership,
          `${TableName.AlarmChannel}.id`,
          `${TableName.AlarmChannelMembership}.channelId`
        )
        .whereIn(`${TableName.AlarmChannelMembership}.alarmId`, alarmIds)
        .select(selectAllTableCols(TableName.AlarmChannel))
        .select(db.ref("alarmId").withSchema(TableName.AlarmChannelMembership).as("alarmId"))
        .orderBy(`${TableName.AlarmChannel}.createdAt`, "asc");

      return channels as unknown as TAlarmChannelWithAlarmId[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmIds" });
    }
  };

  return {
    ...alarmChannelOrm,
    findWithUsageByScope,
    findActiveById,
    findByIdsInScope,
    findByNameInScope,
    findByAlarmId,
    findByAlarmIds
  };
};
