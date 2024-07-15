import { z } from "zod";

import { ExternalKmsSchema, KmsKeysSchema } from "@app/db/schemas";
import {
  ExternalKmsAwsSchema,
  ExternalKmsInputSchema,
  ExternalKmsInputUpdateSchema
} from "@app/ee/services/external-kms/providers/model";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedExternalSchema = KmsKeysSchema.extend({
  external: ExternalKmsSchema.pick({
    id: true,
    status: true,
    statusDetails: true,
    provider: true
  })
});

const sanitizedExternalSchemaForGetById = KmsKeysSchema.extend({
  external: ExternalKmsSchema.pick({
    id: true,
    status: true,
    statusDetails: true,
    provider: true
  }).extend({
    providerInput: ExternalKmsAwsSchema
  })
});

export const registerExternalKmsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        slug: z.string().min(1).trim().optional(),
        description: z.string().min(1).trim().optional(),
        provider: ExternalKmsInputSchema
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.body.slug,
        provider: req.body.provider,
        description: req.body.description
      });
      return { externalKms };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim().min(1)
      }),
      body: z.object({
        slug: z.string().min(1).trim().optional(),
        description: z.string().min(1).trim().optional(),
        provider: ExternalKmsInputUpdateSchema
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.updateById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.body.slug,
        provider: req.body.provider,
        description: req.body.description,
        id: req.params.id
      });
      return { externalKms };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.deleteById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { externalKms };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchemaForGetById
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.findById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { externalKms };
    }
  });

  server.route({
    method: "GET",
    url: "/slug/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        slug: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchemaForGetById
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.findBySlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.slug
      });
      return { externalKms };
    }
  });
};
