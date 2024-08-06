import ms from "ms";
import { z } from "zod";

import { CertificateAuthoritiesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATE_AUTHORITIES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-types";
import {
  validateAltNamesField,
  validateCaDateField
} from "@app/services/certificate-authority/certificate-authority-validators";

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
      body: z
        .object({
          projectSlug: z.string().trim().describe(CERTIFICATE_AUTHORITIES.CREATE.projectSlug),
          type: z.nativeEnum(CaType).describe(CERTIFICATE_AUTHORITIES.CREATE.type),
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
            .describe(CERTIFICATE_AUTHORITIES.CREATE.keyAlgorithm)
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
          ca: CertificateAuthoritiesSchema
        })
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.CREATE_CA,
          metadata: {
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
      description: "Get CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET.caId)
      }),
      response: {
        200: z.object({
          ca: CertificateAuthoritiesSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.certificateAuthority.getCaById({
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
    method: "PATCH",
    url: "/:caId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.UPDATE.caId)
      }),
      body: z.object({
        status: z.enum([CaStatus.ACTIVE, CaStatus.DISABLED]).optional().describe(CERTIFICATE_AUTHORITIES.UPDATE.status)
      }),
      response: {
        200: z.object({
          ca: CertificateAuthoritiesSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.certificateAuthority.updateCaById({
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
          type: EventType.UPDATE_CA,
          metadata: {
            caId: ca.id,
            dn: ca.dn,
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
      description: "Delete CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.DELETE.caId)
      }),
      response: {
        200: z.object({
          ca: CertificateAuthoritiesSchema
        })
      }
    },
    handler: async (req) => {
      const ca = await server.services.certificateAuthority.deleteCaById({
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
      const { ca, csr } = await server.services.certificateAuthority.getCaCsr({
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
    method: "GET",
    url: "/:caId/certificate",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get cert and cert chain of a CA",
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
      const { certificate, certificateChain, serialNumber, ca } = await server.services.certificateAuthority.getCaCert({
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
        await server.services.certificateAuthority.signIntermediate({
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
      const { ca } = await server.services.certificateAuthority.importCertToCa({
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

  server.route({
    method: "POST",
    url: "/:caId/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue certificate from CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.ISSUE_CERT.caId)
      }),
      body: z
        .object({
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
    url: "/:caId/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Sign certificate from CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.SIGN_CERT.caId)
      }),
      body: z
        .object({
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

      return {
        certificate,
        certificateChain,
        issuingCaCertificate,
        serialNumber
      };
    }
  });
};
