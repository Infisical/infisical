import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";

import { getSubOrgDescendants } from "./observability-widget-helpers";
import {
  MetricType,
  ObservabilityItemStatus,
  ObservabilityResourceType,
  TNumberMetricsWidgetConfig
} from "./observability-widget-types";
import { createResolverRegistry } from "./resolvers";

export interface TMetricsResolverParams {
  orgId: string;
  subOrgId?: string | null;
  projectId?: string | null;
  config: TNumberMetricsWidgetConfig;
}

export interface TMetricsResolverResult {
  value: number;
  label: string;
  unit?: string;
  link?: string;
}

export type TMetricsResolverFactory = ReturnType<typeof metricsResolverFactory>;

export const metricsResolverFactory = (db: TDbClient) => {
  const resolverRegistry = createResolverRegistry(db);

  const resolveStatusCount = async (params: TMetricsResolverParams): Promise<TMetricsResolverResult> => {
    const { orgId, subOrgId, projectId, config } = params;
    const targetStatus = config.status ?? ObservabilityItemStatus.Failed;
    const resourceTypes =
      config.resourceTypes && config.resourceTypes.length > 0
        ? config.resourceTypes
        : Object.values(ObservabilityResourceType);

    let scopeOrgIds: string[] = [orgId];
    let scopeProjectIds: string[] = projectId ? [projectId] : [];

    if (subOrgId) {
      const descendants = await getSubOrgDescendants(db, subOrgId);
      scopeOrgIds = descendants.orgIds;
      scopeProjectIds = descendants.projectIds;
    }

    let totalCount = 0;

    for (const resourceType of resourceTypes) {
      const resolver = resolverRegistry[resourceType as ObservabilityResourceType];
      if (!resolver) continue;

      const result = await resolver({
        orgId,
        subOrgId,
        projectId,
        eventTypes: [targetStatus],
        scopeOrgIds,
        scopeProjectIds,
        limit: 10000,
        offset: 0
      });

      if (targetStatus === ObservabilityItemStatus.Failed) {
        totalCount += result.summary.failedCount;
      } else if (targetStatus === ObservabilityItemStatus.Pending) {
        totalCount += result.summary.pendingCount;
      } else if (targetStatus === ObservabilityItemStatus.Active) {
        totalCount += result.summary.activeCount;
      } else if (targetStatus === ObservabilityItemStatus.Expired) {
        totalCount += result.summary.expiredCount;
      }
    }

    const statusLabel = targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1);
    const link = projectId
      ? `/project/${projectId}/observability?status=${targetStatus}`
      : `/org/${orgId}/observability?status=${targetStatus}`;

    return {
      value: totalCount,
      label: `${statusLabel} Resources`,
      unit: "resources",
      link
    };
  };

  const resolveExpiringSoon = async (params: TMetricsResolverParams): Promise<TMetricsResolverResult> => {
    const { orgId, subOrgId, projectId, config } = params;
    const thresholdDays = config.thresholdDays ?? 7;
    const resourceTypes =
      config.resourceTypes && config.resourceTypes.length > 0
        ? config.resourceTypes
        : Object.values(ObservabilityResourceType);

    let scopeOrgIds: string[] = [orgId];
    let scopeProjectIds: string[] = projectId ? [projectId] : [];

    if (subOrgId) {
      const descendants = await getSubOrgDescendants(db, subOrgId);
      scopeOrgIds = descendants.orgIds;
      scopeProjectIds = descendants.projectIds;
    }

    let totalCount = 0;

    for (const resourceType of resourceTypes) {
      const resolver = resolverRegistry[resourceType as ObservabilityResourceType];
      if (!resolver) continue;

      const result = await resolver({
        orgId,
        subOrgId,
        projectId,
        eventTypes: ["pending", "active"],
        scopeOrgIds,
        scopeProjectIds,
        thresholds: {
          expirationDays: thresholdDays
        },
        limit: 10000,
        offset: 0
      });

      totalCount += result.summary.pendingCount;
    }

    const link = projectId
      ? `/project/${projectId}/observability?status=pending`
      : `/org/${orgId}/observability?status=pending`;

    return {
      value: totalCount,
      label: `Expiring in ${thresholdDays} Days`,
      unit: "resources",
      link
    };
  };

  const resolveIdentityCount = async (params: TMetricsResolverParams): Promise<TMetricsResolverResult> => {
    const { orgId, subOrgId, projectId, config } = params;
    const identityType = config.identityType ?? "all";

    let scopeProjectIds: string[] = projectId ? [projectId] : [];

    if (subOrgId) {
      const descendants = await getSubOrgDescendants(db, subOrgId);
      scopeProjectIds = descendants.projectIds;
    }

    let userCount = 0;
    let machineCount = 0;

    if (projectId || scopeProjectIds.length > 0) {
      const projectIds = scopeProjectIds.length > 0 ? scopeProjectIds : [projectId as string];

      if (identityType === "user" || identityType === "all") {
        const userResult = await db
          .replicaNode()(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .whereNotNull(`${TableName.Membership}.actorUserId`)
          .whereIn(`${TableName.Membership}.scopeProjectId`, projectIds)
          .countDistinct(`${TableName.Membership}.actorUserId as count`)
          .first();

        userCount = Number(userResult?.count ?? 0);
      }

      if (identityType === "machine" || identityType === "all") {
        const machineResult = await db
          .replicaNode()(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .whereNotNull(`${TableName.Membership}.actorIdentityId`)
          .whereIn(`${TableName.Membership}.scopeProjectId`, projectIds)
          .countDistinct(`${TableName.Membership}.actorIdentityId as count`)
          .first();

        machineCount = Number(machineResult?.count ?? 0);
      }
    } else {
      if (identityType === "user" || identityType === "all") {
        const userResult = await db
          .replicaNode()(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .whereNotNull(`${TableName.Membership}.actorUserId`)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          .where(`${TableName.Membership}.isActive`, true)
          .countDistinct(`${TableName.Membership}.actorUserId as count`)
          .first();

        userCount = Number(userResult?.count ?? 0);
      }

      if (identityType === "machine" || identityType === "all") {
        const machineResult = await db
          .replicaNode()(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .whereNotNull(`${TableName.Membership}.actorIdentityId`)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          .countDistinct(`${TableName.Membership}.actorIdentityId as count`)
          .first();

        machineCount = Number(machineResult?.count ?? 0);
      }
    }

    let value: number;
    let label: string;
    let link: string;

    if (identityType === "user") {
      value = userCount;
      label = "Active Users";
      link = projectId ? `/project/${projectId}/members` : `/org/${orgId}/members`;
    } else if (identityType === "machine") {
      value = machineCount;
      label = "Machine Identities";
      link = projectId ? `/project/${projectId}/identities` : `/org/${orgId}/identities`;
    } else {
      value = userCount + machineCount;
      label = "Total Identities";
      link = projectId ? `/project/${projectId}/members` : `/org/${orgId}/members`;
    }

    return {
      value,
      label,
      unit: identityType === "user" ? "users" : identityType === "machine" ? "identities" : "identities",
      link
    };
  };

  const resolve = async (params: TMetricsResolverParams): Promise<TMetricsResolverResult> => {
    const { config } = params;

    switch (config.metricType) {
      case MetricType.StatusCount:
        return resolveStatusCount(params);
      case MetricType.ExpiringSoon:
        return resolveExpiringSoon(params);
      case MetricType.IdentityCount:
        return resolveIdentityCount(params);
      default:
        throw new Error(`Unknown metric type: ${config.metricType}`);
    }
  };

  return {
    resolve,
    resolveStatusCount,
    resolveExpiringSoon,
    resolveIdentityCount
  };
};
