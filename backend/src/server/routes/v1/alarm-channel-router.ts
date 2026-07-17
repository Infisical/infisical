import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AlarmChannelType } from "@app/services/alarm/alarm-channel-types";
import { AlarmPrincipalType } from "@app/services/alarm/alarm-types";
import { AuthMode } from "@app/services/auth/auth-type";

const RecipientInputSchema = z.object({
  principalType: z.nativeEnum(AlarmPrincipalType),
  principalId: z.string().min(1)
});

const ChannelResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  channelType: z.string(),
  directed: z.boolean(),
  config: z.record(z.unknown()),
  enabled: z.boolean(),
  recipients: z.array(z.object({ principalType: z.string(), principalId: z.string() })),
  usageCount: z.number(),
  orgId: z.string(),
  projectId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerAlarmChannelRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAlarmChannel",
      body: z.object({
        name: z.string().min(1).max(255),
        channelType: z.nativeEnum(AlarmChannelType),
        config: z.record(z.unknown()).default({}),
        enabled: z.boolean().optional(),
        recipients: z.array(RecipientInputSchema).optional(),
        projectId: z.string().nullable().optional()
      }),
      response: { 200: z.object({ channel: ChannelResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const channel = await server.services.alarmChannel.createChannel({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { channel };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAlarmChannels",
      querystring: z.object({ projectId: z.string().optional() }),
      response: { 200: z.object({ channels: ChannelResponseSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const channels = await server.services.alarmChannel.listChannels({
        ...req.query,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { channels };
    }
  });

  server.route({
    method: "GET",
    url: "/:channelId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getAlarmChannelById",
      params: z.object({ channelId: z.string().uuid() }),
      response: { 200: z.object({ channel: ChannelResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const channel = await server.services.alarmChannel.getChannelById({
        channelId: req.params.channelId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { channel };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:channelId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAlarmChannel",
      params: z.object({ channelId: z.string().uuid() }),
      body: z.object({
        name: z.string().min(1).max(255).optional(),
        config: z.record(z.unknown()).optional(),
        enabled: z.boolean().optional(),
        recipients: z.array(RecipientInputSchema).optional()
      }),
      response: { 200: z.object({ channel: ChannelResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const channel = await server.services.alarmChannel.updateChannel({
        channelId: req.params.channelId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { channel };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:channelId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAlarmChannel",
      params: z.object({ channelId: z.string().uuid() }),
      response: { 200: z.object({ channel: z.object({ id: z.string().uuid() }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const channel = await server.services.alarmChannel.deleteChannel({
        channelId: req.params.channelId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { channel };
    }
  });
};
