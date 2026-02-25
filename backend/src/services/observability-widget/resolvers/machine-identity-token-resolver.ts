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
  formatTimeAgo,
  getThresholdDate
} from "./resolver-helpers";

export const machineIdentityTokenResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const expirationDays = thresholds?.expirationDays ?? DEFAULT_EXPIRATION_THRESHOLD_DAYS;
    const thresholdDate = getThresholdDate(expirationDays);
    const now = new Date();

    const baseQuery = db
      .replicaNode()(TableName.IdentityAccessToken)
      .join(TableName.Identity, `${TableName.IdentityAccessToken}.identityId`, `${TableName.Identity}.id`)
      .join(TableName.Organization, `${TableName.Identity}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Identity}.orgId`, orgId)
      .andWhere(`${TableName.IdentityAccessToken}.isAccessTokenRevoked`, false);

    if (projectId) {
      void baseQuery.whereExists(
        db.replicaNode()(TableName.Membership)
          .whereRaw(`"${TableName.Membership}"."actorIdentityId" = "${TableName.Identity}"."id"`)
          .andWhere(`${TableName.Membership}.scopeProjectId`, projectId)
          .andWhere(`${TableName.Membership}.scope`, "project")
      );
    }

    const tokens = await baseQuery
      .clone()
      .select(
        `${TableName.IdentityAccessToken}.id`,
        `${TableName.IdentityAccessToken}.name as tokenName`,
        `${TableName.IdentityAccessToken}.accessTokenTTL`,
        `${TableName.IdentityAccessToken}.accessTokenLastUsedAt`,
        `${TableName.IdentityAccessToken}.createdAt`,
        `${TableName.IdentityAccessToken}.authMethod`,
        `${TableName.IdentityAccessToken}.accessTokenNumUses`,
        `${TableName.IdentityAccessToken}.accessTokenNumUsesLimit`,
        `${TableName.Identity}.id as identityId`,
        `${TableName.Identity}.name as identityName`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const token of tokens) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      const createdAt = new Date(token.createdAt);
      const expiresAt = new Date(createdAt.getTime() + token.accessTokenTTL * 1000);

      if (expiresAt < now) {
        itemStatus = ObservabilityItemStatus.Expired;
        statusTooltip = "Token expired";
      } else if (expiresAt < thresholdDate) {
        itemStatus = ObservabilityItemStatus.Pending;
        statusTooltip = formatExpiresAt(expiresAt);
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        if (token.accessTokenLastUsedAt) {
          statusTooltip = null;
        }
      }

      allItems.push({
        id: token.id,
        resourceType: ObservabilityResourceType.MachineIdentityToken,
        resourceName: token.tokenName || `${token.identityName} token`,
        resourceId: token.id,
        scope: buildScope({
          type: "org",
          orgName: token.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: token.accessTokenLastUsedAt || token.createdAt,
        resourceLink: `/org/${orgId}/identities/${token.identityId}`,
        metadata: {
          identityName: token.identityName,
          authMethod: token.authMethod,
          expiresAt,
          numUses: token.accessTokenNumUses,
          numUsesLimit: token.accessTokenNumUsesLimit
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
