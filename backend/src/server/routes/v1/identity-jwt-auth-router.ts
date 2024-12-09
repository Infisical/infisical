import { z } from "zod";

import { IdentityJwtAuthsSchema } from "@app/db/schemas";
import { JWT_AUTH } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { JwtConfigurationType } from "@app/services/identity-jwt-auth/identity-jwt-auth-types";
import {
  validateJwtAuthAudiencesField,
  validateJwtBoundClaimsField
} from "@app/services/identity-jwt-auth/identity-jwt-auth-validators";

const IdentityJwtAuthResponseSchema = IdentityJwtAuthsSchema.omit({
  encryptedJwksCaCert: true,
  encryptedPublicKeys: true
}).extend({
  jwksCaCert: z.string(),
  publicKeys: z.string()
});

export const registerIdentityJwtAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/jwt-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach JWT Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(JWT_AUTH.ATTACH.identityId)
      }),
      body: z.object({
        configurationType: z.nativeEnum(JwtConfigurationType).describe(JWT_AUTH.ATTACH.configurationType),
        jwksUrl: z.string().describe(JWT_AUTH.ATTACH.jwksUrl),
        jwksCaCert: z.string().describe(JWT_AUTH.ATTACH.jwksCaCert),
        publicKeys: z.string().array().describe(JWT_AUTH.ATTACH.publicKeys),
        boundIssuer: z.string().min(1).describe(JWT_AUTH.ATTACH.boundIssuer),
        boundAudiences: validateJwtAuthAudiencesField.describe(JWT_AUTH.ATTACH.boundAudiences),
        boundClaims: validateJwtBoundClaimsField.describe(JWT_AUTH.ATTACH.boundClaims),
        boundSubject: z.string().optional().default("").describe(JWT_AUTH.ATTACH.boundSubject),
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
          .describe(JWT_AUTH.ATTACH.accessTokenTrustedIps),
        accessTokenTTL: z
          .number()
          .int()
          .min(1)
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000)
          .describe(JWT_AUTH.ATTACH.accessTokenTTL),
        accessTokenMaxTTL: z
          .number()
          .int()
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000)
          .describe(JWT_AUTH.ATTACH.accessTokenMaxTTL),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(JWT_AUTH.ATTACH.accessTokenNumUsesLimit)
      }),
      response: {
        200: z.object({
          identityJwtAuth: IdentityJwtAuthResponseSchema
        })
      }
    },
    handler: async (req) => {}
  });
};
