/* eslint-disable @typescript-eslint/no-floating-promises */
import type { TAcmeResponse } from "@app/ee/services/pki-acme/pki-acme-types";
import { FastifyReply } from "fastify";
import { z } from "zod";

import {
  CreateAcmeAccountResponseSchema,
  CreateAcmeOrderBodySchema,
  CreateAcmeOrderResponseSchema,
  DeactivateAcmeAccountBodySchema,
  DeactivateAcmeAccountResponseSchema,
  FinalizeAcmeOrderBodySchema,
  GetAcmeAuthorizationResponseSchema,
  GetAcmeDirectoryResponseSchema,
  GetAcmeOrderResponseSchema,
  ListAcmeOrdersResponseSchema,
  RawJwsPayloadSchema,
  RespondToAcmeChallengeResponseSchema
} from "@app/ee/services/pki-acme/pki-acme-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";

export const registerPkiAcmeRouter = async (server: FastifyZodProvider) => {
  const sendAcmeResponse = async <T>(res: FastifyReply, profileId: string, response: TAcmeResponse<T>): Promise<T> => {
    res.code(response.status);
    for (const [key, value] of Object.entries(response.headers)) {
      res.header(key, value);
    }

    const nonce = await server.services.pkiAcme.getAcmeNewNonce(profileId);
    res.header("Replay-Nonce", nonce);
    res.header("Cache-Control", "no-store");
    return response.body;
  };

  server.addContentTypeParser("application/jose+json", { parseAs: "string" }, (_, body, done) => {
    try {
      const strBody = body instanceof Buffer ? body.toString() : body;
      if (!strBody) {
        done(null, undefined);
      }
      const json: unknown = JSON.parse(strBody as string);
      // TODO: deal with JWS payload here
      done(null, json);
    } catch (err) {
      const error = err as Error;
      done(error, undefined);
    }
  });
  // GET /api/v1/pki/acme/profiles/<profile_id>/directory
  // Directory (RFC 8555 Section 7.1.1)
  server.route({
    method: "GET",
    url: "/profiles/:profileId/directory",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Directory - provides URLs for the client to make API calls to",
      params: z.object({
        profileId: z.string().uuid()
      }),
      response: {
        200: GetAcmeDirectoryResponseSchema
      }
    },
    handler: async (req) => {
      const directory = await server.services.pkiAcme.getAcmeDirectory(req.params.profileId);
      return directory;
    }
  });

  // HEAD /api/v1/pki/acme/profiles/<profile_id>/new-nonce
  // New Nonce (RFC 8555 Section 7.2)
  server.route({
    method: "HEAD",
    url: "/profiles/:profileId/new-nonce",
    config: {
      // TODO: probably a different rate limit for nonce creation
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME New Nonce - generate a new nonce and return in Replay-Nonce header",
      params: z.object({
        profileId: z.string().uuid()
      }),
      response: {
        200: z.string().length(0)
      }
    },
    handler: async (req, res) => {
      const nonce = await server.services.pkiAcme.getAcmeNewNonce(req.params.profileId);
      res.header("Replay-Nonce", nonce);
      return "";
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/new-account
  // New Account (RFC 8555 Section 7.3)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/new-account",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME New Account - register a new account or find existing one",
      params: z.object({
        profileId: z.string().uuid()
      }),
      body: RawJwsPayloadSchema,
      response: {
        201: CreateAcmeAccountResponseSchema
      }
    },
    handler: async (req, res) => {
      const { payload, protectedHeader } = await server.services.pkiAcme.validateNewAccountJwsPayload(req.body);
      const { alg, jwk } = protectedHeader;
      return sendAcmeResponse(
        res,
        req.params.profileId,
        await server.services.pkiAcme.createAcmeAccount({
          profileId: req.params.profileId,
          alg,
          jwk: jwk!,
          payload
        })
      );
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/new-order
  // New Certificate Order (RFC 8555 Section 7.4)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/new-order",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME New Order - apply for a new certificate",
      params: z.object({
        profileId: z.string().uuid()
      }),
      body: RawJwsPayloadSchema,
      response: {
        201: CreateAcmeOrderResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, res) => {
      const { payload, accountId } = await server.services.pkiAcme.validateExistingAccountJwsPayload(
        req.params.profileId,
        req.body,
        CreateAcmeOrderBodySchema
      );
      return sendAcmeResponse(
        res,
        req.params.profileId,
        await server.services.pkiAcme.createAcmeOrder({
          profileId: req.params.profileId,
          accountId,
          payload
        })
      );
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/accounts/<account_id>
  // Account Deactivation (RFC 8555 Section 7.3.6)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/accounts/:accountId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Account Deactivation",
      params: z.object({
        profileId: z.string().uuid(),
        accountId: z.string()
      }),
      body: DeactivateAcmeAccountBodySchema,
      response: {
        200: DeactivateAcmeAccountResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiAcme.deactivateAcmeAccount(req.params.profileId, req.params.accountId);
      return result;
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/accounts/<account_id>/orders
  // List Orders (RFC 8555 Section 7.1.2.1)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/accounts/:accountId/orders",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME List Orders - get existing orders from current account",
      params: z.object({
        profileId: z.string().uuid(),
        accountId: z.string()
      }),
      response: {
        200: ListAcmeOrdersResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const orders = await server.services.pkiAcme.listAcmeOrders(req.params.profileId, req.params.accountId);
      return orders;
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/orders/<order_id>
  // Get Order (RFC 8555 Section 7.1.3)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/orders/:orderId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Get Order - return status and details of the order",
      params: z.object({
        profileId: z.string().uuid(),
        orderId: z.string().uuid()
      }),
      response: {
        200: GetAcmeOrderResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const order = await server.services.pkiAcme.getAcmeOrder(req.params.profileId, req.params.orderId);
      return order;
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/orders/<order_id>/finalize
  // Applying for Certificate Issuance (RFC 8555 Section 7.4)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/orders/:orderId/finalize",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Finalize Order - finalize cert order by providing CSR",
      params: z.object({
        profileId: z.string().uuid(),
        orderId: z.string().uuid()
      }),
      body: FinalizeAcmeOrderBodySchema
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const order = await server.services.pkiAcme.finalizeAcmeOrder(req.params.profileId, req.params.orderId, req.body);
      return order;
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/orders/<order_id>/certificate
  // Download Certificate (RFC 8555 Section 7.4.2)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/orders/:orderId/certificate",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Download Certificate - download certificate when ready",
      params: z.object({
        profileId: z.string().uuid(),
        orderId: z.string().uuid()
      }),
      response: {
        200: z.string()
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, res) => {
      const certificate = await server.services.pkiAcme.downloadAcmeCertificate(
        req.params.profileId,
        req.params.orderId
      );
      res.header("Content-Type", "application/pem-certificate-chain");
      return certificate;
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/authorizations/<authz_id>
  // Identifier Authorization (RFC 8555 Section 7.5)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/authorizations/:authzId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Identifier Authorization - get authorization info (challenges)",
      params: z.object({
        profileId: z.string().uuid(),
        authzId: z.string().uuid()
      }),
      response: {
        200: GetAcmeAuthorizationResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const authz = await server.services.pkiAcme.getAcmeAuthorization(req.params.profileId, req.params.authzId);
      return authz;
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/authorizations/<authz_id>/challenges/http-01
  // Respond to Challenge (RFC 8555 Section 7.5.1)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/authorizations/:authzId/challenges/http-01",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Respond to Challenge - let ACME server know challenge is ready",
      params: z.object({
        profileId: z.string().uuid(),
        authzId: z.string().uuid()
      }),
      response: {
        200: RespondToAcmeChallengeResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const challenge = await server.services.pkiAcme.respondToAcmeChallenge(req.params.profileId, req.params.authzId);
      return challenge;
    }
  });
};
