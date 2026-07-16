import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AlarmChannelType } from "@app/services/alarm/alarm-channel-types";
import { AlarmPrincipalType, AlarmRunStatus } from "@app/services/alarm/alarm-types";
import { AuthMode } from "@app/services/auth/auth-type";

const RecipientInputSchema = z.object({
  principalType: z.nativeEnum(AlarmPrincipalType),
  principalId: z.string().min(1)
});

const ChannelInputSchema = z.object({
  channelType: z.nativeEnum(AlarmChannelType),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().optional()
});

const AlarmResponseSchema = z.object({
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
  recipients: z.array(z.object({ principalType: z.string(), principalId: z.string() })),
  channels: z.array(
    z.object({
      id: z.string().uuid(),
      channelType: z.string(),
      config: z.record(z.unknown()),
      enabled: z.boolean(),
      createdAt: z.date(),
      updatedAt: z.date()
    })
  ),
  lastRun: z
    .object({ timestamp: z.date(), status: z.nativeEnum(AlarmRunStatus), error: z.string().nullable() })
    .nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerAlarmRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAlarm",
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
        recipients: z.array(RecipientInputSchema).default([]),
        channels: z.array(ChannelInputSchema).min(1)
      }),
      response: { 200: z.object({ alarm: AlarmResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alarm = await server.services.alarm.createAlarm({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alarm };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAlarms",
      querystring: z.object({
        resourceType: z.string().min(1),
        resourceId: z.string().optional(),
        projectId: z.string().optional(),
        enabled: z.coerce.boolean().optional()
      }),
      response: { 200: z.object({ alarms: AlarmResponseSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alarms = await server.services.alarm.listAlarms({
        ...req.query,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alarms };
    }
  });

  server.route({
    method: "GET",
    url: "/:alarmId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getAlarmById",
      params: z.object({ alarmId: z.string().uuid() }),
      response: { 200: z.object({ alarm: AlarmResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alarm = await server.services.alarm.getAlarmById({
        alarmId: req.params.alarmId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alarm };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:alarmId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAlarm",
      params: z.object({ alarmId: z.string().uuid() }),
      body: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).nullable().optional(),
        condition: z.unknown().optional(),
        filters: z.unknown().optional(),
        enabled: z.boolean().optional(),
        recipients: z.array(RecipientInputSchema).optional(),
        channels: z.array(ChannelInputSchema).min(1).optional()
      }),
      response: { 200: z.object({ alarm: AlarmResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alarm = await server.services.alarm.updateAlarm({
        alarmId: req.params.alarmId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alarm };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:alarmId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAlarm",
      params: z.object({ alarmId: z.string().uuid() }),
      response: { 200: z.object({ alarm: z.object({ id: z.string().uuid() }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const alarm = await server.services.alarm.deleteAlarm({
        alarmId: req.params.alarmId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { alarm };
    }
  });
};
