/* eslint-disable @typescript-eslint/no-floating-promises */
import { z } from "zod";

import { CertificateTemplatesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATE_AUTHORITIES } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  CaRenewalType,
  CaStatus,
  InternalCaType
} from "@app/services/certificate-authority/certificate-authority-enums";
import {
  validateAltNamesField,
  validateCaDateField
} from "@app/services/certificate-authority/certificate-authority-validators";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { InternalCertificateAuthorityResponseSchema } from "../sanitizedSchemas";

export const registerCaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Create CA",
      body: z
        .object({
          projectSlug: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.projectSlug),
          type: z.nativeEnum(InternalCaType).describe(CERTIFICATE_AUTHORITIES.CREATE.type),
          friendlyName: z.string().optional().describe(CERTIFICATE_AUTHORITIES.CREATE.friendlyName),
          commonName: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.commonName),
          organization: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.organization),
          ou: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.ou),
          country: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.country),
          province: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.province),
          locality: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.locality),
          // format: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format
          notBefore: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.CREATE.notBefore),
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.CREATE.notAfter),
          maxPathLength: z.number().min(-1).default(-1).describe(CERTIFICATE_AUTHORITIES.CREATE.maxPathLength),
          keyAlgorithm: z
            .nativeEnum(CertKeyAlgorithm)
            .default(CertKeyAlgorithm.RSA_2048)
            .describe(CERTIFICATE_AUTHORITIES.CREATE.keyAlgorithm),
          requireTemplateForIssuance: z
            .boolean()
            .default(false)
            .describe(CERTIFICATE_AUTHORITIES.CREATE.requireTemplateForIssuance)
        })
        .refine(
          (data) => {
            // Check that at least one of the specified fields is non-empty
            return [data.commonName, data.organization, data.ou, data.country, data.province, data.locality].some(
              (field) => field !== ""
            );
          },
          {
            message:
              "At least one of the fields commonName, organization, ou, country, province, or locality must be non-empty",
            path: []
          }
        ),
      response: {
        200: z.object({
          ca: InternalCertificateAuthorityResponseSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.internalCertificateAuthority.createCa({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        isInternal: false,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.CREATE_CA,
          metadata: {
            name: ca.name,
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return {
        ca
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:caId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET.caId)
      }),
      response: {
        200: z.object({
          ca: InternalCertificateAuthorityResponseSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.internalCertificateAuthority.getCaById({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA,
          metadata: {
            caId: ca.id,
            name: ca.name,
            dn: ca.dn
          }
        }
      });

      return {
        ca
      };
    }
  });

  // this endpoint will be used to serve the CA certificate when a client makes a request
  // against the Authority Information Access CA Issuer URL
  server.route({
    method: "GET",
    url: "/:caId/certificates/:caCertId/der",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get DER-encoded certificate of CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CERT_BY_ID.caId),
        caCertId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CERT_BY_ID.caCertId)
      }),
      response: {
        200: z.instanceof(Buffer)
      }
    },
    handler: async (req, res) => {
      const caCert = await server.services.internalCertificateAuthority.getCaCertById(req.params);

      res.header("Content-Type", "application/pkix-cert");

      return Buffer.from(caCert.rawData);
    }
  });

  server.route({
    method: "PATCH",
    url: "/:caId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Update CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.UPDATE.caId)
      }),
      body: z.object({
        status: z.enum([CaStatus.ACTIVE, CaStatus.DISABLED]).optional().describe(CERTIFICATE_AUTHORITIES.UPDATE.status),
        requireTemplateForIssuance: z
          .boolean()
          .optional()
          .describe(CERTIFICATE_AUTHORITIES.CREATE.requireTemplateForIssuance)
      }),
      response: {
        200: z.object({
          ca: InternalCertificateAuthorityResponseSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.internalCertificateAuthority.updateCaById({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        isInternal: false,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.UPDATE_CA,
          metadata: {
            caId: ca.id,
            dn: ca.dn,
            name: ca.name,
            status: ca.status as CaStatus
          }
        }
      });

      return {
        ca
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:caId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Delete CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.DELETE.caId)
      }),
      response: {
        200: z.object({
          ca: InternalCertificateAuthorityResponseSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.internalCertificateAuthority.deleteCaById({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.DELETE_CA,
          metadata: {
            name: ca.name,
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return {
        ca
      };
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get CA CSR",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CSR.caId)
      }),
      response: {
        200: z.object({
          csr: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CSR.csr)
        })
      }
    },
    handler: async (req) => {
      const { ca, csr } = await server.services.internalCertificateAuthority.getCaCsr({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA_CSR,
          metadata: {
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return {
        csr
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:caId/renew",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Perform CA certificate renewal",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.caId)
      }),
      body: z.object({
        type: z.nativeEnum(CaRenewalType).describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.type),
        notAfter: validateCaDateField.describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.notAfter)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.certificate),
          certificateChain: z.string().trim().describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.certificateChain),
          serialNumber: z.string().trim().describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, ca } =
        await server.services.internalCertificateAuthority.renewCaCert({
          caId: req.params.caId,
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
          type: EventType.RENEW_CA,
          metadata: {
            caId: ca.id,
            dn: ca.dn
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
    method: "GET",
    url: "/:caId/ca-certificates",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get list of past and current CA certificates for a CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CA_CERTS.caId)
      }),
      response: {
        200: z.array(
          z.object({
            certificate: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CA_CERTS.certificate),
            certificateChain: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CA_CERTS.certificateChain),
            serialNumber: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CA_CERTS.serialNumber),
            version: z.number().describe(CERTIFICATE_AUTHORITIES.GET_CA_CERTS.version)
          })
        )
      }
    },
    handler: async (req) => {
      const { caCerts, ca } = await server.services.internalCertificateAuthority.getCaCerts({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA_CERTS,
          metadata: {
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return caCerts;
    }
  });

  server.route({
    method: "GET",
    url: "/:caId/certificate", // TODO: consider updating endpoint structure considering CA certificates
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get current CA cert and cert chain of a CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CERT.caId)
      }),
      response: {
        200: z.object({
          certificate: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.certificate),
          certificateChain: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.certificateChain),
          serialNumber: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, ca } =
        await server.services.internalCertificateAuthority.getCaCert({
          caId: req.params.caId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA_CERT,
          metadata: {
            caId: ca.id,
            dn: ca.dn
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
    url: "/:caId/sign-intermediate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Create intermediate CA certificate from parent CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.caId)
      }),
      body: z.object({
        csr: z.string().trim().min(1).describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.csr),
        notBefore: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.notBefore),
        notAfter: validateCaDateField.describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.notAfter),
        maxPathLength: z.number().min(-1).default(-1).describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.maxPathLength)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.certificate),
          certificateChain: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.certificateChain),
          issuingCaCertificate: z
            .string()
            .trim()
            .describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.issuingCaCertificate),
          serialNumber: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_INTERMEDIATE.serialNumber)
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, issuingCaCertificate, serialNumber, ca } =
        await server.services.internalCertificateAuthority.signIntermediate({
          caId: req.params.caId,
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
          type: EventType.SIGN_INTERMEDIATE,
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
        serialNumber
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:caId/import-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Import certificate and chain to CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.IMPORT_CERT.caId)
      }),
      body: z.object({
        certificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.IMPORT_CERT.certificate),
        certificateChain: z.string().trim().describe(CERTIFICATE_AUTHORITIES.IMPORT_CERT.certificateChain)
      }),
      response: {
        200: z.object({
          message: z.string().trim(),
          caId: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { ca } = await server.services.internalCertificateAuthority.importCertToCa({
        caId: req.params.caId,
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
          type: EventType.IMPORT_CA_CERT,
          metadata: {
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return {
        message: "Successfully imported certificate to CA",
        caId: req.params.caId
      };
    }
  });

  // TODO: DEPRECATE
  server.route({
    method: "POST",
    url: "/:caId/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Issue certificate from CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.caId)
      }),
      body: z
        .object({
          pkiCollectionId: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.pkiCollectionId),
          friendlyName: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.friendlyName),
          commonName: z.string().trim().min(1).describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.commonName),
          altNames: validateAltNamesField.describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.altNames),
          ttl: z
            .string()
            .refine((val) => ms(val) > 0, "TTL must be a positive number")
            .describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.ttl),
          notBefore: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.notBefore),
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.notAfter),
          keyUsages: z.nativeEnum(CertKeyUsage).array().optional(),
          extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional()
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
      const response = await server.services.internalCertificateAuthority.issueCertFromCa({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      const { certificate, certificateChain, issuingCaCertificate, privateKey, serialNumber, ca } = response;

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
        organizationId: req.permission.orgId,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          caId: ca.id,
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

  // TODO: DEPRECATE
  server.route({
    method: "POST",
    url: "/:caId/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Sign certificate from CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.caId)
      }),
      body: z
        .object({
          csr: z.string().trim().min(1).describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.csr),
          pkiCollectionId: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.pkiCollectionId),
          friendlyName: z.string().trim().optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.friendlyName),
          commonName: z.string().trim().min(1).optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.commonName),
          altNames: validateAltNamesField.describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.altNames),
          ttl: z
            .string()
            .refine((val) => ms(val) > 0, "TTL must be a positive number")
            .describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.ttl),
          notBefore: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.notBefore),
          notAfter: validateCaDateField.optional().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.notAfter),
          keyUsages: z.nativeEnum(CertKeyUsage).array().optional(),
          extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional()
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
          caId: req.params.caId,
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
        organizationId: req.permission.orgId,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          caId: ca.id,
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

  // TODO: DEPRECATE
  server.route({
    method: "GET",
    url: "/:caId/certificate-templates",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get list of certificate templates for the CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.caId)
      }),
      response: {
        200: z.object({
          certificateTemplates: CertificateTemplatesSchema.array()
        })
      }
    },
    handler: async (req) => {
      const { certificateTemplates, ca } = await server.services.internalCertificateAuthority.getCaCertificateTemplates(
        {
          caId: req.params.caId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        }
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA_CERTIFICATE_TEMPLATES,
          metadata: {
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return {
        certificateTemplates
      };
    }
  });

  // TODO: DEPRECATE
  server.route({
    method: "GET",
    url: "/:caId/crls",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get list of CRLs of the CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CRLS.caId)
      }),
      response: {
        200: z.array(
          z.object({
            id: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CRLS.id),
            crl: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CRLS.crl)
          })
        )
      }
    },
    handler: async (req) => {
      const { ca, crls } = await server.services.certificateAuthorityCrl.getCaCrls({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA_CRLS,
          metadata: {
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return crls;
    }
  });

  // TODO: implement this endpoint in the future
  // server.route({
  //   method: "GET",
  //   url: "/:caId/crl/rotate",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   schema: {
  //     description: "Rotate CRLs of the CA",
  //     params: z.object({
  //       caId: z.string().trim()
  //     }),
  //     response: {
  //       200: z.object({
  //         message: z.string()
  //       })
  //     }
  //   },
  //   handler: async (req) => {
  //     await server.services.certificateAuthority.rotateCaCrl({
  //       caId: req.params.caId,
  //       actor: req.permission.type,
  //       actorId: req.permission.id,
  //       actorAuthMethod: req.permission.authMethod,
  //       actorOrgId: req.permission.orgId
  //     });
  //     return {
  //       message: "Successfully rotated CA CRL"
  //     };
  //   }
  // });
};
