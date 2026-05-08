import { z } from "zod";

import { HoneyTokensSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import {
  HONEY_TOKEN_CREDENTIALS_RESPONSE_SCHEMA_MAP,
  HONEY_TOKEN_REGISTER_ROUTER_MAP
} from "@app/ee/services/honey-token/honey-token-provider-fns";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const HoneyTokenResponseSchema = HoneyTokensSchema.pick({
  id: true,
  name: true,
  description: true,
  type: true,
  status: true,
  projectId: true,
  secretsMapping: true,
  createdAt: true,
  updatedAt: true
});

const HoneyTokenDetailsResponseSchema = HoneyTokensSchema.pick({
  id: true,
  name: true,
  description: true,
  type: true,
  status: true,
  projectId: true,
  folderId: true,
  secretsMapping: true,
  createdAt: true,
  updatedAt: true
}).extend({
  environment: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string()
    })
    .nullable(),
  folder: z
    .object({
      path: z.string()
    })
    .nullable(),
  openEvents: z.number()
});

const HoneyTokenResetResponseSchema = HoneyTokensSchema.pick({
  id: true,
  status: true
}).extend({
  lastResetAt: z.date().nullable()
});

const HoneyTokenCredentialsResponseSchema = z.discriminatedUnion(
  "type",
  Object.values(HONEY_TOKEN_CREDENTIALS_RESPONSE_SCHEMA_MAP) as unknown as [
    z.ZodDiscriminatedUnionOption<"type">,
    ...z.ZodDiscriminatedUnionOption<"type">[]
  ]
);

export const registerHoneyTokenGenericRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/limits",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          used: z.number(),
          limit: z.number()
        })
      }
    },
    handler: async (req) => {
      return server.services.honeyToken.getOrgHoneyTokenLimit({ projectId: req.query.projectId }, req.permission);
    }
  });

  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        projectId: z.string().trim(),
        type: z.nativeEnum(HoneyTokenType),
        name: slugSchema({ field: "name" }),
        description: z.string().trim().max(256).nullish(),
        secretsMapping: z.record(z.string(), z.string().min(1)),
        environment: z.string().trim(),
        secretPath: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          honeyToken: HoneyTokenResponseSchema,
          stackDeployment: z
            .object({
              deployed: z.boolean(),
              status: z.string().nullable()
            })
            .optional()
        })
      }
    },
    handler: async (req) => {
      const { honeyToken, stackDeployment } = await server.services.honeyToken.create(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: honeyToken.projectId,
        event: {
          type: EventType.CREATE_HONEY_TOKEN,
          metadata: {
            honeyTokenId: honeyToken.id,
            name: honeyToken.name,
            type: honeyToken.type as HoneyTokenType,
            environment: req.body.environment,
            secretPath: req.body.secretPath
          }
        }
      });

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.HoneyTokenCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            honeyTokenId: honeyToken.id,
            type: honeyToken.type,
            projectId: honeyToken.projectId,
            environment: req.body.environment,
            secretPath: req.body.secretPath
          }
        })
        .catch(() => {});

      return { honeyToken, stackDeployment };
    }
  });

  server.route({
    url: "/:id",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          honeyToken: HoneyTokenDetailsResponseSchema
        })
      }
    },
    handler: async (req) => {
      const { honeyToken } = await server.services.honeyToken.getHoneyTokenById(
        { honeyTokenId: req.params.id },
        req.permission
      );
      return { honeyToken };
    }
  });

  server.route({
    url: "/:id",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      body: z.object({
        name: slugSchema({ field: "name" }).optional(),
        description: z.string().trim().max(256).nullish(),
        secretsMapping: z.record(z.string(), z.string().min(1)).optional()
      }),
      response: {
        200: z.object({
          honeyToken: HoneyTokenResponseSchema
        })
      }
    },
    handler: async (req) => {
      const { name, description, secretsMapping } = req.body;
      const { honeyToken, folderInfo } = await server.services.honeyToken.updateHoneyToken(
        {
          honeyTokenId: req.params.id,
          name,
          description,
          secretsMapping
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: honeyToken.projectId,
        event: {
          type: EventType.UPDATE_HONEY_TOKEN,
          metadata: {
            honeyTokenId: honeyToken.id,
            name: honeyToken.name,
            type: honeyToken.type as HoneyTokenType,
            environment: folderInfo?.environmentSlug || "",
            secretPath: folderInfo?.path || ""
          }
        }
      });

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.HoneyTokenUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            honeyTokenId: honeyToken.id,
            type: honeyToken.type,
            projectId: honeyToken.projectId
          }
        })
        .catch(() => {});

      return { honeyToken };
    }
  });

  server.route({
    url: "/:id/reset",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          honeyToken: HoneyTokenResetResponseSchema
        })
      }
    },
    handler: async (req) => {
      const { honeyToken } = await server.services.honeyToken.resetHoneyToken(
        { honeyTokenId: req.params.id },
        req.permission
      );
      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.HoneyTokenReset,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            honeyTokenId: honeyToken.id,
            type: honeyToken.type,
            projectId: honeyToken.projectId
          }
        })
        .catch(() => {});

      return {
        honeyToken: {
          id: honeyToken.id,
          status: honeyToken.status,
          lastResetAt: honeyToken.lastResetAt ?? null
        }
      };
    }
  });

  server.route({
    url: "/:id/revoke",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          honeyTokenId: z.string().uuid()
        })
      }
    },
    handler: async (req) => {
      const { honeyTokenId, honeyToken, folderInfo } = await server.services.honeyToken.revokeHoneyToken(
        { honeyTokenId: req.params.id },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: honeyToken.projectId,
        event: {
          type: EventType.REVOKE_HONEY_TOKEN,
          metadata: {
            honeyTokenId,
            name: honeyToken.name,
            type: honeyToken.type as HoneyTokenType,
            environment: folderInfo?.environmentSlug || "",
            secretPath: folderInfo?.path || ""
          }
        }
      });

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.HoneyTokenRevoked,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            honeyTokenId,
            type: honeyToken.type,
            projectId: honeyToken.projectId
          }
        })
        .catch(() => {});

      return { honeyTokenId };
    }
  });

  server.route({
    url: "/:id/credentials",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: HoneyTokenCredentialsResponseSchema
      }
    },
    handler: async (req) => {
      const { type, credentials } = await server.services.honeyToken.getCredentials(
        { honeyTokenId: req.params.id },
        req.permission
      );
      return {
        type,
        credentials
      };
    }
  });

  server.route({
    url: "/:id/events",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          events: z.array(
            z.object({
              id: z.string().uuid(),
              honeyTokenId: z.string().uuid(),
              eventType: z.string(),
              metadata: z.unknown().nullable().optional(),
              createdAt: z.date(),
              updatedAt: z.date()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { events, totalCount } = await server.services.honeyToken.getHoneyTokenEvents(
        {
          honeyTokenId: req.params.id,
          offset: req.query.offset,
          limit: req.query.limit
        },
        req.permission
      );
      return { events, totalCount };
    }
  });
};

export const registerHoneyTokenRouter = async (server: FastifyZodProvider) => {
  await registerHoneyTokenGenericRouter(server);

  for await (const [type, router] of Object.entries(HONEY_TOKEN_REGISTER_ROUTER_MAP)) {
    await server.register(router, { prefix: `/${type}` });
  }
};
