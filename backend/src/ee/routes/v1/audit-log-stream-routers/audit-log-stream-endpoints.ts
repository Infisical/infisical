import { z } from "zod";

import { LogProvider, StreamMode } from "@app/ee/services/audit-log-stream/audit-log-stream-enums";
import { TAuditLogStream } from "@app/ee/services/audit-log-stream/audit-log-stream-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerAuditLogStreamEndpoints = <T extends TAuditLogStream>({
  server,
  provider,
  createSchema,
  updateSchema,
  sanitizedResponseSchema
}: {
  server: FastifyZodProvider;
  provider: LogProvider;
  createSchema: z.ZodType<{
    credentials: T["credentials"];
  }>;
  updateSchema: z.ZodType<{
    credentials: T["credentials"];
    streamMode?: StreamMode;
  }>;
  sanitizedResponseSchema: z.ZodTypeAny;
}) => {
  server.route({
    method: "GET",
    url: "/:logStreamId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        logStreamId: z.string().uuid()
      }),
      response: {
        200: z.object({
          auditLogStream: sanitizedResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { logStreamId } = req.params;

      const auditLogStream = await server.services.auditLogStream.getById(logStreamId, provider, req.permission);

      return { auditLogStream };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: createSchema,
      response: {
        200: z.object({
          auditLogStream: sanitizedResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { credentials } = req.body;

      const auditLogStream = await server.services.auditLogStream.create(
        {
          provider,
          credentials
        },
        req.permission
      );

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AuditLogStreamCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { streamId: auditLogStream.id, destinationType: provider }
        })
        .catch(() => {});

      return { auditLogStream };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:logStreamId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        logStreamId: z.string().uuid()
      }),
      body: updateSchema,
      response: {
        200: z.object({
          auditLogStream: sanitizedResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { logStreamId } = req.params;
      const { credentials, streamMode } = req.body;

      const auditLogStream = await server.services.auditLogStream.updateById(
        {
          logStreamId,
          provider,
          credentials,
          streamMode
        },
        req.permission
      );

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AuditLogStreamUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { streamId: auditLogStream.id, destinationType: provider }
        })
        .catch(() => {});

      return { auditLogStream };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:logStreamId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        logStreamId: z.string().uuid()
      }),
      response: {
        200: z.object({
          auditLogStream: sanitizedResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { logStreamId } = req.params;

      const auditLogStream = await server.services.auditLogStream.deleteById(logStreamId, provider, req.permission);

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AuditLogStreamDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { streamId: auditLogStream.id, destinationType: provider }
        })
        .catch(() => {});

      return { auditLogStream };
    }
  });
};
