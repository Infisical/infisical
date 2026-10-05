import { FastifyRequest } from "fastify";
import { z } from "zod";

import { ALERTING } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AlertChannelType } from "@app/services/alert/alert-channel-types";
import {
  AlertAuditAction,
  AlertPrincipalType,
  AlertRunStatus,
  AlertTelemetryAction,
  MAX_CHANNELS_PER_ALERT,
  MAX_RECIPIENTS_PER_CHANNEL
} from "@app/services/alert/alert-types";
import { AuthMode } from "@app/services/auth/auth-type";

const ChannelRecipientSchema = z.object({
  principalType: z.nativeEnum(AlertPrincipalType),
  principalId: z.string().trim().min(1).max(255)
});

const CreateChannelInputSchema = z.object({
  name: z.string().min(1).max(255),
  channelType: z.nativeEnum(AlertChannelType),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().optional(),
  recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
});

const UpdateChannelInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  channelType: z.nativeEnum(AlertChannelType),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
});

const AlertResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  eventType: z.string(),
  triggerType: z.string(),
  condition: z.unknown().nullable(),
  enabled: z.boolean(),
  orgId: z.string(),
  projectId: z.string().nullable(),
  resourceName: z.string().nullable().optional(),
  filters: z
    .record(z.array(z.object({ id: z.string(), name: z.string().nullable() })))
    .optional()
    .describe(ALERTING.GET.filters),
  channels: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      channelType: z.string(),
      enabled: z.boolean(),
      config: z.record(z.unknown()),
      recipients: z.array(z.object({ principalType: z.string(), principalId: z.string() }))
    })
  ),
  lastRun: z
    .object({ timestamp: z.date(), status: z.nativeEnum(AlertRunStatus) })
    .nullable()
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerAlertRouter = async (server: FastifyZodProvider) => {
  const $sendAlertTelemetry = async (
    req: FastifyRequest,
    action: AlertTelemetryAction,
    alert: Parameters<typeof server.services.alert.getTelemetryEvent>[1]
  ) => {
    const telemetryEvent = server.services.alert.getTelemetryEvent(action, alert);
    if (!telemetryEvent) return;
    await server.services.telemetry.sendPostHogEvents({
      ...telemetryEvent,
      distinctId: getTelemetryDistinctId(req),
      organizationId: req.permission.orgId
    });
  };

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAlert",
      description: "Create an alert that notifies its channels when an event happens to a resource.",
      body: z.object({
        name: z.string().min(1).max(255).describe(ALERTING.CREATE.name),
        description: z.string().max(1000).optional().describe(ALERTING.CREATE.description),
        resourceType: z.string().min(1).describe(ALERTING.CREATE.resourceType),
        resourceId: z.string().uuid().nullable().optional().describe(ALERTING.CREATE.resourceId),
        eventType: z.string().min(1).describe(ALERTING.CREATE.eventType),
        condition: z.unknown().optional().describe(ALERTING.CREATE.condition),
        enabled: z.boolean().optional().describe(ALERTING.CREATE.enabled),
        projectId: z.string().nullable().optional().describe(ALERTING.CREATE.projectId),
        channels: z
          .array(CreateChannelInputSchema)
          .min(1)
          .max(MAX_CHANNELS_PER_ALERT)
          .describe(ALERTING.CREATE.channels)
      }),
      response: { 200: z.object({ alert: AlertResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const alert = await server.services.alert.createAlert({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        ...(alert.projectId ? { projectId: alert.projectId } : { orgId: alert.orgId }),
        event: server.services.alert.getAuditEvent({ action: AlertAuditAction.Create, alert })
      });

      await $sendAlertTelemetry(req, AlertTelemetryAction.Create, alert);

      return { alert };
    }
  });

  server.route({
    method: "POST",
    url: "/channels/test",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "testAlertChannel",
      description: "Send a test notification through a saved channel or a channel described in the request.",
      body: z.object({
        resourceType: z.string().min(1).describe(ALERTING.TEST_CHANNEL.resourceType),
        resourceId: z.string().uuid().nullable().optional().describe(ALERTING.TEST_CHANNEL.resourceId),
        projectId: z.string().nullable().optional().describe(ALERTING.TEST_CHANNEL.projectId),
        alertId: z.string().uuid().optional().describe(ALERTING.TEST_CHANNEL.alertId),
        channelId: z.string().uuid().optional().describe(ALERTING.TEST_CHANNEL.channelId),
        channelType: z.nativeEnum(AlertChannelType),
        config: z.record(z.unknown()).default({}),
        recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          deliveredTo: z.number().optional(),
          error: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId, resourceName, alertName, channelName, ...result } =
        await server.services.alertChannelTest.testChannel({
          ...req.body,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        ...(projectId ? { projectId } : { orgId: req.permission.orgId }),
        event: server.services.alert.getAuditEvent({
          action: AlertAuditAction.TestChannel,
          test: {
            resourceType: req.body.resourceType,
            resourceId: req.body.resourceId,
            resourceName,
            alertId: req.body.alertId,
            alertName,
            channelId: req.body.channelId,
            channelName,
            channelType: req.body.channelType,
            success: result.success,
            deliveredTo: result.deliveredTo,
            error: result.error
          }
        })
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAlerts",
      description: "List the alerts on a resource type.",
      querystring: z.object({
        resourceType: z.string().min(1).describe(ALERTING.LIST.resourceType),
        resourceId: z.string().uuid().optional().describe(ALERTING.LIST.resourceId),
        projectId: z.string().optional().describe(ALERTING.LIST.projectId),
        enabled: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional()
          .describe(ALERTING.LIST.enabled)
      }),
      response: { 200: z.object({ alerts: AlertResponseSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const alerts = await server.services.alert.listAlerts({
        ...req.query,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alerts };
    }
  });

  server.route({
    method: "GET",
    url: "/:alertId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getAlertById",
      description: "Get an alert by ID.",
      params: z.object({ alertId: z.string().uuid().describe(ALERTING.GET.alertId) }),
      response: { 200: z.object({ alert: AlertResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const alert = await server.services.alert.getAlertById({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alert };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:alertId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAlert",
      description: "Update an alert.",
      params: z.object({ alertId: z.string().uuid().describe(ALERTING.UPDATE.alertId) }),
      body: z.object({
        name: z.string().min(1).max(255).optional().describe(ALERTING.UPDATE.name),
        description: z.string().max(1000).nullable().optional().describe(ALERTING.UPDATE.description),
        condition: z.unknown().optional().describe(ALERTING.UPDATE.condition),
        enabled: z.boolean().optional().describe(ALERTING.UPDATE.enabled),
        channels: z
          .array(UpdateChannelInputSchema)
          .min(1)
          .max(MAX_CHANNELS_PER_ALERT)
          .optional()
          .describe(ALERTING.UPDATE.channels)
      }),
      response: { 200: z.object({ alert: AlertResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const alert = await server.services.alert.updateAlert({
        alertId: req.params.alertId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        ...(alert.projectId ? { projectId: alert.projectId } : { orgId: alert.orgId }),
        event: server.services.alert.getAuditEvent({ action: AlertAuditAction.Update, alert })
      });

      await $sendAlertTelemetry(req, AlertTelemetryAction.Update, alert);

      return { alert };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:alertId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAlert",
      description: "Delete an alert and its channels.",
      params: z.object({ alertId: z.string().uuid().describe(ALERTING.DELETE.alertId) }),
      response: { 200: z.object({ alert: z.object({ id: z.string().uuid() }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const alert = await server.services.alert.deleteAlert({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        ...(alert.projectId ? { projectId: alert.projectId } : { orgId: alert.orgId }),
        event: server.services.alert.getAuditEvent({ action: AlertAuditAction.Delete, alert })
      });

      await $sendAlertTelemetry(req, AlertTelemetryAction.Delete, alert);

      return { alert };
    }
  });
};
