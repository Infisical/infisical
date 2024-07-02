import { z } from "zod";

import { IdentityOidcAuthsSchema } from "@app/db/schemas";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { validateOidcAuthAudiencesField } from "@app/services/identity-oidc-auth/identity-oidc-auth-validators";

export const registerIdentityOidcAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/oidc-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach OIDC Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]),
        accessTokenTTL: z
          .number()
          .int()
          .min(1)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000),
        accessTokenMaxTTL: z
          .number()
          .int()
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0),
        oidcDiscoveryUrl: z.string().url().min(1),
        caCert: z.string().trim().default(""),
        boundIssuer: z.string().min(1),
        boundAudiences: validateOidcAuthAudiencesField,
        boundClaims: z.record(z.string()),
        boundSubject: z.string().optional()
      }),
      response: {
        200: z.object({
          identityOidcAuth: IdentityOidcAuthsSchema
        })
      }
    },
    handler: async () => {}
  });
};
