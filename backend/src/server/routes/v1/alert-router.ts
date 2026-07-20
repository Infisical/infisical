import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const AlertResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  eventType: z.string(),
  condition: z.unknown().nullable(),
  filters: z.unknown().nullable(),
  enabled: z.boolean(),
  orgId: z.string(),
  projectId: z.string().nullable(),
  channels: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      channelType: z.string(),
      directed: z.boolean(),
      enabled: z.boolean()
    })
  ),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerAlertRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAlert",
      body: z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        resourceType: z.string().min(1),
        resourceId: z.string().nullable().optional(),
        eventType: z.string().min(1),
        condition: z.unknown().optional(),
        filters: z.unknown().optional(),
        enabled: z.boolean().optional(),
        projectId: z.string().nullable().optional(),
        channelIds: z.array(z.string().uuid()).min(1)
      }),
      response: { 200: z.object({ alert: AlertResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alert = await server.services.alert.createAlert({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alert };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAlerts",
      querystring: z.object({
        resourceType: z.string().min(1),
        resourceId: z.string().optional(),
        projectId: z.string().optional(),
        enabled: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional()
      }),
      response: { 200: z.object({ alerts: AlertResponseSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
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
      params: z.object({ alertId: z.string().uuid() }),
      response: { 200: z.object({ alert: AlertResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
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
      params: z.object({ alertId: z.string().uuid() }),
      body: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).nullable().optional(),
        condition: z.unknown().optional(),
        filters: z.unknown().optional(),
        enabled: z.boolean().optional(),
        channelIds: z.array(z.string().uuid()).min(1).optional()
      }),
      response: { 200: z.object({ alert: AlertResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alert = await server.services.alert.updateAlert({
        alertId: req.params.alertId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alert };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:alertId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAlert",
      params: z.object({ alertId: z.string().uuid() }),
      response: { 200: z.object({ alert: z.object({ id: z.string().uuid() }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alert = await server.services.alert.deleteAlert({
        alertId: req.params.alertId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alert };
    }
  });
};
