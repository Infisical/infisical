import { z } from "zod";

import { PkiAlertsSchema } from "@app/db/schemas/pki-alerts";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ALERTS, ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";

export const registerDeprecatedPkiAlertRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      tags: [ApiDocsTags.PkiAlerting],
      description: "Create PKI alert",
      body: z.object({
        projectId: z.string().trim().describe(ALERTS.CREATE.projectId),
        pkiCollectionId: z.string().trim().describe(ALERTS.CREATE.pkiCollectionId),
        name: z.string().trim().describe(ALERTS.CREATE.name),
        alertBeforeDays: z.number().describe(ALERTS.CREATE.alertBeforeDays),
        emails: z
          .array(z.string().trim().email({ message: "Invalid email address" }))
          .min(1, { message: "You must specify at least 1 email" })
          .max(5, { message: "You can specify a maximum of 5 emails" })
          .describe(ALERTS.CREATE.emails)
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
            alertBefore: alert.alertBeforeDays.toString(),
            eventType: PkiAlertEventType.EXPIRATION,
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
      tags: [ApiDocsTags.PkiAlerting],
      description: "Get PKI alert",
      params: z.object({
        alertId: z.string().trim().describe(ALERTS.GET.alertId)
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
      tags: [ApiDocsTags.PkiAlerting],
      description: "Update PKI alert",
      params: z.object({
        alertId: z.string().trim().describe(ALERTS.UPDATE.alertId)
      }),
      body: z.object({
        name: z.string().trim().optional().describe(ALERTS.UPDATE.name),
        alertBeforeDays: z.number().optional().describe(ALERTS.UPDATE.alertBeforeDays),
        pkiCollectionId: z.string().trim().optional().describe(ALERTS.UPDATE.pkiCollectionId),
        emails: z
          .array(z.string().trim().email({ message: "Invalid email address" }))
          .min(1, { message: "You must specify at least 1 email" })
          .max(5, { message: "You can specify a maximum of 5 emails" })
          .optional()
          .describe(ALERTS.UPDATE.emails)
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
            alertBefore: alert.alertBeforeDays.toString(),
            eventType: PkiAlertEventType.EXPIRATION,
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
      tags: [ApiDocsTags.PkiAlerting],
      description: "Delete PKI alert",
      params: z.object({
        alertId: z.string().trim().describe(ALERTS.DELETE.alertId)
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
