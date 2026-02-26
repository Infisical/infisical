import { z } from "zod";

import { ObservabilityWidgetsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  EventsWidgetConfigSchema,
  LiveLogsWidgetConfigSchema,
  NumberMetricsWidgetConfigSchema,
  ObservabilityItemStatus,
  ObservabilityResourceType,
  ObservabilityWidgetType
} from "@app/services/observability-widget/observability-widget-types";

const ObservabilityWidgetResponseSchema = ObservabilityWidgetsSchema.pick({
  id: true,
  name: true,
  description: true,
  orgId: true,
  subOrgId: true,
  projectId: true,
  type: true,
  refreshInterval: true,
  icon: true,
  color: true,
  createdAt: true,
  updatedAt: true
}).extend({
  config: z.unknown()
});

const ObservabilityWidgetItemSchema = z.object({
  id: z.string(),
  resourceType: z.nativeEnum(ObservabilityResourceType),
  resourceName: z.string(),
  resourceId: z.string(),
  scope: z.object({
    type: z.enum(["org", "sub-org", "project"]),
    displayName: z.string(),
    fullPath: z.string()
  }),
  status: z.nativeEnum(ObservabilityItemStatus),
  statusTooltip: z.string().nullable(),
  eventTimestamp: z.date(),
  resourceLink: z.string(),
  metadata: z.record(z.unknown()).optional()
});

const ObservabilityLogItemSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  level: z.enum(["error", "warn", "info"]),
  resourceType: z.string(),
  actor: z.string(),
  message: z.string(),
  metadata: z.object({
    eventType: z.string(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    userAgentType: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    projectName: z.string().nullable().optional(),
    actorMetadata: z.unknown().optional(),
    eventMetadata: z.unknown().optional()
  })
});

export const registerObservabilityWidgetRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "createObservabilityWidget",
      body: z.object({
        name: z.string().min(1).max(128),
        description: z.string().max(512).optional(),
        orgId: z.string().uuid(),
        subOrgId: z.string().uuid().optional().nullable(),
        projectId: z.string().optional().nullable(),
        type: z.nativeEnum(ObservabilityWidgetType),
        config: z.union([EventsWidgetConfigSchema, LiveLogsWidgetConfigSchema, NumberMetricsWidgetConfigSchema]),
        refreshInterval: z.number().min(5).max(3600).default(30),
        icon: z.string().max(64).optional(),
        color: z.string().max(32).optional()
      }),
      response: {
        201: z.object({
          widget: ObservabilityWidgetResponseSchema
        })
      }
    },
    handler: async (req, res) => {
      const widget = await server.services.observabilityWidget.createWidget(req.body);
      return res.status(201).send({ widget });
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listObservabilityWidgets",
      querystring: z.object({
        orgId: z.string().uuid(),
        projectId: z.string().optional()
      }),
      response: {
        200: z.object({
          widgets: z.array(ObservabilityWidgetResponseSchema)
        })
      }
    },
    handler: async (req) => {
      const widgets = await server.services.observabilityWidget.listWidgets(req.query.orgId, req.query.projectId);
      return { widgets };
    }
  });

  server.route({
    method: "GET",
    url: "/:widgetId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getObservabilityWidget",
      params: z.object({
        widgetId: z.string().uuid()
      }),
      response: {
        200: z.object({
          widget: ObservabilityWidgetResponseSchema
        })
      }
    },
    handler: async (req) => {
      const widget = await server.services.observabilityWidget.getWidget(req.params.widgetId);
      return { widget };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:widgetId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateObservabilityWidget",
      params: z.object({
        widgetId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(512).optional(),
        config: z.union([EventsWidgetConfigSchema, LiveLogsWidgetConfigSchema, NumberMetricsWidgetConfigSchema]).optional(),
        refreshInterval: z.number().min(5).max(3600).optional(),
        icon: z.string().max(64).optional(),
        color: z.string().max(32).optional()
      }),
      response: {
        200: z.object({
          widget: ObservabilityWidgetResponseSchema
        })
      }
    },
    handler: async (req) => {
      const widget = await server.services.observabilityWidget.updateWidget(req.params.widgetId, req.body);
      return { widget };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:widgetId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "deleteObservabilityWidget",
      params: z.object({
        widgetId: z.string().uuid()
      }),
      response: {
        204: z.void()
      }
    },
    handler: async (req, res) => {
      await server.services.observabilityWidget.deleteWidget(req.params.widgetId);
      return res.status(204).send();
    }
  });

  server.route({
    method: "GET",
    url: "/:widgetId/data",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getObservabilityWidgetData",
      params: z.object({
        widgetId: z.string().uuid()
      }),
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
        offset: z.coerce.number().min(0).default(0),
        status: z.nativeEnum(ObservabilityItemStatus).optional()
      }),
      response: {
        200: z.object({
          widget: z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable().optional(),
            type: z.nativeEnum(ObservabilityWidgetType),
            refreshInterval: z.number(),
            icon: z.string().nullable().optional(),
            color: z.string().nullable().optional()
          }),
          items: z.array(ObservabilityWidgetItemSchema),
          totalCount: z.number(),
          summary: z.object({
            failedCount: z.number(),
            pendingCount: z.number(),
            activeCount: z.number(),
            expiredCount: z.number()
          })
        })
      }
    },
    handler: async (req) => {
      const data = await server.services.observabilityWidget.getWidgetData(req.params.widgetId, {
        limit: req.query.limit,
        offset: req.query.offset,
        status: req.query.status
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:widgetId/live-logs",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getObservabilityWidgetLiveLogs",
      params: z.object({
        widgetId: z.string().uuid()
      }),
      querystring: z.object({
        limit: z.coerce.number().min(10).max(300).default(300)
      }),
      response: {
        200: z.object({
          widget: z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable().optional(),
            type: z.nativeEnum(ObservabilityWidgetType),
            refreshInterval: z.number(),
            icon: z.string().nullable().optional(),
            color: z.string().nullable().optional()
          }),
          items: z.array(ObservabilityLogItemSchema),
          totalCount: z.number(),
          infoText: z.string(),
          auditLogLink: z.string()
        })
      }
    },
    handler: async (req) => {
      const data = await server.services.observabilityWidget.getLiveLogsWidgetData(req.params.widgetId, {
        limit: req.query.limit
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:widgetId/metrics",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getObservabilityWidgetMetrics",
      params: z.object({
        widgetId: z.string().uuid()
      }),
      response: {
        200: z.object({
          widget: z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable().optional(),
            type: z.nativeEnum(ObservabilityWidgetType),
            refreshInterval: z.number(),
            icon: z.string().nullable().optional(),
            color: z.string().nullable().optional()
          }),
          value: z.number(),
          label: z.string(),
          unit: z.string().optional(),
          link: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const data = await server.services.observabilityWidget.getMetricsWidgetData(req.params.widgetId);
      return data;
    }
  });
};
