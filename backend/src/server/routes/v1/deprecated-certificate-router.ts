/* eslint-disable @typescript-eslint/no-floating-promises */
import RE2 from "re2";
import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas/certificates";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATE_AUTHORITIES, CERTIFICATES } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyUsage, CrlReason } from "@app/services/certificate/certificate-types";
import {
  validateAltNamesField,
  validateCaDateField
} from "@app/services/certificate-authority/certificate-authority-validators";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerDeprecatedCertRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:serialNumber",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
      const { cert } = await server.services.certificate.getCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
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

  // TODO: In the future add support for other formats outside of PEM (such as DER). Adding a "format" query param may be best.
  server.route({
    method: "GET",
    url: "/:serialNumber/private-key",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate private key",
      params: z.object({
        serialNumber: z.string().trim().describe(CERTIFICATES.GET.serialNumber)
      }),
      response: {
        200: z.string().trim()
      }
    },
    handler: async (req, reply) => {
      const { cert, certPrivateKey } = await server.services.certificate.getCertPrivateKey({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT_PRIVATE_KEY,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      addNoCacheHeaders(reply);

      return certPrivateKey;
    }
  });

  // TODO: In the future add support for other formats outside of PEM (such as DER). Adding a "format" query param may be best.
  server.route({
    method: "GET",
    url: "/:serialNumber/bundle",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate bundle including the certificate, chain, and private key.",
      params: z.object({
        serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumber)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.GET_CERT.certificate),
          certificateChain: z.string().trim().nullable().describe(CERTIFICATES.GET_CERT.certificateChain),
          privateKey: z.string().trim().nullable().describe(CERTIFICATES.GET_CERT.privateKey),
          serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumberRes)
        })
      }
    },
    handler: async (req, reply) => {
      const { certificate, certificateChain, serialNumber, cert, privateKey } =
        await server.services.certificate.getCertBundle({
          serialNumber: req.params.serialNumber,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT_BUNDLE,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      addNoCacheHeaders(reply);

      return {
        certificate,
        certificateChain,
        serialNumber,
        privateKey
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.notAfter),
          keyUsages: z
            .nativeEnum(CertKeyUsage)
            .array()
            .optional()
            .describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.keyUsages),
          extendedKeyUsages: z
            .nativeEnum(CertExtendedKeyUsage)
            .array()
            .optional()
            .describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.extendedKeyUsages)
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
        await server.services.internalCertificateAuthority.issueCertFromCa({
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.IssueCert,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          caId: req.body.caId,
          certificateTemplateId: req.body.certificateTemplateId,
          commonName: req.body.commonName,
          ...req.auditLogInfo
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
    url: "/import-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      description: "Import certificate",
      body: z.object({
        projectSlug: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.projectSlug),

        certificatePem: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.certificatePem),
        privateKeyPem: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.privateKeyPem),
        chainPem: z.string().trim().min(1).describe(CERTIFICATES.IMPORT.chainPem),

        friendlyName: z.string().trim().optional().describe(CERTIFICATES.IMPORT.friendlyName),
        pkiCollectionId: z.string().trim().optional().describe(CERTIFICATES.IMPORT.pkiCollectionId)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.IMPORT.certificate),
          certificateChain: z.string().trim().describe(CERTIFICATES.IMPORT.certificateChain),
          privateKey: z.string().trim().describe(CERTIFICATES.IMPORT.privateKey),
          serialNumber: z.string().trim().describe(CERTIFICATES.IMPORT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, privateKey, serialNumber, cert } =
        await server.services.certificate.importCert({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.IMPORT_CERT,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber
          }
        }
      });

      return {
        certificate,
        certificateChain,
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.notAfter),
          keyUsages: z
            .nativeEnum(CertKeyUsage)
            .array()
            .optional()
            .describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.keyUsages),
          extendedKeyUsages: z
            .nativeEnum(CertExtendedKeyUsage)
            .array()
            .optional()
            .describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.extendedKeyUsages)
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
      const { certificate, certificateChain, issuingCaCertificate, serialNumber, ca, commonName } =
        await server.services.internalCertificateAuthority.signCertFromCa({
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SignCert,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          caId: req.body.caId,
          certificateTemplateId: req.body.certificateTemplateId,
          commonName,
          ...req.auditLogInfo
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
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
      const { deletedCert } = await server.services.certificate.deleteCert({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: deletedCert.projectId,
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificates],
      description: "Get certificate body of certificate",
      params: z.object({
        serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumber)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATES.GET_CERT.certificate),
          certificateChain: z.string().trim().nullable().describe(CERTIFICATES.GET_CERT.certificateChain),
          serialNumber: z.string().trim().describe(CERTIFICATES.GET_CERT.serialNumberRes)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, cert } = await server.services.certificate.getCertBody({
        serialNumber: req.params.serialNumber,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.GET_CERT_BODY,
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

  server.route({
    method: "POST",
    url: "/:serialNumber/pkcs12",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      tags: [ApiDocsTags.PkiCertificates],
      description: "Download certificate in PKCS12 format",
      params: z.object({
        serialNumber: z.string().trim().describe(CERTIFICATES.GET.serialNumber)
      }),
      body: z.object({
        password: z
          .string()
          .min(6, "Password must be at least 6 characters long")
          .describe("Password for the keystore (minimum 6 characters)"),
        alias: z.string().min(1, "Alias is required").describe("Alias for the certificate in the keystore")
      }),
      response: {
        200: z.any().describe("PKCS12 keystore as binary data")
      }
    },
    handler: async (req, reply) => {
      const { pkcs12Data, cert } = await server.services.certificate.getCertPkcs12({
        serialNumber: req.params.serialNumber,
        password: req.body.password,
        alias: req.body.alias,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cert.projectId,
        event: {
          type: EventType.EXPORT_CERT_PKCS12,
          metadata: {
            certId: cert.id,
            cn: cert.commonName,
            serialNumber: cert.serialNumber
          }
        }
      });

      addNoCacheHeaders(reply);
      reply.header("Content-Type", "application/octet-stream");
      reply.header(
        "Content-Disposition",
        `attachment; filename="certificate-${req.params.serialNumber.replace(new RE2("[^\\w.-]", "g"), "_")}.p12"`
      );

      return pkcs12Data;
    }
  });
};
