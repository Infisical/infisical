/* eslint-disable @typescript-eslint/no-floating-promises */
import { z } from "zod";

import {
  CreateAcmeAccountBodySchema,
  CreateAcmeAccountResponseSchema,
  CreateAcmeOrderResponseSchema,
  CreateAcmeOrderSchema,
  DeactivateAcmeAccountResponseSchema,
  DeactivateAcmeAccountSchema,
  DownloadAcmeCertificateSchema,
  FinalizeAcmeOrderResponseSchema,
  FinalizeAcmeOrderSchema,
  GetAcmeAuthorizationResponseSchema,
  GetAcmeAuthorizationSchema,
  GetAcmeDirectoryResponseSchema,
  GetAcmeDirectorySchema,
  GetAcmeNewNonceSchema,
  GetAcmeOrderResponseSchema,
  GetAcmeOrderSchema,
  ListAcmeOrdersResponseSchema,
  ListAcmeOrdersSchema,
  RawJwsPayloadSchema,
  RespondToAcmeChallengeResponseSchema,
  RespondToAcmeChallengeSchema
} from "@app/ee/services/pki-acme/pki-acme-schemas";
import { TCreateAcmeAccountPayload, TRawJwsPayload } from "@app/ee/services/pki-acme/pki-acme-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { AcmeBadPublicKeyError } from "@app/ee/services/pki-acme/pki-acme-errors";

export const registerPkiAcmeRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

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
      ...GetAcmeDirectorySchema.shape,
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
      ...GetAcmeNewNonceSchema.shape,
      response: {
        200: z.object({})
      }
    },
    handler: async (req, res) => {
      const nonce = await server.services.pkiAcme.getAcmeNewNonce(req.params.profileId);
      res.header("Replay-Nonce", nonce);
      return {};
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
      ...RawJwsPayloadSchema.shape,
      response: {
        201: CreateAcmeAccountResponseSchema
      }
    },
    handler: async (req, res) => {
      const { payload, protectedHeader, jwk } = await server.services.pkiAcme.validateJwsPayload(
        req.body as TRawJwsPayload,
        async (protectedHeader) => {
          if (!protectedHeader.jwk) {
            throw new AcmeBadPublicKeyError({ detail: "JWK is required in the protected header" });
          }
          return protectedHeader.jwk as unknown as JsonWebKey;
        },
        CreateAcmeAccountBodySchema
      );
      if (!jwk) {
        throw new AcmeBadPublicKeyError({ detail: "JWK is required in the protected header" });
      }
      const { status, body, headers } = await server.services.pkiAcme.createAcmeAccount(
        req.params.profileId,
        protectedHeader.alg,
        jwk,
        payload
      );
      // TODO: DRY
      res.code(status);
      for (const [key, value] of Object.entries(headers)) {
        res.header(key, value);
      }

      // TODO: DRY
      const nonce = await server.services.pkiAcme.getAcmeNewNonce(req.params.profileId);
      res.header("Replay-Nonce", nonce);
      res.header("Cache-Control", "no-store");
      return body;
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
      ...CreateAcmeOrderSchema.shape,
      response: {
        201: CreateAcmeOrderResponseSchema
      }
    },
    // TODO: replace with verify ACME signature here instead
    // onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, res) => {
      const order = await server.services.pkiAcme.createAcmeOrder(req.params.profileId, req.body);
      res.code(201);
      return order;
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
      ...DeactivateAcmeAccountSchema.shape,
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
      ...ListAcmeOrdersSchema.shape,
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
      ...GetAcmeOrderSchema.shape,
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
      ...FinalizeAcmeOrderSchema.shape,
      response: {
        200: FinalizeAcmeOrderResponseSchema
      }
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
      ...DownloadAcmeCertificateSchema.shape,
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
      ...GetAcmeAuthorizationSchema.shape,
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
      ...RespondToAcmeChallengeSchema.shape,
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
