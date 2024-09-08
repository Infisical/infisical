import { z } from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CredentialKind } from "@app/services/user-credentials/credentials-dal";
import { logger } from "@app/lib/logger";

const zodCredentialSchema = z.intersection(
  z.object({
    name: z.string().trim(),
    credentialId: z.string().optional()
  }),
  z.union([
    z.object({
      kind: z.literal(CredentialKind.login),
      website: z.string().trim(),
      username: z.string().trim(),
      password: z.string().trim()
    }),
    z.object({
      kind: z.literal(CredentialKind.secureNote),
      note: z.string().trim()
    })
  ])
);

export const registerCredentialsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:orgId",
    schema: {
      params: z.object({
        orgId: z.string().trim()
      }),
      body: zodCredentialSchema,
      response: {
        200: zodCredentialSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      logger.info("BEFORE");
      const credential = await server.services.credential.upsertCredential({
        orgId: req.params.orgId,
        actorId: req.permission.id,
        credential: req.body
      });
      return credential;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    schema: {
      response: {
        200: z.object({
          credentials: z.array(zodCredentialSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const credentials = await server.services.credential.findCredentialsById({
        actorId: req.permission.id,
        orgId: req.permission.orgId
      });
      return { credentials };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:credentialId",
    schema: {
      params: z.object({
        credentialId: z.string().trim()
      }),
      body: z.object({
        kind: z.union([z.literal(CredentialKind.login), z.literal(CredentialKind.secureNote)])
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.credential.deleteCredentialById({
        userId: req.permission.id,
        credentialId: req.params.credentialId,
        kind: req.body.kind
      });
    }
  });
};
