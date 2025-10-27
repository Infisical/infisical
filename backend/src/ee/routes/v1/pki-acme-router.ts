/* eslint-disable @typescript-eslint/no-floating-promises */
import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";

export const registerPkiAcmeRouter = async (server: FastifyZodProvider) => {
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
        200: z.object({
          newNonce: z.string(),
          newAccount: z.string(),
          newOrder: z.string(),
          revokeCert: z.string()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME directory endpoint
      // This endpoint should return the base URLs for ACME operations
      return {
        newNonce: `/api/v1/pki/acme/profiles/${req.params.profileId}/new-nonce`,
        newAccount: `/api/v1/pki/acme/profiles/${req.params.profileId}/new-account`,
        newOrder: `/api/v1/pki/acme/profiles/${req.params.profileId}/new-order`,
        revokeCert: `/api/v1/pki/acme/profiles/${req.params.profileId}/revoke-cert`
      };
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
        200: z.object({})
      }
    },
    handler: async (req, res) => {
      // FIXME: Implement ACME new nonce generation
      // Generate a new nonce, store it, and return it in the Replay-Nonce header
      const nonce = "FIXME-generate-nonce";
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
      params: z.object({
        profileId: z.string().uuid()
      }),
      body: z.object({
        contact: z.array(z.string()).optional(),
        termsOfServiceAgreed: z.boolean().optional(),
        onlyReturnExisting: z.boolean().optional(),
        externalAccountBinding: z
          .object({
            protected: z.string(),
            payload: z.string(),
            signature: z.string()
          })
          .optional()
      }),
      response: {
        201: z.object({
          status: z.string(),
          contact: z.array(z.string()).optional(),
          orders: z.string().optional(),
          accountUrl: z.string()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME new account registration
      // Use EAB authentication to find corresponding Infisical machine identity
      // Check permissions and return account information
      return {
        status: "valid",
        accountUrl: `/api/v1/pki/acme/profiles/${req.params.profileId}/accounts/FIXME-account-id`,
        contact: req.body.contact,
        orders: `/api/v1/pki/acme/profiles/${req.params.profileId}/accounts/FIXME-account-id/orders`
      };
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
      body: z.object({
        identifiers: z.array(
          z.object({
            type: z.string(),
            value: z.string()
          })
        ),
        notBefore: z.string().optional(),
        notAfter: z.string().optional()
      }),
      response: {
        201: z.object({
          status: z.string(),
          expires: z.string(),
          identifiers: z.array(
            z.object({
              type: z.string(),
              value: z.string()
            })
          ),
          authorizations: z.array(z.string()),
          finalize: z.string(),
          certificate: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME new order creation
      const orderId = "FIXME-order-id";
      return {
        status: "pending",
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        identifiers: req.body.identifiers,
        authorizations: req.body.identifiers.map(
          (id) => `/api/v1/pki/acme/profiles/${req.params.profileId}/authorizations/FIXME-authz-${id.value}`
        ),
        finalize: `/api/v1/pki/acme/profiles/${req.params.profileId}/orders/${orderId}/finalize`
      };
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
      body: z.object({
        status: z.literal("deactivated")
      }),
      response: {
        200: z.object({
          status: z.string()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME account deactivation
      return {
        status: "deactivated"
      };
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
        200: z.object({
          orders: z.array(z.string())
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME list orders
      return {
        orders: []
      };
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
        orderId: z.string()
      }),
      response: {
        200: z.object({
          status: z.string(),
          expires: z.string().optional(),
          identifiers: z.array(
            z.object({
              type: z.string(),
              value: z.string()
            })
          ),
          authorizations: z.array(z.string()),
          finalize: z.string(),
          certificate: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME get order
      return {
        status: "pending",
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        identifiers: [],
        authorizations: [],
        finalize: `/api/v1/pki/acme/profiles/${req.params.profileId}/orders/${req.params.orderId}/finalize`
      };
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
        orderId: z.string()
      }),
      body: z.object({
        csr: z.string()
      }),
      response: {
        200: z.object({
          status: z.string(),
          expires: z.string().optional(),
          identifiers: z.array(
            z.object({
              type: z.string(),
              value: z.string()
            })
          ),
          authorizations: z.array(z.string()),
          finalize: z.string(),
          certificate: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME finalize order
      return {
        status: "processing",
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        identifiers: [],
        authorizations: [],
        finalize: `/api/v1/pki/acme/profiles/${req.params.profileId}/orders/${req.params.orderId}/finalize`,
        certificate: `/api/v1/pki/acme/profiles/${req.params.profileId}/orders/${req.params.orderId}/certificate`
      };
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
        orderId: z.string()
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      // FIXME: Implement ACME certificate download
      // Return the certificate in PEM format
      const certificate = "FIXME-certificate-pem";
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
        authzId: z.string()
      }),
      response: {
        200: z.object({
          status: z.string(),
          expires: z.string().optional(),
          identifier: z.object({
            type: z.string(),
            value: z.string()
          }),
          challenges: z.array(
            z.object({
              type: z.string(),
              url: z.string(),
              status: z.string(),
              token: z.string(),
              validated: z.string().optional()
            })
          )
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME authorization retrieval
      return {
        status: "pending",
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        identifier: {
          type: "dns",
          value: "FIXME-domain-name"
        },
        challenges: [
          {
            type: "http-01",
            url: `/api/v1/pki/acme/profiles/${req.params.profileId}/authorizations/${req.params.authzId}/challenges/http-01`,
            status: "pending",
            token: "FIXME-challenge-token"
          }
        ]
      };
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
        authzId: z.string()
      }),
      response: {
        200: z.object({
          type: z.string(),
          url: z.string(),
          status: z.string(),
          token: z.string(),
          validated: z.string().optional(),
          error: z
            .object({
              type: z.string(),
              detail: z.string(),
              status: z.number()
            })
            .optional()
        })
      }
    },
    handler: async (req) => {
      // FIXME: Implement ACME challenge response
      // Trigger verification process
      return {
        type: "http-01",
        url: `/api/v1/pki/acme/profiles/${req.params.profileId}/authorizations/${req.params.authzId}/challenges/http-01`,
        status: "pending",
        token: "FIXME-challenge-token"
      };
    }
  });
};
