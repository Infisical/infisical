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

export const secretRotationResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const expirationDays = thresholds?.expirationDays ?? DEFAULT_EXPIRATION_THRESHOLD_DAYS;
    const thresholdDate = getThresholdDate(expirationDays);

    const baseQuery = db
      .replicaNode()(TableName.SecretRotationV2)
      .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId);

    if (projectId) {
      void baseQuery.andWhere(`${TableName.Project}.id`, projectId);
    }

    const rotations = await baseQuery
      .clone()
      .select(
        `${TableName.SecretRotationV2}.id`,
        `${TableName.SecretRotationV2}.name`,
        `${TableName.SecretRotationV2}.rotationStatus`,
        `${TableName.SecretRotationV2}.nextRotationAt`,
        `${TableName.SecretRotationV2}.lastRotatedAt`,
        `${TableName.SecretRotationV2}.type`,
        `${TableName.Project}.id as projectId`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`,
        `${TableName.Environment}.slug as envSlug`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const rotation of rotations) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;

      if (rotation.rotationStatus === "failed") {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = "Rotation failed";
      } else if (rotation.nextRotationAt && new Date(rotation.nextRotationAt) < thresholdDate) {
        itemStatus = ObservabilityItemStatus.Pending;
        statusTooltip = formatExpiresAt(new Date(rotation.nextRotationAt));
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: rotation.id,
        resourceType: ObservabilityResourceType.SecretRotation,
        resourceName: rotation.name,
        resourceId: rotation.id,
        scope: buildScope({
          type: "project",
          projectName: rotation.projectName,
          orgName: rotation.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: rotation.lastRotatedAt || new Date(),
        resourceLink: `/org/${orgId}/project/${rotation.projectId}/secret-rotation/${rotation.id}`,
        metadata: {
          rotationType: rotation.type,
          nextRotationAt: rotation.nextRotationAt,
          environment: rotation.envSlug
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
