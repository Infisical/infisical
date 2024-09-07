import { z } from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CredentialKind } from "@app/services/user-credentials/credentials-dal";

const zodCredentialSchema = z.intersection(
  z.object({ name: z.string().trim() }),
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
      body: zodCredentialSchema
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.credential.upsertCredential({
        orgId: req.params.orgId,
        actorId: req.permission.id,
        credential: req.body
      });
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
    handler: async (req) => {
      const credentials = await server.services.credential.findCredentialsById({
        actorId: req.permission.id,
        orgId: req.permission.orgId
      });
      return { credentials };
    }
  });
};
