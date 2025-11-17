/* eslint-disable @typescript-eslint/no-floating-promises */
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  AcmeOrderResourceSchema,
  CreateAcmeAccountResponseSchema,
  CreateAcmeOrderBodySchema,
  DeactivateAcmeAccountBodySchema,
  DeactivateAcmeAccountResponseSchema,
  FinalizeAcmeOrderBodySchema,
  GetAcmeAuthorizationResponseSchema,
  GetAcmeDirectoryResponseSchema,
  ListAcmeOrdersPayloadSchema,
  ListAcmeOrdersResponseSchema,
  RawJwsPayloadSchema,
  RespondToAcmeChallengeBodySchema,
  RespondToAcmeChallengeResponseSchema
} from "@app/ee/services/pki-acme/pki-acme-schemas";
import type { TAcmeResponse, TAuthenciatedJwsPayload, TRawJwsPayload } from "@app/ee/services/pki-acme/pki-acme-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";

const SharedParamsSchema = z.object({
  profileId: z.string().uuid()
});

export interface MyRequestInterface {
  Params: { profileId: string; accountId?: string };
  Body: TRawJwsPayload;
}

export const registerPkiAcmeRouter = async (server: FastifyZodProvider) => {
  const validateExistingAccount = async <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends FastifyRequest<any>,
    TSchema extends z.ZodSchema<unknown> | undefined = undefined,
    T = TSchema extends z.ZodSchema<infer U> ? U : string
  >({
    req,
    schema
  }: {
    req: R;
    schema?: TSchema;
  }): Promise<TAuthenciatedJwsPayload<T>> => {
    return server.services.pkiAcme.validateExistingAccountJwsPayload({
      url: new URL(req.url, `${req.protocol}://${req.hostname}`),
      profileId: (req.params as { profileId: string }).profileId,
      rawJwsPayload: req.body as TRawJwsPayload,
      schema,
      expectedAccountId: (req.params as { accountId?: string }).accountId
    });
  };

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
      const json: unknown = JSON.parse(strBody);
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
    handler: async (req) => server.services.pkiAcme.getAcmeDirectory(req.params.profileId)
  });

  // HEAD /api/v1/pki/acme/profiles/<profile_id>/new-nonce
  // New Nonce (RFC 8555 Section 7.2)
  server.route({
    method: "HEAD",
    url: "/profiles/:profileId/new-nonce",
    config: {
      // TODO: probably a different rate limit for nonce creation?
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
      params: SharedParamsSchema,
      body: RawJwsPayloadSchema,
      response: {
        201: CreateAcmeAccountResponseSchema
      }
    },
    handler: async (req, res) => {
      const { payload, protectedHeader } = await server.services.pkiAcme.validateNewAccountJwsPayload({
        url: new URL(req.url, `${req.protocol}://${req.hostname}`),
        rawJwsPayload: req.body
      });
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
      params: SharedParamsSchema.extend({
        accountId: z.string()
      }),
      body: RawJwsPayloadSchema,
      response: {
        200: DeactivateAcmeAccountResponseSchema
      }
    },
    handler: async (req, res) => {
      const { payload, profileId, accountId } = await validateExistingAccount({
        req,
        schema: DeactivateAcmeAccountBodySchema
      });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.deactivateAcmeAccount({
          profileId,
          accountId,
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
      params: SharedParamsSchema,
      body: RawJwsPayloadSchema,
      response: {
        201: AcmeOrderResourceSchema
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId, payload } = await validateExistingAccount({
        req,
        schema: CreateAcmeOrderBodySchema
      });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.createAcmeOrder({
          profileId,
          accountId,
          payload
        })
      );
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
      params: SharedParamsSchema.extend({
        orderId: z.string().uuid()
      }),
      body: RawJwsPayloadSchema,
      response: {
        200: AcmeOrderResourceSchema
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId } = await validateExistingAccount({
        req
      });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.getAcmeOrder({
          profileId,
          accountId,
          orderId: req.params.orderId
        })
      );
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
      params: SharedParamsSchema.extend({
        orderId: z.string().uuid()
      }),
      body: RawJwsPayloadSchema,
      response: {
        200: AcmeOrderResourceSchema
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId, payload } = await validateExistingAccount({
        req,
        schema: FinalizeAcmeOrderBodySchema
      });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.finalizeAcmeOrder({
          profileId,
          accountId,
          orderId: req.params.orderId,
          payload
        })
      );
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
      params: SharedParamsSchema.extend({
        accountId: z.string()
      }),
      body: RawJwsPayloadSchema,
      response: {
        200: ListAcmeOrdersResponseSchema
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId } = await validateExistingAccount({
        req,
        schema: ListAcmeOrdersPayloadSchema
      });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.listAcmeOrders({
          profileId,
          accountId
        })
      );
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
      params: SharedParamsSchema.extend({
        orderId: z.string().uuid()
      }),
      body: RawJwsPayloadSchema,
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId } = await validateExistingAccount({
        req
      });
      res.type("application/pem-certificate-chain");
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.downloadAcmeCertificate({ profileId, accountId, orderId: req.params.orderId })
      );
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
      params: SharedParamsSchema.extend({
        authzId: z.string().uuid()
      }),
      body: RawJwsPayloadSchema,
      response: {
        200: GetAcmeAuthorizationResponseSchema
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId } = await validateExistingAccount({ req });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.getAcmeAuthorization({
          profileId,
          accountId,
          authzId: req.params.authzId
        })
      );
    }
  });

  // POST /api/v1/pki/acme/profiles/<profile_id>/authorizations/<authz_id>/challenges/<challenge_id>
  // Respond to Challenge (RFC 8555 Section 7.5.1)
  server.route({
    method: "POST",
    url: "/profiles/:profileId/authorizations/:authzId/challenges/:challengeId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiAcme],
      description: "ACME Respond to Challenge - let ACME server know challenge is ready",
      params: SharedParamsSchema.extend({
        authzId: z.string().uuid(),
        challengeId: z.string().uuid()
      }),
      response: {
        200: RespondToAcmeChallengeResponseSchema
      }
    },
    handler: async (req, res) => {
      const { profileId, accountId } = await validateExistingAccount({
        req,
        schema: RespondToAcmeChallengeBodySchema
      });
      return sendAcmeResponse(
        res,
        profileId,
        await server.services.pkiAcme.respondToAcmeChallenge({
          profileId,
          accountId,
          authzId: req.params.authzId,
          challengeId: req.params.challengeId
        })
      );
    }
  });
};
