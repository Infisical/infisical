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
import { buildScope, computeSummary, formatTimeAgo } from "./resolver-helpers";

export const machineIdentityUsageResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, limit = 50, offset = 0, status } = params;

    const baseQuery = db
      .replicaNode()(TableName.Identity)
      .join(TableName.Organization, `${TableName.Identity}.orgId`, `${TableName.Organization}.id`)
      .leftJoin(TableName.IdentityAccessToken, (qb) => {
        void qb
          .on(`${TableName.Identity}.id`, `${TableName.IdentityAccessToken}.identityId`)
          .andOnVal(`${TableName.IdentityAccessToken}.isAccessTokenRevoked`, false);
      })
      .where(`${TableName.Identity}.orgId`, orgId);

    if (projectId) {
      void baseQuery.whereExists(
        db.replicaNode()(TableName.Membership)
          .whereRaw(`"${TableName.Membership}"."actorIdentityId" = "${TableName.Identity}"."id"`)
          .andWhere(`${TableName.Membership}.scopeProjectId`, projectId)
          .andWhere(`${TableName.Membership}.scope`, "project")
      );
    }

    const identities = await baseQuery
      .groupBy(
        `${TableName.Identity}.id`,
        `${TableName.Identity}.name`,
        `${TableName.Organization}.name`
      )
      .select(
        `${TableName.Identity}.id`,
        `${TableName.Identity}.name`,
        `${TableName.Organization}.name as orgName`
      )
      .max(`${TableName.IdentityAccessToken}.accessTokenLastUsedAt as lastUsedAt`)
      .orderBy("lastUsedAt", "desc");

    const allItems: TObservabilityWidgetItem[] = [];

    for (const identity of identities) {
      allItems.push({
        id: identity.id,
        resourceType: ObservabilityResourceType.MachineIdentityUsage,
        resourceName: identity.name,
        resourceId: identity.id,
        scope: buildScope({
          type: "org",
          orgName: identity.orgName
        }),
        status: ObservabilityItemStatus.Active,
        statusTooltip: null,
        eventTimestamp: identity.lastUsedAt || new Date(0),
        resourceLink: `/organizations/${orgId}/identities/${identity.id}`,
        metadata: {
          lastUsedAt: identity.lastUsedAt
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
