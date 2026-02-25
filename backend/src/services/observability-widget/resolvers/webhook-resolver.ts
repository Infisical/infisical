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
import { buildScope, computeSummary } from "./resolver-helpers";

export const webhookResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, limit = 50, offset = 0, status } = params;

    const baseQuery = db
      .replicaNode()(TableName.Webhook)
      .join(TableName.Environment, `${TableName.Webhook}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId)
      .andWhere(`${TableName.Webhook}.isDisabled`, false);

    if (projectId) {
      void baseQuery.andWhere(`${TableName.Project}.id`, projectId);
    }

    const webhooks = await baseQuery
      .clone()
      .select(
        `${TableName.Webhook}.id`,
        `${TableName.Webhook}.secretPath`,
        `${TableName.Webhook}.lastStatus`,
        `${TableName.Webhook}.lastRunErrorMessage`,
        `${TableName.Webhook}.updatedAt`,
        `${TableName.Webhook}.type`,
        `${TableName.Project}.id as projectId`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`,
        `${TableName.Environment}.slug as envSlug`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const webhook of webhooks) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      if (webhook.lastStatus && webhook.lastStatus !== "200") {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = webhook.lastRunErrorMessage || `HTTP ${webhook.lastStatus}`;
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: webhook.id,
        resourceType: ObservabilityResourceType.Webhook,
        resourceName: `${webhook.envSlug}:${webhook.secretPath}`,
        resourceId: webhook.id,
        scope: buildScope({
          type: "project",
          projectName: webhook.projectName,
          orgName: webhook.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: webhook.updatedAt,
        resourceLink: `/org/${orgId}/project/${webhook.projectId}/settings/webhooks`,
        metadata: {
          secretPath: webhook.secretPath,
          environment: webhook.envSlug,
          webhookType: webhook.type,
          lastStatus: webhook.lastStatus
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
