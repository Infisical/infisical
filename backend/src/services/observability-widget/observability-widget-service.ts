import { TDbClient } from "@app/db";
import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import {
  formatActorName,
  formatLogMessage,
  getLogLevel,
  getResourceTypeFromEventType
} from "./live-logs-helpers";
import { metricsResolverFactory } from "./metrics-resolvers";
import { TObservabilityWidgetDALFactory } from "./observability-widget-dal";
import { getSubOrgDescendants } from "./observability-widget-helpers";
import {
  EventsWidgetConfigSchema,
  LiveLogsWidgetConfigSchema,
  NumberMetricsWidgetConfigSchema,
  ObservabilityResourceType,
  ObservabilityWidgetType,
  ORG_ONLY_RESOURCE_TYPES,
  TCreateObservabilityWidgetDTO,
  TEventsWidgetConfig,
  TGetLiveLogsWidgetDataOptions,
  TGetWidgetDataOptions,
  TLiveLogsWidgetConfig,
  TNumberMetricsWidgetConfig,
  TObservabilityLiveLogsResponse,
  TObservabilityLogItem,
  TObservabilityMetricsResponse,
  TObservabilityWidgetDataResponse,
  TObservabilityWidgetItem,
  TResolverResult,
  TUpdateObservabilityWidgetDTO
} from "./observability-widget-types";
import { createResolverRegistry, TResolverRegistry } from "./resolvers";

export type TObservabilityWidgetServiceFactory = ReturnType<typeof observabilityWidgetServiceFactory>;

type TObservabilityWidgetServiceFactoryDep = {
  observabilityWidgetDAL: TObservabilityWidgetDALFactory;
  auditLogDAL: TAuditLogDALFactory;
  db: TDbClient;
};

