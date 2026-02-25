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

export const userSessionResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, eventTypes, limit = 50, offset = 0, status } = params;

    const sessions = await db
      .replicaNode()(TableName.AuthTokenSession)
      .join(TableName.Users, `${TableName.AuthTokenSession}.userId`, `${TableName.Users}.id`)
      .join(TableName.Membership, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
      .join(TableName.Organization, `${TableName.Membership}.scopeOrgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Membership}.scopeOrgId`, orgId)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .orderBy(`${TableName.AuthTokenSession}.lastUsed`, "desc")
      .distinct(`${TableName.AuthTokenSession}.id`)
      .select(
        `${TableName.AuthTokenSession}.id`,
        `${TableName.AuthTokenSession}.ip`,
        `${TableName.AuthTokenSession}.userAgent`,
        `${TableName.AuthTokenSession}.lastUsed`,
        `${TableName.AuthTokenSession}.createdAt`,
        `${TableName.Users}.id as odId`,
        `${TableName.Users}.email`,
        `${TableName.Users}.firstName`,
        `${TableName.Users}.lastName`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const session of sessions) {
      const userName = [session.firstName, session.lastName].filter(Boolean).join(" ") || session.email;

      allItems.push({
        id: session.id,
        resourceType: ObservabilityResourceType.UserSession,
        resourceName: userName,
        resourceId: session.id,
        scope: buildScope({
          type: "org",
          orgName: session.orgName
        }),
        status: ObservabilityItemStatus.Active,
        statusTooltip: null,
        eventTimestamp: session.lastUsed,
        resourceLink: `/org/${orgId}/settings/members`,
        metadata: {
          email: session.email,
          ip: session.ip,
          userAgent: session.userAgent,
          lastUsed: session.lastUsed
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
