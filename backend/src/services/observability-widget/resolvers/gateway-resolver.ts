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

export const gatewayResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const heartbeatMinutes = thresholds?.heartbeatMinutes ?? DEFAULT_HEARTBEAT_THRESHOLD_MINUTES;
    const heartbeatThreshold = getHeartbeatThresholdDate(heartbeatMinutes);

    const gateways = await db
      .replicaNode()(TableName.GatewayV2)
      .join(TableName.Organization, `${TableName.GatewayV2}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.GatewayV2}.orgId`, orgId)
      .select(
        `${TableName.GatewayV2}.id`,
        `${TableName.GatewayV2}.name`,
        `${TableName.GatewayV2}.heartbeat`,
        `${TableName.GatewayV2}.updatedAt`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const gateway of gateways) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      if (!gateway.heartbeat || new Date(gateway.heartbeat) < heartbeatThreshold) {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = gateway.heartbeat
          ? `No heartbeat for ${formatTimeAgo(new Date(gateway.heartbeat))}`
          : "No heartbeat recorded";
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: gateway.id,
        resourceType: ObservabilityResourceType.Gateway,
        resourceName: gateway.name,
        resourceId: gateway.id,
        scope: buildScope({
          type: "org",
          orgName: gateway.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: gateway.heartbeat || gateway.updatedAt,
        resourceLink: `/organizations/${orgId}/networking?selectedTab=gateways`,
        metadata: {
          lastHeartbeat: gateway.heartbeat
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