export const observabilityWidgetServiceFactory = ({
  observabilityWidgetDAL,
  auditLogDAL,
  db
}: TObservabilityWidgetServiceFactoryDep) => {
  const resolverRegistry: TResolverRegistry = createResolverRegistry(db);
  const metricsResolver = metricsResolverFactory(db);

  const createWidget = async (dto: TCreateObservabilityWidgetDTO) => {
    if (dto.type === ObservabilityWidgetType.Events) {
      const parseResult = EventsWidgetConfigSchema.safeParse(dto.config);
      if (!parseResult.success) {
        throw new BadRequestError({ message: "Invalid events widget config" });
      }

      if (dto.projectId) {
        const eventsConfig = dto.config as TEventsWidgetConfig;
        const invalidTypes = eventsConfig.resourceTypes.filter((rt) =>
          ORG_ONLY_RESOURCE_TYPES.includes(rt)
        );
        if (invalidTypes.length > 0) {
          throw new BadRequestError({
            message: `Resource types [${invalidTypes.join(", ")}] are org-level only and cannot be used in project-scoped widgets`
          });
        }
      }
    }

    const widget = await observabilityWidgetDAL.create({
      name: dto.name,
      description: dto.description,
      orgId: dto.orgId,
      subOrgId: dto.subOrgId,
      projectId: dto.projectId,
      type: dto.type,
      config: dto.config,
      refreshInterval: dto.refreshInterval ?? 30,
      icon: dto.icon,
      color: dto.color
    });

    return widget;
  };

  const getWidget = async (widgetId: string) => {
    const widget = await observabilityWidgetDAL.findById(widgetId);
    if (!widget) {
      throw new NotFoundError({ message: "Widget not found" });
    }
    return widget;
  };

  const listWidgets = async (orgId: string, projectId?: string) => {
    if (projectId) {
      return observabilityWidgetDAL.findByOrgIdAndProjectId(orgId, projectId);
    }
    return observabilityWidgetDAL.findByOrgId(orgId);
  };

  const updateWidget = async (widgetId: string, dto: TUpdateObservabilityWidgetDTO) => {
    const existingWidget = await observabilityWidgetDAL.findById(widgetId);
    if (!existingWidget) {
      throw new NotFoundError({ message: "Widget not found" });
    }

    if (dto.config && existingWidget.type === ObservabilityWidgetType.Events) {
      const parseResult = EventsWidgetConfigSchema.safeParse(dto.config);
      if (!parseResult.success) {
        throw new BadRequestError({ message: "Invalid events widget config" });
      }

      if (existingWidget.projectId) {
        const eventsConfig = dto.config as TEventsWidgetConfig;
        const invalidTypes = eventsConfig.resourceTypes.filter((rt) =>
          ORG_ONLY_RESOURCE_TYPES.includes(rt)
        );
        if (invalidTypes.length > 0) {
          throw new BadRequestError({
            message: `Resource types [${invalidTypes.join(", ")}] are org-level only and cannot be used in project-scoped widgets`
          });
        }
      }
    }

    const updatedWidget = await observabilityWidgetDAL.updateById(widgetId, {
      name: dto.name,
      description: dto.description,
      config: dto.config,
      refreshInterval: dto.refreshInterval,
      icon: dto.icon,
      color: dto.color
    });

    return updatedWidget;
  };

  const deleteWidget = async (widgetId: string) => {
    const widget = await observabilityWidgetDAL.findById(widgetId);
    if (!widget) {
      throw new NotFoundError({ message: "Widget not found" });
    }

    await observabilityWidgetDAL.deleteById(widgetId);
  };

  const getWidgetData = async (
    widgetId: string,
    options?: TGetWidgetDataOptions
  ): Promise<TObservabilityWidgetDataResponse> => {
    const widget = await observabilityWidgetDAL.findById(widgetId);
    if (!widget) {
      throw new NotFoundError({ message: "Widget not found" });
    }

    if (widget.type !== ObservabilityWidgetType.Events) {
      throw new BadRequestError({ message: "Only events widget type is supported for data retrieval" });
    }

    const config = widget.config as TEventsWidgetConfig;
    const resourceTypes =
      config.resourceTypes && config.resourceTypes.length > 0
        ? config.resourceTypes
        : Object.values(ObservabilityResourceType);

    let scopeOrgIds: string[] = [widget.orgId];
    let scopeProjectIds: string[] = widget.projectId ? [widget.projectId] : [];

    if (widget.subOrgId) {
      const descendants = await getSubOrgDescendants(db, widget.subOrgId);
      scopeOrgIds = descendants.orgIds;
      scopeProjectIds = descendants.projectIds;
    }

    const allItems: TObservabilityWidgetItem[] = [];
    let totalFailedCount = 0;
    let totalPendingCount = 0;
    let totalActiveCount = 0;
    let totalExpiredCount = 0;

    for (const resourceType of resourceTypes) {
      const resolver = resolverRegistry[resourceType as ObservabilityResourceType];
      if (!resolver) continue;

      const result: TResolverResult = await resolver({
        orgId: widget.orgId,
        subOrgId: widget.subOrgId,
        projectId: widget.projectId,
        eventTypes: config.eventTypes,
        scopeOrgIds,
        scopeProjectIds,
        thresholds: config.thresholds,
        limit: 1000,
        offset: 0
      });

      allItems.push(...result.items);
      totalFailedCount += result.summary.failedCount;
      totalPendingCount += result.summary.pendingCount;
      totalActiveCount += result.summary.activeCount;
      totalExpiredCount += result.summary.expiredCount;
    }

    let filteredItems = allItems;
    if (options?.status) {
      filteredItems = allItems.filter((item) => item.status === options.status);
    }

    filteredItems.sort((a, b) => new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime());

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    return {
      widget: {
        id: widget.id,
        name: widget.name,
        description: widget.description,
        type: widget.type as ObservabilityWidgetType,
        refreshInterval: widget.refreshInterval,
        icon: widget.icon,
        color: widget.color
      },
      items: paginatedItems,
      totalCount: filteredItems.length,
      summary: {
        failedCount: totalFailedCount,
        pendingCount: totalPendingCount,
        activeCount: totalActiveCount,
        expiredCount: totalExpiredCount
      }
    };
  };

  const getLiveLogsWidgetData = async (
    widgetId: string,
    options?: TGetLiveLogsWidgetDataOptions
  ): Promise<TObservabilityLiveLogsResponse> => {
    const widget = await observabilityWidgetDAL.findById(widgetId);
    if (!widget) {
      throw new NotFoundError({ message: "Widget not found" });
    }

    if (widget.type !== ObservabilityWidgetType.Logs) {
      throw new BadRequestError({ message: "Only logs widget type is supported for live logs data retrieval" });
    }

    const configParseResult = LiveLogsWidgetConfigSchema.safeParse(widget.config);
    const config: TLiveLogsWidgetConfig = configParseResult.success
      ? configParseResult.data
      : { limit: 300 };

    const limit = options?.limit ?? config.limit;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let scopeProjectIds: string[] = widget.projectId ? [widget.projectId] : [];

    if (widget.subOrgId) {
      const descendants = await getSubOrgDescendants(db, widget.subOrgId);
      scopeProjectIds = descendants.projectIds;
    }

    const auditLogs = await auditLogDAL.find({
      orgId: widget.orgId,
      projectId: widget.projectId ?? undefined,
      startDate: oneDayAgo.toISOString(),
      endDate: now.toISOString(),
      limit,
      offset: 0
    });

    const items: TObservabilityLogItem[] = auditLogs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt,
      level: getLogLevel(log.eventType),
      resourceType: getResourceTypeFromEventType(log.eventType),
      actor: formatActorName(log.actor, log.actorMetadata),
      message: formatLogMessage(log.eventType, log.actorMetadata, log.eventMetadata),
      metadata: {
        eventType: log.eventType,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        userAgentType: log.userAgentType,
        projectId: log.projectId,
        projectName: log.projectName,
        actorMetadata: log.actorMetadata,
        eventMetadata: log.eventMetadata
      }
    }));

    const auditLogLink = widget.projectId
      ? `/project/${widget.projectId}/audit-logs`
      : `/org/${widget.orgId}/audit-logs`;

    return {
      widget: {
        id: widget.id,
        name: widget.name,
        description: widget.description,
        type: widget.type as ObservabilityWidgetType,
        refreshInterval: widget.refreshInterval,
        icon: widget.icon,
        color: widget.color
      },
      items,
      totalCount: items.length,
      infoText: `Showing the last ${limit} log entries`,
      auditLogLink
    };
  };

  const getMetricsWidgetData = async (widgetId: string): Promise<TObservabilityMetricsResponse> => {
    const widget = await observabilityWidgetDAL.findById(widgetId);
    if (!widget) {
      throw new NotFoundError({ message: "Widget not found" });
    }

    if (widget.type !== ObservabilityWidgetType.Metrics) {
      throw new BadRequestError({ message: "Only metrics widget type is supported for metrics data retrieval" });
    }

    const configParseResult = NumberMetricsWidgetConfigSchema.safeParse(widget.config);
    if (!configParseResult.success) {
      throw new BadRequestError({ message: "Invalid metrics widget configuration" });
    }

    const config: TNumberMetricsWidgetConfig = configParseResult.data;

    const result = await metricsResolver.resolve({
      orgId: widget.orgId,
      subOrgId: widget.subOrgId,
      projectId: widget.projectId,
      config
    });

    return {
      widget: {
        id: widget.id,
        name: widget.name,
        description: widget.description,
        type: widget.type as ObservabilityWidgetType,
        refreshInterval: widget.refreshInterval,
        icon: widget.icon,
        color: widget.color
      },
      value: result.value,
      label: result.label,
      unit: result.unit,
      link: result.link
    };
  };

  return {
    createWidget,
    getWidget,
    listWidgets,
    updateWidget,
    deleteWidget,
    getWidgetData,
    getLiveLogsWidgetData,
    getMetricsWidgetData
  };
};
