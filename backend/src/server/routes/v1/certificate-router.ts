import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CrlReason } from "@app/services/certificate/certificate-types";

export const registerCertRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:serialNumber",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get certificate",
      params: z.object({
        serialNumber: z.string().trim()
      }),
      response: {
        200: z.object({
          certificate: CertificatesSchema
        })
      }
    },
    handler: async (req) => {
      const certificate = await server.services.certificate.getCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return {
        certificate
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:serialNumber/revoke",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Revoke",
      params: z.object({
        serialNumber: z.string().trim()
      }),
      body: z.object({
        revocationReason: z.enum([
          CrlReason.UNSPECIFIED,
          CrlReason.KEY_COMPROMISE,
          CrlReason.CA_COMPROMISE,
          CrlReason.AFFILIATION_CHANGED,
          CrlReason.SUPERSEDED,
          CrlReason.CESSATION_OF_OPERATION,
          CrlReason.CERTIFICATE_HOLD,
          CrlReason.PRIVILEGE_WITHDRAWN,
          CrlReason.A_A_COMPROMISE
        ])
      }),
      response: {
        200: z.object({
          message: z.string().trim(),
          serialNumber: z.string().trim(),
          revokedAt: z.date()
        })
      }
    },
    handler: async (req) => {
      const { revokedAt } = await server.services.certificate.revokeCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return {
        message: "Successfully revoked certificate",
        serialNumber: req.params.serialNumber,
        revokedAt
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:serialNumber",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete certificate",
      params: z.object({
        serialNumber: z.string().trim()
      }),
      response: {
        200: z.object({
          certificate: CertificatesSchema
        })
      }
    },
    handler: async (req) => {
      const certificate = await server.services.certificate.deleteCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return {
        certificate
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:serialNumber/certificate",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get certificate of certificate",
      params: z.object({
        serialNumber: z.string().trim()
      }),
      response: {
        200: z.object({
          certificate: z.string().trim(),
          certificateChain: z.string().trim(),
          serialNumber: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber } = await server.services.certificate.getCertCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return {
        certificate,
        certificateChain,
        serialNumber
      };
    }
  });
};
