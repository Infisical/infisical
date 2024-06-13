import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATES } from "@app/lib/api-docs";
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
        serialNumber: z.string().trim().describe(CERTIFICATES.GET.serialNumber)
      }),
      response: {
        200: z.object({
          certificate: CertificatesSchema
        })
      }
    },
    handler: async (req) => {
      const { cert, ca } = await server.services.certificate.getCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      return {
        certificate: cert
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
        serialNumber: z.string().trim().describe(CERTIFICATES.REVOKE.serialNumber)
      }),
      body: z.object({
        revocationReason: z.nativeEnum(CrlReason).describe(CERTIFICATES.REVOKE.revocationReason)
      }),
      response: {
        200: z.object({
          message: z.string().trim(),
          serialNumber: z.string().trim().describe(CERTIFICATES.REVOKE.serialNumberRes),
          revokedAt: z.date().describe(CERTIFICATES.REVOKE.revokedAt)
        })
      }
    },
    handler: async (req) => {
      const { revokedAt, cert, ca } = await server.services.certificate.revokeCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.REVOKE_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
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
        serialNumber: z.string().trim().describe(CERTIFICATES.DELETE.serialNumber)
      }),
      response: {
        200: z.object({
          certificate: CertificatesSchema
        })
      }
    },
    handler: async (req) => {
      const { deletedCert, ca } = await server.services.certificate.deleteCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.DELETE_CERT,
          metadata: {
            certId: deletedCert.id,
            cn: deletedCert.commonName,
            serialNumber: deletedCert.serialNumber
          }
        }
      });

      return {
        certificate: deletedCert
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
      description: "Get certificate body of certificate",
      params: z.object({
        serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumber)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.GET_CERT.certificate),
          certificateChain: z.string().trim().describe(CERTIFICATES.GET_CERT.certificateChain),
          serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumberRes)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, cert, ca } = await server.services.certificate.getCertBody({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.DELETE_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      return {
        certificate,
        certificateChain,
        serialNumber
      };
    }
  });
};
