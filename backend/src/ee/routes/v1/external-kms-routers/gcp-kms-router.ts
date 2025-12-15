import { z } from "zod";

import {
  ExternalKmsGcpCredentialSchema,
  ExternalKmsGcpSchema,
  KmsGcpKeyFetchAuthType,
  KmsProviders,
  TExternalKmsGcpCredentialSchema
} from "@app/ee/services/external-kms/providers/model";
import { NotFoundError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerExternalKmsEndpoints } from "./external-kms-endpoints";

export const registerGcpKmsRouter = async (server: FastifyZodProvider) => {
  registerExternalKmsEndpoints({
    server,
    provider: KmsProviders.Gcp,
    createSchema: ExternalKmsGcpSchema,
    updateSchema: ExternalKmsGcpSchema.partial()
  });

  server.route({
    method: "POST",
    url: "/keys",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.discriminatedUnion("authMethod", [
        z.object({
          authMethod: z.literal(KmsGcpKeyFetchAuthType.Credential),
          region: z.string().trim().min(1),
          credential: ExternalKmsGcpCredentialSchema
        }),
        z.object({
          authMethod: z.literal(KmsGcpKeyFetchAuthType.Kms),
          region: z.string().trim().min(1),
          kmsId: z.string().trim().min(1)
        })
      ]),
      response: {
        200: z.object({
          keys: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { region, authMethod } = req.body;
      let credentialJson: TExternalKmsGcpCredentialSchema | undefined;

      if (authMethod === KmsGcpKeyFetchAuthType.Credential && "credential" in req.body) {
        credentialJson = req.body.credential;
      } else if (authMethod === KmsGcpKeyFetchAuthType.Kms && "kmsId" in req.body) {
        const externalKms = await server.services.externalKms.findById({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          id: req.body.kmsId
        });

        if (!externalKms || externalKms.external.provider !== KmsProviders.Gcp) {
          throw new NotFoundError({ message: "KMS not found or not of type GCP" });
        }

        const providerInput = externalKms.external.providerInput as { credential: TExternalKmsGcpCredentialSchema };
        credentialJson = providerInput.credential;
      }

      if (!credentialJson) {
        throw new NotFoundError({
          message: "Something went wrong while fetching the GCP credential, please check inputs and try again"
        });
      }

      const results = await server.services.externalKms.fetchGcpKeys({
        credential: credentialJson,
        gcpRegion: region
      });

      return results;
    }
  });
};
