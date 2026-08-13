import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TEndpointTransferViolationAlertDALFactory = ReturnType<typeof endpointTransferViolationAlertDALFactory>;

export type TEndpointTransferViolationTarget = {
  eventId: string;
  deviceId: string;
  deviceName: string;
  destination: string | null;
  occurredAt: Date;
  bytesTransferred: number | null;
  thresholdBytes: number | null;
};

// A trip is already recorded as an endpoint event by the time this runs, so the alert reads that
// rather than keeping a second copy of the same fact. It is also what makes the alert survive a
// missed dispatch: the cron sweep finds anything the event-driven enqueue dropped.
export const endpointTransferViolationAlertDALFactory = (db: TDbClient) => {
  const findRecentViolations = async ({
    orgId,
    networkRuleId,
    since,
    limit
  }: {
    orgId: string;
    networkRuleId: string;
    since: Date;
    limit: number;
  }): Promise<TEndpointTransferViolationTarget[]> => {
    try {
      const rows = await db
        .replicaNode()(TableName.EndpointEvent)
        .join(TableName.EndpointDevice, `${TableName.EndpointDevice}.id`, `${TableName.EndpointEvent}.deviceId`)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.EndpointEvent}.projectId`)
        .where(`${TableName.Project}.orgId`, orgId)
        .andWhere(`${TableName.EndpointEvent}.eventType`, "network.transfer_threshold_tripped")
        // Scoped to the rule the alert was created on. A project can have several transfer limits and
        // an admin who set one up does not want mail about the others.
        .andWhere(`${TableName.EndpointEvent}.networkRuleId`, networkRuleId)
        .andWhere(`${TableName.EndpointEvent}.occurredAt`, ">=", since)
        // Newest first: the engine's per-channel cap keeps the head of this list, and the most
        // recent exfiltration is the one worth mailing about if only some fit.
        .orderBy(`${TableName.EndpointEvent}.occurredAt`, "desc")
        .limit(limit)
        .select(
          db.ref("id").withSchema(TableName.EndpointEvent).as("eventId"),
          db.ref("deviceId").withSchema(TableName.EndpointEvent),
          db.ref("destination").withSchema(TableName.EndpointEvent),
          db.ref("occurredAt").withSchema(TableName.EndpointEvent),
          db.ref("detail").withSchema(TableName.EndpointEvent),
          db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName")
        );

      return rows.map((row) => {
        const detail = (row.detail ?? {}) as { bytesTransferred?: number; thresholdBytes?: number };

        return {
          eventId: row.eventId,
          deviceId: row.deviceId,
          deviceName: row.deviceName,
          destination: row.destination,
          occurredAt: row.occurredAt,
          bytesTransferred: detail.bytesTransferred ?? null,
          thresholdBytes: detail.thresholdBytes ?? null
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint transfer violations" });
    }
  };

  // Used at create to refuse an alert bound to a rule from another org, and to refuse binding one to
  // a destination rule, which never trips a threshold and so could never fire.
  const findVolumeRuleInOrg = async ({ networkRuleId, orgId }: { networkRuleId: string; orgId: string }) => {
    try {
      return await db
        .replicaNode()(TableName.EndpointNetworkRule)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.EndpointNetworkRule}.projectId`)
        .where(`${TableName.Project}.orgId`, orgId)
        .andWhere(`${TableName.EndpointNetworkRule}.id`, networkRuleId)
        .select(
          db.ref("id").withSchema(TableName.EndpointNetworkRule),
          db.ref("name").withSchema(TableName.EndpointNetworkRule),
          db.ref("ruleType").withSchema(TableName.EndpointNetworkRule),
          db.ref("projectId").withSchema(TableName.EndpointNetworkRule)
        )
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint volume rule in org" });
    }
  };

  return { findRecentViolations, findVolumeRuleInOrg };
};
