import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  ExternalMigrationProviders,
  VaultMappingType
} from "@app/services/external-migration/external-migration-types";

const MB25_IN_BYTES = 26214400;

export const registerExternalMigrationRouter = async (server: FastifyZodProvider) => {
  await server.register(fastifyMultipart);

  server.route({
    method: "POST",
    bodyLimit: MB25_IN_BYTES,
    url: "/env-key",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await req.file({
        limits: {
          fileSize: MB25_IN_BYTES
        }
      });

      if (!data) {
        throw new BadRequestError({ message: "No file provided" });
      }

      const fullFile = Buffer.from(await data.toBuffer()).toString("utf8");
      const parsedJsonFile = JSON.parse(fullFile) as { nonce: string; data: string };

      const decryptionKey = (data.fields.decryptionKey as { value: string }).value;

      if (!parsedJsonFile.nonce || !parsedJsonFile.data) {
        throw new BadRequestError({ message: "Invalid file format. Nonce or data missing." });
      }

      if (!decryptionKey) {
        throw new BadRequestError({ message: "Decryption key is required" });
      }

      await server.services.migration.importEnvKeyData({
        decryptionKey,
        encryptedJson: parsedJsonFile,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "POST",
    url: "/vault",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        vaultAccessToken: z.string(),
        vaultNamespace: z.string().trim().optional(),
        vaultUrl: z.string(),
        mappingType: z.nativeEnum(VaultMappingType),
        gatewayId: z.string().optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.migration.importVaultData({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body
      });
    }
  });

  server.route({
    method: "GET",
    url: "/custom-migration-enabled/:provider",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        provider: z.nativeEnum(ExternalMigrationProviders)
      }),
      response: {
        200: z.object({
          enabled: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const enabled = await server.services.migration.hasCustomVaultMigration({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        provider: req.params.provider
      });
      return { enabled };
    }
  });

  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        platform: z.nativeEnum(ExternalMigrationProviders)
      }),
      response: {
        200: z.object({
          config: z
            .object({
              id: z.string(),
              orgId: z.string(),
              platform: z.string(),
              connectionId: z.string().nullable().optional(),
              createdAt: z.date(),
              updatedAt: z.date()
            })
            .nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const config = await server.services.migration.getExternalMigrationConfig({
        platform: req.query.platform,
        actor: req.permission
      });

      return { config };
    }
  });

  server.route({
    method: "PUT",
    url: "/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        connectionId: z.string().nullable(),
        platform: z.nativeEnum(ExternalMigrationProviders)
      }),
      response: {
        200: z.object({
          config: z.object({
            id: z.string(),
            orgId: z.string(),
            platform: z.string(),
            connectionId: z.string().nullable().optional(),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const config = await server.services.migration.configureExternalMigration({
        ...req.body,
        actor: req.permission
      });
      return { config };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/namespaces",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          namespaces: z.array(z.object({ id: z.string(), name: z.string() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const namespaces = await server.services.migration.getVaultNamespaces({
        actor: req.permission
      });

      return { namespaces };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/policies",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string().optional()
      }),
      response: {
        200: z.object({
          policies: z.array(z.object({ name: z.string(), rules: z.string() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const policies = await server.services.migration.getVaultPolicies({
        actor: req.permission,
        namespace: req.query.namespace
      });

      return { policies };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/mounts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string().optional()
      }),
      response: {
        200: z.object({
          mounts: z.array(z.object({ path: z.string(), type: z.string(), version: z.string().nullish() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const mounts = await server.services.migration.getVaultMounts({
        actor: req.permission,
        namespace: req.query.namespace
      });

      return { mounts };
    }
  });
};
