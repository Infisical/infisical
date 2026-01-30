import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  CreatePkiAlertV2Schema,
  createSecureAlertBeforeValidator,
  PkiAlertChannelType,
  PkiAlertEventType,
  PkiFilterRuleSchema,
  UpdatePkiAlertV2Schema
} from "@app/services/pki-alert-v2/pki-alert-v2-types";

export const registerPkiAlertRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "createPkiAlert",
      description: "Create a new PKI alert",
      tags: [ApiDocsTags.PkiAlerting],
      body: CreatePkiAlertV2Schema.extend({
        projectId: z.string().uuid().describe("Project ID")
      }),
      response: {
        200: z.object({
          alert: z.object({
            id: z.string().uuid(),
            name: z.string(),
            description: z.string().nullable(),
            eventType: z.nativeEnum(PkiAlertEventType),
            alertBefore: z.string(),
            filters: z.array(PkiFilterRuleSchema),
            enabled: z.boolean(),
            projectId: z.string().uuid(),
            channels: z.array(
              z.object({
                id: z.string().uuid(),
                channelType: z.nativeEnum(PkiAlertChannelType),
                config: z.record(z.any()),
                enabled: z.boolean(),
                createdAt: z.date(),
                updatedAt: z.date()
              })
            ),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.createAlert({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.CREATE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id,
            name: alert.name,
            eventType: alert.eventType,
            alertBefore: alert.alertBefore
          }
        }
      });

      return { alert };
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
      operationId: "listPkiAlerts",
      description: "List PKI alerts for a project",
      tags: [ApiDocsTags.PkiAlerting],
      querystring: z.object({
        projectId: z.string().uuid(),
        search: z.string().optional(),
        eventType: z.nativeEnum(PkiAlertEventType).optional(),
        enabled: z.coerce.boolean().optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
        offset: z.coerce.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          alerts: z.array(
            z.object({
              id: z.string().uuid(),
              name: z.string(),
              description: z.string().nullable(),
              eventType: z.nativeEnum(PkiAlertEventType),
              alertBefore: z.string(),
              filters: z.array(PkiFilterRuleSchema),
              enabled: z.boolean(),
              channels: z.array(
                z.object({
                  id: z.string().uuid(),
                  channelType: z.nativeEnum(PkiAlertChannelType),
                  config: z.record(z.any()),
                  enabled: z.boolean(),
                  createdAt: z.date(),
                  updatedAt: z.date()
                })
              ),
              lastRun: z
                .object({
                  timestamp: z.date(),
                  status: z.enum(["success", "failed"]),
                  error: z.string().nullable()
                })
                .nullable(),
              createdAt: z.date(),
              updatedAt: z.date()
            })
          ),
          total: z.number()
        })
      }
    },
    handler: async (req) => {
      const alerts = await server.services.pkiAlertV2.listAlerts({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return alerts;
    }
  });

  server.route({
    method: "GET",
    url: "/:alertId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getPkiAlert",
      description: "Get a PKI alert by ID",
      tags: [ApiDocsTags.PkiAlerting],
      params: z.object({
        alertId: z.string().uuid().describe("Alert ID")
      }),
      response: {
        200: z.object({
          alert: z.object({
            id: z.string().uuid(),
            name: z.string(),
            description: z.string().nullable(),
            eventType: z.nativeEnum(PkiAlertEventType),
            alertBefore: z.string(),
            filters: z.array(PkiFilterRuleSchema),
            enabled: z.boolean(),
            projectId: z.string().uuid(),
            channels: z.array(
              z.object({
                id: z.string().uuid(),
                channelType: z.nativeEnum(PkiAlertChannelType),
                config: z.record(z.any()),
                enabled: z.boolean(),
                createdAt: z.date(),
                updatedAt: z.date()
              })
            ),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.getAlertById({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: alert.projectId,
        event: {
          type: EventType.GET_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id
          }
        }
      });

      return { alert };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:alertId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updatePkiAlert",
      description: "Update a PKI alert",
      tags: [ApiDocsTags.PkiAlerting],
      params: z.object({
        alertId: z.string().uuid().describe("Alert ID")
      }),
      body: UpdatePkiAlertV2Schema,
      response: {
        200: z.object({
          alert: z.object({
            id: z.string().uuid(),
            name: z.string(),
            description: z.string().nullable(),
            eventType: z.nativeEnum(PkiAlertEventType),
            alertBefore: z.string(),
            filters: z.array(PkiFilterRuleSchema),
            enabled: z.boolean(),
            projectId: z.string().uuid(),
            channels: z.array(
              z.object({
                id: z.string().uuid(),
                channelType: z.nativeEnum(PkiAlertChannelType),
                config: z.record(z.any()),
                enabled: z.boolean(),
                createdAt: z.date(),
                updatedAt: z.date()
              })
            ),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.updateAlert({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: alert.projectId,
        event: {
          type: EventType.UPDATE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id,
            name: alert.name,
            eventType: alert.eventType,
            alertBefore: alert.alertBefore
          }
        }
      });

      return { alert };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:alertId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "deletePkiAlert",
      description: "Delete a PKI alert",
      tags: [ApiDocsTags.PkiAlerting],
      params: z.object({
        alertId: z.string().uuid().describe("Alert ID")
      }),
      response: {
        200: z.object({
          alert: z.object({
            id: z.string().uuid(),
            name: z.string(),
            description: z.string().nullable(),
            eventType: z.nativeEnum(PkiAlertEventType),
            alertBefore: z.string(),
            filters: z.array(PkiFilterRuleSchema),
            enabled: z.boolean(),
            projectId: z.string().uuid(),
            channels: z.array(
              z.object({
                id: z.string().uuid(),
                channelType: z.nativeEnum(PkiAlertChannelType),
                config: z.record(z.any()),
                enabled: z.boolean(),
                createdAt: z.date(),
                updatedAt: z.date()
              })
            ),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.deleteAlert({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: alert.projectId,
        event: {
          type: EventType.DELETE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id
          }
        }
      });

      return { alert };
    }
  });

  server.route({
    method: "GET",
    url: "/:alertId/certificates",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listPkiAlertCertificates",
      description: "List certificates that match an alert's filter rules",
      tags: [ApiDocsTags.PkiAlerting],
      params: z.object({
        alertId: z.string().uuid().describe("Alert ID")
      }),
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).default(20),
        offset: z.coerce.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          certificates: z.array(
            z.object({
              id: z.string().uuid(),
              serialNumber: z.string(),
              commonName: z.string(),
              san: z.array(z.string()),
              profileName: z.string().nullable(),
              enrollmentType: z.string().nullable(),
              notBefore: z.date(),
              notAfter: z.date(),
              status: z.string()
            })
          ),
          total: z.number()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.pkiAlertV2.listMatchingCertificates({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/preview/certificates",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "previewPkiAlertCertificates",
      description: "Preview certificates that would match the given filter rules",
      tags: [ApiDocsTags.PkiAlerting],
      body: z.object({
        projectId: z.string().uuid().describe("Project ID"),
        filters: z.array(PkiFilterRuleSchema),
        alertBefore: z
          .string()
          .refine(createSecureAlertBeforeValidator(), "Must be in format like '30d', '1w', '3m', '1y'")
          .describe("Alert timing (e.g., '30d', '1w')"),
        limit: z.coerce.number().min(1).max(100).default(20),
        offset: z.coerce.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          certificates: z.array(
            z.object({
              id: z.string().uuid(),
              serialNumber: z.string(),
              commonName: z.string(),
              san: z.array(z.string()),
              profileName: z.string().nullable(),
              enrollmentType: z.string().nullable(),
              notBefore: z.date(),
              notAfter: z.date(),
              status: z.string()
            })
          ),
          total: z.number()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.pkiAlertV2.listCurrentMatchingCertificates({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/test-webhook",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "testPkiAlertWebhook",
      description: "Test a webhook configuration by sending a test payload",
      tags: [ApiDocsTags.PkiAlerting],
      body: z.object({
        projectId: z.string().uuid().describe("Project ID for permission check"),
        url: z.string().url().describe("Webhook URL to test"),
        signingSecret: z.string().max(256).optional().describe("Optional signing secret for HMAC signature")
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          error: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.pkiAlertV2.testWebhookConfig({
        projectId: req.body.projectId,
        url: req.body.url,
        signingSecret: req.body.signingSecret,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return result;
    }
  });
};
