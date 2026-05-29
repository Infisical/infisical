import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  BasePkiAlertV2Schema,
  PkiAlertEventType,
  PkiAlertV2ResponseSchema,
  UpdatePkiAlertV2Schema
} from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApplicationIdParamsSchema } from "./pki-application-schemas";

export const registerPkiApplicationAlertRoutes = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/alerts",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationAlerts",
      description: "List alerts for an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      querystring: z.object({
        search: z.string().optional(),
        eventType: z.nativeEnum(PkiAlertEventType).optional(),
        enabled: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0)
      }),
      response: {
        200: z.object({
          alerts: z.array(PkiAlertV2ResponseSchema),
          total: z.number().int().nonnegative()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiAlertV2.listAlerts({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        search: req.query.search,
        eventType: req.query.eventType,
        enabled: req.query.enabled,
        limit: req.query.limit,
        offset: req.query.offset
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/alerts",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createPkiApplicationAlert",
      description: "Create an alert on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      body: BasePkiAlertV2Schema,
      response: { 200: z.object({ alert: PkiAlertV2ResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.createAlert({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        applicationId: req.params.applicationId,
        projectId: req.internalCertManagerProjectId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.CREATE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id,
            applicationId: req.params.applicationId,
            name: alert.name,
            alertBefore: alert.alertBefore ?? undefined,
            eventType: alert.eventType
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiAlertCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          applicationId: req.params.applicationId,
          alertType: alert.eventType,
          orgId: req.permission.orgId
        }
      });

      return { alert };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:applicationId/alerts/:alertId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplicationAlert",
      description: "Update an alert on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        alertId: z.string().uuid()
      }),
      body: UpdatePkiAlertV2Schema,
      response: { 200: z.object({ alert: PkiAlertV2ResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.updateAlert({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        applicationId: req.params.applicationId,
        alertId: req.params.alertId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id,
            applicationId: req.params.applicationId,
            name: alert.name,
            alertBefore: alert.alertBefore ?? undefined,
            eventType: alert.eventType
          }
        }
      });

      return { alert };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/alerts/:alertId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deletePkiApplicationAlert",
      description: "Delete an alert from an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        alertId: z.string().uuid()
      }),
      response: { 200: z.object({ alert: PkiAlertV2ResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const alert = await server.services.pkiAlertV2.deleteAlert({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        applicationId: req.params.applicationId,
        alertId: req.params.alertId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.DELETE_PKI_ALERT,
          metadata: {
            pkiAlertId: alert.id,
            applicationId: req.params.applicationId
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiAlertDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          applicationId: req.params.applicationId,
          orgId: req.permission.orgId
        }
      });

      return { alert };
    }
  });
};
