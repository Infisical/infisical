import { Knex } from "knex";

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
import { buildScope, computeSummary, createEmptyResult, formatTimeAgo } from "./resolver-helpers";

export const secretSyncResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, limit = 50, offset = 0, status } = params;

    const baseQuery = db
      .replicaNode()(TableName.SecretSync)
      .join(TableName.Project, `${TableName.SecretSync}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId);

    if (projectId) {
      void baseQuery.andWhere(`${TableName.SecretSync}.projectId`, projectId);
    }

    const allItems: TObservabilityWidgetItem[] = [];

    const syncs = await baseQuery
      .clone()
      .select(
        `${TableName.SecretSync}.id`,
        `${TableName.SecretSync}.name`,
        `${TableName.SecretSync}.syncStatus`,
        `${TableName.SecretSync}.lastSyncMessage`,
        `${TableName.SecretSync}.lastSyncedAt`,
        `${TableName.SecretSync}.projectId`,
        `${TableName.SecretSync}.destination`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`
      );

    for (const sync of syncs) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      if (sync.syncStatus === "failed") {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = sync.lastSyncMessage || "Sync failed";
      } else if (sync.syncStatus === "pending") {
        itemStatus = ObservabilityItemStatus.Pending;
        statusTooltip = "Sync is pending";
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: sync.id,
        resourceType: ObservabilityResourceType.SecretSync,
        resourceName: sync.name,
        resourceId: sync.id,
        scope: buildScope({
          type: "project",
          projectName: sync.projectName,
          orgName: sync.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: sync.lastSyncedAt || new Date(),
        resourceLink: `/org/${orgId}/project/${sync.projectId}/integrations/secret-syncs/${sync.id}`,
        metadata: {
          destination: sync.destination,
          lastSyncMessage: sync.lastSyncMessage
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
