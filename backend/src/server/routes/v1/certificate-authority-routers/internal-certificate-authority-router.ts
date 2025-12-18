import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATE_AUTHORITIES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CaRenewalType, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { validateCaDateField } from "@app/services/certificate-authority/certificate-authority-validators";
import {
  CreateInternalCertificateAuthoritySchema,
  InternalCertificateAuthoritySchema,
  UpdateInternalCertificateAuthoritySchema
} from "@app/services/certificate-authority/internal/internal-certificate-authority-schemas";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerInternalCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.INTERNAL,
    server,
    responseSchema: InternalCertificateAuthoritySchema,
    createSchema: CreateInternalCertificateAuthoritySchema,
    updateSchema: UpdateInternalCertificateAuthoritySchema
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
          serialNumber: z.string().trim().describe(CERTIFICATE_AUTHORITIES.RENEW_CA_CERT.serialNumber),
          certId: z.string().describe("Certificate ID")
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, certId, ca } =
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
        serialNumber,
        certId
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:caId/certificate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Generate certificate for a Certificate Authority",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.caId)
      }),
      body: z.object({
        notBefore: validateCaDateField.describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.notBefore),
        notAfter: validateCaDateField.describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.notAfter),
        maxPathLength: z
          .number()
          .min(-1)
          .default(-1)
          .describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.maxPathLength),
        parentCaId: z.string().trim().optional().describe("Parent CA ID for intermediate certificate generation")
      }),
      response: {
        200: z.object({
          certificate: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.certificate),
          certificateChain: z
            .string()
            .trim()
            .describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.certificateChain),
          serialNumber: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GENERATE_CA_CERTIFICATE.serialNumber),
          certId: z.string().describe("Certificate ID")
        })
      }
    },
    handler: async (req) => {
      const { parentCaId, ...certificateData } = req.body;

      let certificate: string;
      let certificateChain: string;
      let serialNumber: string;
      let certId: string;
      let ca: { id: string; dn: string; projectId: string };

      if (parentCaId) {
        const intermediateCert = await server.services.internalCertificateAuthority.generateIntermediateCaCertificate({
          caId: req.params.caId,
          parentCaId,
          notBefore: certificateData.notBefore,
          notAfter: certificateData.notAfter,
          maxPathLength: certificateData.maxPathLength,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

        certificate = intermediateCert.certificate;
        certificateChain = intermediateCert.certificateChain;
        serialNumber = intermediateCert.serialNumber;
        certId = intermediateCert.certId;

        ca = await server.services.internalCertificateAuthority.getCaById({
          caId: req.params.caId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });
      } else {
        const rootCert = await server.services.internalCertificateAuthority.generateRootCaCertificate({
          caId: req.params.caId,
          notBefore: certificateData.notBefore,
          notAfter: certificateData.notAfter,
          maxPathLength: certificateData.maxPathLength,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

        certificate = rootCert.certificate;
        certificateChain = rootCert.certificateChain;
        serialNumber = rootCert.serialNumber;
        certId = rootCert.certId;
        ca = rootCert.ca;
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GENERATE_CA_CERTIFICATE,
          metadata: {
            caId: ca.id,
            dn: ca.dn,
            serialNumber,
            ...(parentCaId && { parentCaId })
          }
        }
      });

      return {
        certificate,
        certificateChain,
        serialNumber,
        certId
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
            certId: z.string().describe("Certificate ID"),
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
    url: "/:caId/certificate",
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
          serialNumber: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.serialNumber),
          certId: z.string().describe("Certificate ID")
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, certId, ca } =
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
        serialNumber,
        certId
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:caId/certificate/:certId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get a specific CA certificate by ID",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CERT.caId),
        certId: z.string().trim().describe("Certificate ID to retrieve")
      }),
      response: {
        200: z.object({
          certificate: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.certificate),
          certificateChain: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.certificateChain),
          serialNumber: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CERT.serialNumber),
          certId: z.string().describe("Certificate ID")
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber, certId, ca } =
        await server.services.internalCertificateAuthority.getCaCertByIdWithAuth({
          caId: req.params.caId,
          certId: req.params.certId,
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
        serialNumber,
        certId
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

  server.route({
    method: "GET",
    url: "/:caId/crls",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
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

      void res.header("Content-Type", "application/pkix-cert");

      return Buffer.from(caCert.rawData);
    }
  });
};
