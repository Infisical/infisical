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
  DEFAULT_EXPIRATION_THRESHOLD_DAYS,
  formatExpiresAt,
  getThresholdDate
} from "./resolver-helpers";

export const serviceTokenResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const expirationDays = thresholds?.expirationDays ?? DEFAULT_EXPIRATION_THRESHOLD_DAYS;
    const thresholdDate = getThresholdDate(expirationDays);
    const now = new Date();

    const baseQuery = db
      .replicaNode()(TableName.ServiceToken)
      .join(TableName.Project, `${TableName.ServiceToken}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId);

    if (projectId) {
      void baseQuery.andWhere(`${TableName.ServiceToken}.projectId`, projectId);
    }

    const tokens = await baseQuery
      .clone()
      .select(
        `${TableName.ServiceToken}.id`,
        `${TableName.ServiceToken}.name`,
        `${TableName.ServiceToken}.expiresAt`,
        `${TableName.ServiceToken}.lastUsed`,
        `${TableName.ServiceToken}.projectId`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const token of tokens) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      if (token.expiresAt) {
        const expiresAt = new Date(token.expiresAt);
        if (expiresAt < now) {
          itemStatus = ObservabilityItemStatus.Expired;
          statusTooltip = "Token expired";
        } else if (expiresAt < thresholdDate) {
          itemStatus = ObservabilityItemStatus.Pending;
          statusTooltip = formatExpiresAt(expiresAt);
        } else {
          itemStatus = ObservabilityItemStatus.Active;
          statusTooltip = null;
        }
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: token.id,
        resourceType: ObservabilityResourceType.ServiceToken,
        resourceName: token.name,
        resourceId: token.id,
        scope: buildScope({
          type: "project",
          projectName: token.projectName,
          orgName: token.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: token.lastUsed || new Date(),
        resourceLink: `/org/${orgId}/project/${token.projectId}/settings/service-tokens`,
        metadata: {
          expiresAt: token.expiresAt,
          lastUsed: token.lastUsed
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
