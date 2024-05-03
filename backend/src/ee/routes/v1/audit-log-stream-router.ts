import { z } from "zod";

import { AUDIT_LOG_STREAMS } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedAuditLogStreamSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAuditLogStreamRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Create an Audit Log Stream.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        url: z.string().min(1).describe(AUDIT_LOG_STREAMS.CREATE.url),
        headers: z
          .object({
            key: z.string().min(1).trim().describe(AUDIT_LOG_STREAMS.CREATE.headers.key),
            value: z.string().min(1).trim().describe(AUDIT_LOG_STREAMS.CREATE.headers.value)
          })
          .describe(AUDIT_LOG_STREAMS.CREATE.headers.desc)
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          auditLogStream: SanitizedAuditLogStreamSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogStream = await server.services.auditLogStream.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        url: req.body.url,
        headers: req.body.headers
      });

      return { auditLogStream };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Update an Audit Log Stream by ID.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().describe(AUDIT_LOG_STREAMS.UPDATE.id)
      }),
      body: z.object({
        url: z.string().optional().describe(AUDIT_LOG_STREAMS.UPDATE.url),
        headers: z
          .object({
            key: z.string().min(1).trim().describe(AUDIT_LOG_STREAMS.UPDATE.headers.key),
            value: z.string().min(1).trim().describe(AUDIT_LOG_STREAMS.UPDATE.headers.value)
          })
          .describe(AUDIT_LOG_STREAMS.UPDATE.headers.desc)
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          auditLogStream: SanitizedAuditLogStreamSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogStream = await server.services.auditLogStream.updateById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        id: req.params.id,
        url: req.body.url,
        headers: req.body.headers
      });

      return { auditLogStream };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Delete an Audit Log Stream by ID.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().describe(AUDIT_LOG_STREAMS.DELETE.id)
      }),
      response: {
        200: z.object({
          auditLogStream: SanitizedAuditLogStreamSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogStream = await server.services.auditLogStream.deleteById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        id: req.params.id
      });

      return { auditLogStream };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get an Audit Log Stream by ID.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().describe(AUDIT_LOG_STREAMS.GET_BY_ID.id)
      }),
      response: {
        200: z.object({
          auditLogStream: SanitizedAuditLogStreamSchema.extend({
            headers: z
              .object({
                key: z.string(),
                value: z.string()
              })
              .array()
              .optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogStream = await server.services.auditLogStream.getById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        id: req.params.id
      });

      return { auditLogStream };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List Audit Log Streams.",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          auditLogStreams: SanitizedAuditLogStreamSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogStreams = await server.services.auditLogStream.list({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      return { auditLogStreams };
    }
  });
};
