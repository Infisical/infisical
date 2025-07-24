import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { VaultMappingType } from "@app/services/external-migration/external-migration-types";

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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
        mappingType: z.nativeEnum(VaultMappingType)
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
};
