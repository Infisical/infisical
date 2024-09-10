import ms from "ms";
import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATE_AUTHORITIES, CERTIFICATES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CrlReason } from "@app/services/certificate/certificate-types";
import {
  validateAltNamesField,
  validateCaDateField
} from "@app/services/certificate-authority/certificate-authority-validators";

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
    url: "/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue certificate",
      body: z
        .object({
          caId: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.caId),
          certificateTemplateId: z
            .string()
            .trim()
            .optional()
            .describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.certificateTemplateId),
          pkiCollectionId: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.pkiCollectionId),
          friendlyName: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.friendlyName),
          commonName: z.string().trim().min(1).describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.commonName),
          altNames: validateAltNamesField.describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.altNames),
          ttl: z
            .string()
            .refine((val) => ms(val) > 0, "TTL must be a positive number")
            .describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.ttl),
          notBefore: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.notBefore),
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.notAfter)
        })
        .refine(
          (data) => {
            const { ttl, notAfter } = data;
            return (ttl !== undefined && notAfter === undefined) || (ttl === undefined && notAfter !== undefined);
          },
          {
            message: "Either ttl or notAfter must be present, but not both",
            path: ["ttl", "notAfter"]
          }
        )
        .refine(
          (data) =>
            (data.caId !== undefined && data.certificateTemplateId === undefined) ||
            (data.caId === undefined && data.certificateTemplateId !== undefined),
          {
            message: "Either CA ID or Certificate Template ID must be present, but not both",
            path: ["caId", "certificateTemplateId"]
          }
        ),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.certificate),
          issuingCaCertificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.issuingCaCertificate),
          certificateChain: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.certificateChain),
          privateKey: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.privateKey),
          serialNumber: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, issuingCaCertificate, privateKey, serialNumber, ca } =
        await server.services.certificateAuthority.issueCertFromCa({
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
          type: EventType.ISSUE_CERT,
          metadata: {
            caId: ca.id,
            dn: ca.dn,
            serialNumber
          }
        }
      });

      return {
        certificate,
        certificateChain,
        issuingCaCertificate,
        privateKey,
        serialNumber
      };
    }
  });

  server.route({
    method: "POST",
    url: "/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Sign certificate",
      body: z
        .object({
          caId: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.caId),
          certificateTemplateId: z
            .string()
            .trim()
            .optional()
            .describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.certificateTemplateId),
          pkiCollectionId: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.pkiCollectionId),
          csr: z.string().trim().min(1).describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.csr),
          friendlyName: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.friendlyName),
          commonName: z.string().trim().min(1).optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.commonName),
          altNames: validateAltNamesField.describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.altNames),
          ttl: z
            .string()
            .refine((val) => ms(val) > 0, "TTL must be a positive number")
            .describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.ttl),
          notBefore: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.notBefore),
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.notAfter)
        })
        .refine(
          (data) => {
            const { ttl, notAfter } = data;
            return (ttl !== undefined && notAfter === undefined) || (ttl === undefined && notAfter !== undefined);
          },
          {
            message: "Either ttl or notAfter must be present, but not both",
            path: ["ttl", "notAfter"]
          }
        )
        .refine(
          (data) =>
            (data.caId !== undefined && data.certificateTemplateId === undefined) ||
            (data.caId === undefined && data.certificateTemplateId !== undefined),
          {
            message: "Either CA ID or Certificate Template ID must be present, but not both",
            path: ["caId", "certificateTemplateId"]
          }
        ),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.certificate),
          issuingCaCertificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.issuingCaCertificate),
          certificateChain: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.certificateChain),
          serialNumber: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, issuingCaCertificate, serialNumber, ca } =
        await server.services.certificateAuthority.signCertFromCa({
          isInternal: false,
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
          type: EventType.SIGN_CERT,
          metadata: {
            caId: ca.id,
            dn: ca.dn,
            serialNumber
          }
        }
      });

      return {
        certificate: certificate.toString("pem"),
        certificateChain,
        issuingCaCertificate,
        serialNumber
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
