import { z } from "zod";

import { CertificateAuthoritiesSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CAType } from "@app/services/certificate-authority/certificate-authority-types";

export const registerCaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create CA",
      body: z.object({
        projectSlug: z.string().trim(),
        type: z.enum([CAType.ROOT, CAType.INTERMEDIATE]),
        commonName: z.string().trim(),
        organization: z.string().trim(),
        ou: z.string().trim(),
        country: z.string().trim(),
        province: z.string().trim(),
        locality: z.string().trim()
      }),
      response: {
        200: CertificateAuthoritiesSchema
      }
    },
    handler: async (req) => {
      const ca = await server.services.certificateAuthority.createCa({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return ca;
    }
  });

  server.route({
    method: "GET",
    url: "/:caId/csr",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get CA CSR",
      params: z.object({
        caId: z.string().trim()
      }),
      response: {
        200: z.object({
          csr: z.string()
        })
      }
    },
    handler: async (req) => {
      const csr = await server.services.certificateAuthority.getCaCsr({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return {
        csr
      };
    }
  });

  server.route({
    method: "GET",
    url: ":caId/certificate",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get cert and cert chain of a CA",
      params: z.object({
        caId: z.string().trim()
      }),
      response: {
        200: z.object({
          certificate: z.string(),
          certificateChain: z.string()
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain } = await server.services.certificateAuthority.getCaCert({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return {
        certificate,
        certificateChain
      };
    }
  });

  server.route({
    method: "POST",
    url: ":caId/issue-certificate",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue (leaf) certificate from CA",
      params: z.object({
        caId: z.string().trim()
      }),
      body: z.object({
        csr: z.string().trim(),
        notBefore: z.string().trim(),
        notAfter: z.string().trim()
      }),
      response: {
        200: z.object({
          certificateId: z.string().trim()
        })
      }
    },
    handler: async () => {
      // await server.services.certificateAuthority.issueCertFromCa({
      //   caId: req.params.caId,
      //   actor: req.permission.type,
      //   actorId: req.permission.id,
      //   actorAuthMethod: req.permission.authMethod,
      //   actorOrgId: req.permission.orgId,
      //   ...req.body
      // });
      return {
        certificateId: "111"
      };
    }
  });

  // TODO 2: logic for creating intermediary ca
  // TODO 1: get certificate + certificate chain for the root and intermediary CA GET /ca/:caId/certificate
};
