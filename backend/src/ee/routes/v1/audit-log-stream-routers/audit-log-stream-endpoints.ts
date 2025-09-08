import { z } from "zod";

import { LogProvider } from "@app/ee/services/audit-log-stream/audit-log-stream-enums";
import { TAuditLogStream } from "@app/ee/services/audit-log-stream/audit-log-stream-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
      const { credentials } = req.body;

      const auditLogStream = await server.services.auditLogStream.updateById(
        {
          logStreamId,
          provider,
          credentials
        },
        req.permission
      );

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

      return { auditLogStream };
    }
  });
};
