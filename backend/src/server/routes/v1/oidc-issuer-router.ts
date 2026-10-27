import { z } from "zod";

import { oidcIssuerLimit } from "@app/server/config/rateLimiter";

// The next key is published a full signing period (24h) before it signs, so a cached JWKS younger than that
// always holds the signing key
const CACHE_MAX_AGE_SECONDS = 60 * 60;

const OrgParamsSchema = z.object({
  orgId: z.string().uuid()
});

// Unauthenticated, and shaped by OpenID Connect Discovery 1.0 and RFC 7517 rather than the house envelope,
// because cloud providers fetch them to verify tokens Infisical signs
export const registerOidcIssuerRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/orgs/:orgId/.well-known/openid-configuration",
    config: {
      rateLimit: oidcIssuerLimit
    },
    schema: {
      hide: true,
      params: OrgParamsSchema,
      response: {
        200: z.object({
          issuer: z.string(),
          jwks_uri: z.string(),
          response_types_supported: z.string().array(),
          subject_types_supported: z.string().array(),
          id_token_signing_alg_values_supported: z.string().array()
        })
      }
    },
    handler: async (req, res) => {
      void res.header("Cache-Control", `public, max-age=${CACHE_MAX_AGE_SECONDS}`);
      return server.services.oidcIssuer.getDiscoveryDocument(req.params.orgId);
    }
  });

  server.route({
    method: "GET",
    url: "/orgs/:orgId/.well-known/jwks.json",
    config: {
      rateLimit: oidcIssuerLimit
    },
    schema: {
      hide: true,
      params: OrgParamsSchema,
      response: {
        200: z.object({
          keys: z
            .object({
              kty: z.string(),
              n: z.string(),
              e: z.string(),
              kid: z.string(),
              alg: z.string(),
              use: z.string()
            })
            .array()
        })
      }
    },
    handler: async (req, res) => {
      const jwks = await server.services.oidcIssuer.getJwks(req.params.orgId);

      // An org gets keys on its first sign, so an empty set must not be cached or that first token fails to verify
      void res.header("Cache-Control", jwks.keys.length ? `public, max-age=${CACHE_MAX_AGE_SECONDS}` : "no-store");
      return jwks;
    }
  });
};
