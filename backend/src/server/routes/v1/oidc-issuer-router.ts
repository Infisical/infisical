import { z } from "zod";

import { oidcIssuerLimit } from "@app/server/config/rateLimiter";

// The next key is published a full signing period (24h) before it signs, so a cached JWKS younger than that
// always holds the signing key
const CACHE_CONTROL = `public, max-age=${60 * 60}, must-revalidate`;

const OrgParamsSchema = z.object({
  organizationId: z.string().uuid()
});

// Public and shaped by OIDC Discovery and RFC 7517, not the house envelope. The paths are part of each org's
// issuer URL, which customers paste into their providers, so they can never move.
export const registerOidcIssuerRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/organizations/:organizationId/.well-known/openid-configuration",
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
          id_token_signing_alg_values_supported: z.string().array(),
          scopes_supported: z.string().array(),
          claims_supported: z.string().array()
        })
      }
    },
    handler: async (req, res) => {
      void res.header("Cache-Control", CACHE_CONTROL);
      return server.services.oidcIssuer.getDiscoveryDocument(req.params.organizationId);
    }
  });

  server.route({
    method: "GET",
    url: "/organizations/:organizationId/.well-known/jwks.json",
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
      const jwks = await server.services.oidcIssuer.getJwks(req.params.organizationId);

      // An org gets keys on its first sign, so an empty set must not be cached or that first token fails to verify
      void res.header("Cache-Control", jwks.keys.length ? CACHE_CONTROL : "no-store");
      return jwks;
    }
  });
};
