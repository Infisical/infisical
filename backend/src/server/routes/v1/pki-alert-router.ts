import { z } from "zod";

import { PkiAlertsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPkiAlertRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create PKI alert",
      body: z.object({
        projectId: z.string().trim(),
        pkiCollectionId: z.string().trim(),
        name: z.string().trim(),
        alertBeforeDays: z.number(),
        emails: z.array(z.string())
      }),
      response: {
        200: PkiAlertsSchema
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlert.createPkiAlert({
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
          type: EventType.CREATE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id,
            pkiCollectionId: alert.pkiCollectionId,
            name: alert.name,
            alertBeforeDays: alert.alertBeforeDays,
            recipientEmails: alert.recipientEmails
          }
        }
      });

      return alert;
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
      description: "Get PKI alert",
      params: z.object({
        alertId: z.string().trim()
      }),
      response: {
        200: PkiAlertsSchema
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlert.getPkiAlertById({
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

      return alert;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:alertId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update PKI alert",
      params: z.object({
        alertId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().optional(),
        alertBeforeDays: z.number().optional(),
        pkiCollectionId: z.string().trim().optional(),
        emails: z.array(z.string()).optional()
      }),
      response: {
        200: PkiAlertsSchema
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlert.updatePkiAlert({
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
            pkiCollectionId: alert.pkiCollectionId,
            name: alert.name,
            alertBeforeDays: alert.alertBeforeDays,
            recipientEmails: alert.recipientEmails
          }
        }
      });

      return alert;
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
      description: "Delete PKI alert",
      params: z.object({
        alertId: z.string().trim()
      }),
      response: {
        200: PkiAlertsSchema
      }
    },
    handler: async (req) => {
      const alert = await server.services.pkiAlert.deletePkiAlert({
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

      return alert;
    }
  });
};
