import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

import {
  eventTypesToStatusSet,
  ObservabilityItemStatus,
  ObservabilityResourceType,
  TObservabilityWidgetItem,
  TResolverParams,
  TResolverResult
} from "../observability-widget-types";
import {
  buildScope,
  computeSummary,
  DEFAULT_HEARTBEAT_THRESHOLD_MINUTES,
  formatTimeAgo,
  getHeartbeatThresholdDate
} from "./resolver-helpers";

export const relayResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const heartbeatMinutes = thresholds?.heartbeatMinutes ?? DEFAULT_HEARTBEAT_THRESHOLD_MINUTES;
    const heartbeatThreshold = getHeartbeatThresholdDate(heartbeatMinutes);

    const relays = await db
      .replicaNode()(TableName.Relay)
      .leftJoin(TableName.Organization, `${TableName.Relay}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Relay}.orgId`, orgId)
      .select(
        `${TableName.Relay}.id`,
        `${TableName.Relay}.name`,
        `${TableName.Relay}.host`,
        `${TableName.Relay}.heartbeat`,
        `${TableName.Relay}.updatedAt`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const relay of relays) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      if (!relay.heartbeat || new Date(relay.heartbeat) < heartbeatThreshold) {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = relay.heartbeat
          ? `No heartbeat for ${formatTimeAgo(new Date(relay.heartbeat))}`
          : "No heartbeat recorded";
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: relay.id,
        resourceType: ObservabilityResourceType.Relay,
        resourceName: relay.name,
        resourceId: relay.id,
        scope: buildScope({
          type: "org",
          orgName: relay.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: relay.heartbeat || relay.updatedAt,
        resourceLink: `/org/${orgId}/settings/relay`,
        metadata: {
          host: relay.host,
          lastHeartbeat: relay.heartbeat
        }
      });
    }

    const summary = computeSummary(allItems);

    const statusSet = eventTypesToStatusSet(eventTypes);
    let filteredItems = allItems.filter((item) => statusSet.has(item.status));

    if (status) {
      filteredItems = filteredItems.filter((item) => item.status === status);
    }

    const paginatedItems = filteredItems.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      totalCount: filteredItems.length,
      summary
    };
  };
};
