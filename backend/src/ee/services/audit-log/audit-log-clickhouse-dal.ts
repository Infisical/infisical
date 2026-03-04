import { type ClickHouseClient } from "@clickhouse/client";
import RE2 from "re2";

import { TDbClient } from "@app/db";
import { TableName, TAuditLogs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { EventType, filterableSecretEvents } from "./audit-log-types";

type TAuditLogWithProjectName = TAuditLogs & { projectName: string | null };

type TClickHouseFindArg = {
  orgId: string;
  projectId?: string;
  environment?: string;
  userAgentType?: string;
  startDate: string;
  endDate: string;
  limit?: number;
  offset?: number;
  actorId?: string;
  actorType?: ActorType;
  secretPath?: string;
  secretKey?: string;
  eventType?: EventType[];
  eventMetadata?: Record<string, string>;
};

// Shape of a row returned from ClickHouse's JSONEachRow format
type TClickHouseAuditLogRow = {
  id: string;
  actor: string;
  actorMetadata: Record<string, unknown>;
  ipAddress: string;
  eventType: string;
  eventMetadata: Record<string, unknown>;
  userAgent: string;
  userAgentType: string;
  createdAt: string;
  orgId: string;
  projectId: string;
};

// Validate JSON path keys to prevent injection
const SAFE_KEY_RE = new RE2(/^[a-zA-Z0-9_]+$/);
const isSafeKey = (key: string): boolean => SAFE_KEY_RE.test(key);

export type TClickHouseAuditLogDALFactory = ReturnType<typeof clickhouseAuditLogDALFactory>;

export const clickhouseAuditLogDALFactory = (clickhouseClient: ClickHouseClient, db: TDbClient, tableName: string) => {
  const find = async (arg: TClickHouseFindArg): Promise<TAuditLogWithProjectName[]> => {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Required: orgId filter (matches the primary key prefix)
    conditions.push("orgId = {orgId:UUID}");
    params.orgId = arg.orgId;

    // Date range filter – pass as DateTime64(6) so ClickHouse can compare
    // directly against the createdAt column without implicit string conversion.
    // Strip the trailing 'Z' because ClickHouse's DateTime64 parser doesn't accept it.
    conditions.push("createdAt >= {startDate:DateTime64(6)}");
    params.startDate = arg.startDate.replace("Z", "");
    conditions.push("createdAt < {endDate:DateTime64(6)}");
    params.endDate = arg.endDate.replace("Z", "");

    // Optional: project filter
    if (arg.projectId) {
      conditions.push("projectId = {projectId:String}");
      params.projectId = arg.projectId;
    }

    // Optional: user agent type filter
    if (arg.userAgentType) {
      conditions.push("userAgentType = {userAgentType:String}");
      params.userAgentType = arg.userAgentType;
    }

    // Optional: actor type filter
    if (arg.actorType) {
      conditions.push("actor = {actorType:String}");
      params.actorType = arg.actorType;
    }

    // Optional: actor ID filter - queries the actorMetadata JSON field
    if (arg.actorId) {
      conditions.push("actorMetadata.userId = {actorId:String}");
      params.actorId = arg.actorId;
    }

    // Optional: event type filter
    if (arg.eventType?.length) {
      conditions.push("eventType IN ({eventTypes:Array(String)})");
      params.eventTypes = arg.eventType;
    }

    // Optional: eventMetadata dynamic key/value filters
    if (arg.eventMetadata && Object.keys(arg.eventMetadata).length) {
      let metaIdx = 0;
      for (const [key, value] of Object.entries(arg.eventMetadata)) {
        if (!isSafeKey(key)) {
          logger.warn({ key }, "Skipping unsafe eventMetadata filter key in ClickHouse query");
          // eslint-disable-next-line no-continue
          continue;
        }
        const paramName = `metaVal${metaIdx}`;
        conditions.push(`eventMetadata.${key} = {${paramName}:String}`);
        params[paramName] = value;
        metaIdx += 1;
      }
    }

    // Secret-specific filters (environment, secretPath, secretKey)
    const eventIsSecretType =
      !arg.eventType?.length || arg.eventType.some((event) => filterableSecretEvents.includes(event));

    if (arg.projectId && eventIsSecretType) {
      if (arg.environment) {
        conditions.push("eventMetadata.environment = {envFilter:String}");
        params.envFilter = arg.environment;
      }

      if (arg.secretPath) {
        conditions.push("eventMetadata.secretPath = {secretPathFilter:String}");
        params.secretPathFilter = arg.secretPath;
      }

      if (arg.secretKey) {
        // Match secretKey at top level in eventMetadata OR inside the eventMetadata.secrets[] array.
        // The top-level check covers single-secret events, e.g.:
        //   { "secretKey": "MY_SECRET", "environment": "prod", ... }
        // The arrayExists check covers batch/multi-secret events, e.g.:
        //   { "secrets": [{ "secretKey": "MY_SECRET" }, { "secretKey": "OTHER" }], ... }
        conditions.push(
          `(${[
            "eventMetadata.secretKey = {secretKeyFilter:String}",
            "arrayExists(x -> x.secretKey = {secretKeyFilter:String}, CAST(eventMetadata.secrets AS Array(JSON)))"
          ].join(" OR ")})`
        );
        params.secretKeyFilter = arg.secretKey;
      }
    }

    const whereClause = conditions.join(" AND ");
    const query = `
      SELECT *
      FROM ${tableName}
      WHERE ${whereClause}
      ORDER BY createdAt DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `;

    params.limit = arg.limit ?? 20;
    params.offset = arg.offset ?? 0;

    try {
      const result = await clickhouseClient.query({
        query,
        query_params: params,
        format: "JSONEachRow"
      });

      const rows = await result.json<TClickHouseAuditLogRow>();

      // Batch-fetch project names from Postgres for any results that have a projectId
      const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))];
      let projectNameMap: Record<string, string> = {};

      if (projectIds.length > 0) {
        const projects = await db(TableName.Project).whereIn("id", projectIds).select("id", "name");
        projectNameMap = Object.fromEntries(projects.map((p: { id: string; name: string }) => [p.id, p.name]));
      }

      return rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        actorMetadata: row.actorMetadata as TAuditLogs["actorMetadata"],
        ipAddress: row.ipAddress || null,
        eventType: row.eventType,
        eventMetadata: (row.eventMetadata || null) as TAuditLogs["eventMetadata"],
        userAgent: row.userAgent || null,
        userAgentType: row.userAgentType || null,
        createdAt: new Date(row.createdAt),
        orgId: row.orgId || null,
        projectId: row.projectId || null,
        projectName: projectNameMap[row.projectId] ?? null,
        expiresAt: null
      })) as TAuditLogWithProjectName[];
    } catch (error) {
      logger.error(error, "Failed to query audit logs from ClickHouse");
      throw new DatabaseError({ error });
    }
  };

  return { find };
};
