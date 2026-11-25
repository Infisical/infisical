import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { GatewaysV2Schema, TableName, TGatewaysV2 } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

import { HEARTBEAT_BUFFER_SECONDS } from "./gateway-v2-constants";
import { buildGatewayLastSeenSql, buildGatewayProbedSql, buildGatewayReachableSql } from "./gateway-v2-transport-fns";

export type TGatewayV2DALFactory = ReturnType<typeof gatewayV2DalFactory>;

const OFFLINE_CLAIM_STATEMENT_TIMEOUT_MS = 30_000;

// Gateways check in every 180 seconds, and one failed check-in marks a gateway unreachable until the next one, so
// wait out a second miss before alerting.
const OFFLINE_ALERT_MIN_SILENCE_SECONDS = 2 * 180 + HEARTBEAT_BUFFER_SECONDS;

export type TOfflineGateway = {
  id: string;
  orgId: string;
  name: string;
  lastSeenAt: Date;
};

// A down gateway is due once per outage: the last alert must predate its last successful probe, which only
// moves forward when the gateway comes back. The hour floor caps a gateway that keeps flapping at one alert an hour.
const buildOfflineAlertDueSql = () => {
  const alertedAt = `"${TableName.GatewayV2}"."healthAlertedAt"`;
  return `(${buildGatewayProbedSql()} AND NOT ${buildGatewayReachableSql()} AND ${buildGatewayLastSeenSql()} < NOW() - make_interval(secs => ${OFFLINE_ALERT_MIN_SILENCE_SECONDS}) AND (${alertedAt} IS NULL OR (${alertedAt} < ${buildGatewayLastSeenSql()} AND ${alertedAt} < NOW() - interval '1 hour')))`;
};

export const gatewayV2DalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayV2);

  const find = async (filter: TFindFilter<TGatewaysV2>, { offset, limit, sort, tx }: TFindOpt<TGatewaysV2> = {}) => {
    try {
      const query = (tx || db.replicaNode())(TableName.GatewayV2)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter, TableName.GatewayV2))
        .leftJoin(TableName.Identity, `${TableName.Identity}.id`, `${TableName.GatewayV2}.identityId`)
        .select(selectAllTableCols(TableName.GatewayV2))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"));

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;

      return docs.map((el) => ({
        ...GatewaysV2Schema.parse(el),
        identity: el.identityId ? { id: el.identityId, name: el.identityName } : null
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Find` });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.GatewayV2)
        .join(TableName.Organization, `${TableName.GatewayV2}.orgId`, `${TableName.Organization}.id`)
        .where(`${TableName.GatewayV2}.id`, id)
        .select(selectAllTableCols(TableName.GatewayV2))
        .select(db.ref("name").withSchema(TableName.Organization).as("orgName"))
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Find by id` });
    }
  };

  const countByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.GatewayV2).where({ orgId }).count("id").first();
      return parseInt(String(result?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Count by org id` });
    }
  };

  const findOfflineDueForAlert = async (): Promise<Omit<TOfflineGateway, "lastSeenAt">[]> => {
    try {
      return (await db
        .replicaNode()(TableName.GatewayV2)
        .whereRaw(buildOfflineAlertDueSql())
        .select("id", "orgId", "name")) as Omit<TOfflineGateway, "lastSeenAt">[];
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Find offline due for alert` });
    }
  };

  // Re-checks the rule on the primary, so a replica that lags or an overlapping run can't alert twice, and a
  // gateway that recovered since it was found is skipped.
  const markOfflineAlerted = async (ids: string[], tx: Knex): Promise<TOfflineGateway[]> => {
    if (ids.length === 0) return [];
    try {
      // SET LOCAL lasts until the caller's transaction ends, so it also bounds the event insert after this.
      await tx.raw(`SET LOCAL statement_timeout = ${OFFLINE_CLAIM_STATEMENT_TIMEOUT_MS}`);

      const rows = await tx(TableName.GatewayV2)
        .whereIn("id", ids)
        .whereRaw(buildOfflineAlertDueSql())
        .update({ healthAlertedAt: new Date() })
        .returning(["id", "orgId", "name", "heartbeat", "directHeartbeat"]);

      // A due gateway was probed, so at least one of the two is set.
      return rows.map(({ id, orgId, name, heartbeat, directHeartbeat }) => ({
        id,
        orgId,
        name,
        lastSeenAt: new Date(Math.max(heartbeat?.getTime() ?? 0, directHeartbeat?.getTime() ?? 0))
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Mark offline alerted` });
    }
  };

  return { ...orm, find, findById, countByOrgId, findOfflineDueForAlert, markOfflineAlerted };
};
