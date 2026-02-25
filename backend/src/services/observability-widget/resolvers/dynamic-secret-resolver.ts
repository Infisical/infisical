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

export const dynamicSecretResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const expirationDays = thresholds?.expirationDays ?? DEFAULT_EXPIRATION_THRESHOLD_DAYS;
    const thresholdDate = getThresholdDate(expirationDays);
    const now = new Date();

    const baseQuery = db
      .replicaNode()(TableName.DynamicSecretLease)
      .join(TableName.DynamicSecret, `${TableName.DynamicSecretLease}.dynamicSecretId`, `${TableName.DynamicSecret}.id`)
      .join(TableName.SecretFolder, `${TableName.DynamicSecret}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId);

    if (projectId) {
      void baseQuery.andWhere(`${TableName.Project}.id`, projectId);
    }

    const leases = await baseQuery
      .clone()
      .select(
        `${TableName.DynamicSecretLease}.id`,
        `${TableName.DynamicSecretLease}.expireAt`,
        `${TableName.DynamicSecretLease}.status`,
        `${TableName.DynamicSecretLease}.statusDetails`,
        `${TableName.DynamicSecretLease}.externalEntityId`,
        `${TableName.DynamicSecret}.name as dynamicSecretName`,
        `${TableName.DynamicSecret}.type as dynamicSecretType`,
        `${TableName.Project}.id as projectId`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`,
        `${TableName.Environment}.slug as envSlug`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const lease of leases) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;
      const expireAt = new Date(lease.expireAt);

      if (lease.status === "failed" || expireAt < now) {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = lease.status === "failed" ? (lease.statusDetails || "Lease failed") : "Lease expired";
      } else if (expireAt < thresholdDate) {
        itemStatus = ObservabilityItemStatus.Pending;
        statusTooltip = formatExpiresAt(expireAt);
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: lease.id,
        resourceType: ObservabilityResourceType.DynamicSecretLease,
        resourceName: `${lease.dynamicSecretName} - ${lease.externalEntityId}`,
        resourceId: lease.id,
        scope: buildScope({
          type: "project",
          projectName: lease.projectName,
          orgName: lease.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: expireAt,
        resourceLink: `/org/${orgId}/project/${lease.projectId}/dynamic-secrets`,
        metadata: {
          dynamicSecretType: lease.dynamicSecretType,
          externalEntityId: lease.externalEntityId,
          environment: lease.envSlug,
          expireAt: lease.expireAt
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
