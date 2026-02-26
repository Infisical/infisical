import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
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
  AuditLogEventCategory,
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

const EVENT_CATEGORY_TO_EVENT_TYPES: Record<string, EventType[]> = {
  [AuditLogEventCategory.SECRETS]: [
    EventType.GET_SECRETS,
    EventType.GET_SECRET,
    EventType.REVEAL_SECRET,
    EventType.CREATE_SECRET,
    EventType.CREATE_SECRETS,
    EventType.UPDATE_SECRET,
    EventType.UPDATE_SECRETS,
    EventType.DELETE_SECRET,
    EventType.DELETE_SECRETS,
    EventType.MOVE_SECRETS
  ],
  [AuditLogEventCategory.INTEGRATIONS]: [
    EventType.AUTHORIZE_INTEGRATION,
    EventType.UPDATE_INTEGRATION_AUTH,
    EventType.UNAUTHORIZE_INTEGRATION,
    EventType.CREATE_INTEGRATION,
    EventType.DELETE_INTEGRATION,
    EventType.MANUAL_SYNC_INTEGRATION
  ],
  [AuditLogEventCategory.IDENTITIES]: [
    EventType.CREATE_IDENTITY,
    EventType.UPDATE_IDENTITY,
    EventType.DELETE_IDENTITY,
    EventType.CREATE_IDENTITY_ORG_MEMBERSHIP,
    EventType.UPDATE_IDENTITY_ORG_MEMBERSHIP,
    EventType.DELETE_IDENTITY_ORG_MEMBERSHIP,
    EventType.CREATE_IDENTITY_PROJECT_MEMBERSHIP,
    EventType.UPDATE_IDENTITY_PROJECT_MEMBERSHIP,
    EventType.DELETE_IDENTITY_PROJECT_MEMBERSHIP
  ],
  [AuditLogEventCategory.PKI]: [
    EventType.GET_CA,
    EventType.CREATE_CA,
    EventType.UPDATE_CA,
    EventType.DELETE_CA,
    EventType.RENEW_CA,
    EventType.GET_CERT,
    EventType.ISSUE_CERT,
    EventType.SIGN_CERT,
    EventType.DELETE_CERT,
    EventType.REVOKE_CERT
  ],
  [AuditLogEventCategory.SSH]: [
    EventType.CREATE_SSH_CA,
    EventType.UPDATE_SSH_CA,
    EventType.DELETE_SSH_CA,
    EventType.GET_SSH_CA,
    EventType.ISSUE_SSH_CREDS
  ],
  [AuditLogEventCategory.KMS]: [
    EventType.CREATE_KMS,
    EventType.UPDATE_KMS,
    EventType.DELETE_KMS,
    EventType.GET_KMS,
    EventType.UPDATE_PROJECT_KMS
  ],
  [AuditLogEventCategory.AUTH]: [
    EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH,
    EventType.LOGIN_IDENTITY_KUBERNETES_AUTH,
    EventType.LOGIN_IDENTITY_OIDC_AUTH,
    EventType.LOGIN_IDENTITY_JWT_AUTH,
    EventType.LOGIN_IDENTITY_GCP_AUTH,
    EventType.LOGIN_IDENTITY_AWS_AUTH,
    EventType.LOGIN_IDENTITY_AZURE_AUTH,
    EventType.LOGIN_IDENTITY_LDAP_AUTH
  ],
  [AuditLogEventCategory.PROJECTS]: [
    EventType.CREATE_ENVIRONMENT,
    EventType.UPDATE_ENVIRONMENT,
    EventType.DELETE_ENVIRONMENT,
    EventType.ADD_PROJECT_MEMBER,
    EventType.REMOVE_PROJECT_MEMBER,
    EventType.CREATE_FOLDER,
    EventType.UPDATE_FOLDER,
    EventType.DELETE_FOLDER
  ],
  [AuditLogEventCategory.ORGANIZATIONS]: [
    EventType.CREATE_SUB_ORGANIZATION,
    EventType.UPDATE_SUB_ORGANIZATION,
    EventType.ADD_TRUSTED_IP,
    EventType.UPDATE_TRUSTED_IP,
    EventType.DELETE_TRUSTED_IP
  ],
  [AuditLogEventCategory.PAM]: [
    EventType.PAM_SESSION_CREDENTIALS_GET,
    EventType.PAM_SESSION_START,
    EventType.PAM_SESSION_LOGS_UPDATE,
    EventType.PAM_SESSION_END,
    EventType.PAM_SESSION_GET,
    EventType.PAM_SESSION_LIST,
    EventType.PAM_FOLDER_CREATE,
    EventType.PAM_FOLDER_UPDATE,
    EventType.PAM_FOLDER_DELETE,
    EventType.PAM_ACCOUNT_LIST,
    EventType.PAM_ACCOUNT_GET,
    EventType.PAM_ACCOUNT_ACCESS,
    EventType.PAM_ACCOUNT_CREATE,
    EventType.PAM_ACCOUNT_UPDATE,
    EventType.PAM_ACCOUNT_DELETE,
    EventType.PAM_ACCOUNT_CREDENTIAL_ROTATION,
    EventType.PAM_ACCOUNT_CREDENTIAL_ROTATION_FAILED,
    EventType.PAM_WEB_ACCESS_SESSION_TICKET_CREATED,
    EventType.PAM_RESOURCE_LIST,
    EventType.PAM_RESOURCE_GET,
    EventType.PAM_RESOURCE_CREATE,
    EventType.PAM_RESOURCE_UPDATE,
    EventType.PAM_RESOURCE_DELETE
  ]
};

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

    const updateData: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      config: dto.config,
      refreshInterval: dto.refreshInterval,
      icon: dto.icon,
      color: dto.color
    };

    if (dto.subOrgId !== undefined) {
      updateData.subOrgId = dto.subOrgId;
    }
    if (dto.projectId !== undefined) {
      updateData.projectId = dto.projectId;
    }

    const updatedWidget = await observabilityWidgetDAL.updateById(widgetId, updateData);

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

    let eventTypeFilter: EventType[] | undefined;
    if (config.eventCategories && config.eventCategories.length > 0) {
      eventTypeFilter = config.eventCategories.flatMap(
        (category) => EVENT_CATEGORY_TO_EVENT_TYPES[category] ?? []
      );
    }

    const auditLogs = await auditLogDAL.find({
      orgId: widget.orgId,
      projectId: widget.projectId ?? undefined,
      startDate: oneDayAgo.toISOString(),
      endDate: now.toISOString(),
      limit,
      offset: 0,
      eventType: eventTypeFilter
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

    let scopeInfo: { type: "org" | "sub-org" | "project"; displayName: string };
    if (widget.projectId) {
      const project = await db.replicaNode()(TableName.Project).where("id", widget.projectId).first();
      scopeInfo = { type: "project", displayName: project?.name ?? "Project" };
    } else if (widget.subOrgId) {
      const subOrg = await db.replicaNode()(TableName.Organization).where("id", widget.subOrgId).first();
      scopeInfo = { type: "sub-org", displayName: subOrg?.name ?? "Sub-Organization" };
    } else {
      const org = await db.replicaNode()(TableName.Organization).where("id", widget.orgId).first();
      scopeInfo = { type: "org", displayName: org?.name ?? "Organization" };
    }

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
      scope: scopeInfo,
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
      // Legacy widget with old config schema — return a zero placeholder so the UI
      // can render without crashing. The widget can be deleted and re-created.
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
        value: 0,
        label: "Unsupported config — please recreate this widget",
        unit: undefined,
        link: undefined
      };
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
