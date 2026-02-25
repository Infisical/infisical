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

export const pamSessionResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const expirationDays = thresholds?.expirationDays ?? DEFAULT_EXPIRATION_THRESHOLD_DAYS;
    const thresholdDate = getThresholdDate(expirationDays);
    const now = new Date();

    const baseQuery = db
      .replicaNode()(TableName.PamSession)
      .join(TableName.Project, `${TableName.PamSession}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId);

    if (projectId) {
      void baseQuery.andWhere(`${TableName.PamSession}.projectId`, projectId);
    }

    const sessions = await baseQuery
      .clone()
      .select(
        `${TableName.PamSession}.id`,
        `${TableName.PamSession}.resourceName`,
        `${TableName.PamSession}.accountName`,
        `${TableName.PamSession}.status`,
        `${TableName.PamSession}.expiresAt`,
        `${TableName.PamSession}.startedAt`,
        `${TableName.PamSession}.actorName`,
        `${TableName.PamSession}.actorEmail`,
        `${TableName.PamSession}.resourceType`,
        `${TableName.PamSession}.projectId`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const session of sessions) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;
      const expiresAt = new Date(session.expiresAt);

      if (expiresAt < now) {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = "Session expired";
      } else if (expiresAt < thresholdDate) {
        itemStatus = ObservabilityItemStatus.Pending;
        statusTooltip = formatExpiresAt(expiresAt);
      } else if (session.status === "active") {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: session.id,
        resourceType: ObservabilityResourceType.PamSession,
        resourceName: `${session.resourceName} - ${session.accountName}`,
        resourceId: session.id,
        scope: buildScope({
          type: "project",
          projectName: session.projectName,
          orgName: session.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: session.startedAt || new Date(),
        resourceLink: `/org/${orgId}/project/${session.projectId}/pam/sessions/${session.id}`,
        metadata: {
          actorName: session.actorName,
          actorEmail: session.actorEmail,
          pamResourceType: session.resourceType,
          expiresAt: session.expiresAt,
          sessionStatus: session.status
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
