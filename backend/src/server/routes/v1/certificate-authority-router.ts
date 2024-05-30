import { z } from "zod";

import { CertificateAuthoritiesSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-types";
import { validateCaDateField } from "@app/services/certificate-authority/certificate-authority-validators";

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
          projectSlug: z.string().trim(),
          type: z.enum([CaType.ROOT, CaType.INTERMEDIATE]),
          commonName: z.string().trim(),
          organization: z.string().trim(),
          ou: z.string().trim(),
          country: z.string().trim(),
          province: z.string().trim(),
          locality: z.string().trim(),
          // format: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format
          notBefore: validateCaDateField.optional(),
          notAfter: validateCaDateField.optional(),
          maxPathLength: z.number().min(-1).default(-1),
          keyAlgorithm: z
            .enum([
              CertKeyAlgorithm.RSA_2048,
              CertKeyAlgorithm.RSA_4096,
              CertKeyAlgorithm.ECDSA_P256,
              CertKeyAlgorithm.ECDSA_P384
            ])
            .default(CertKeyAlgorithm.RSA_2048)
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
        caId: z.string().trim()
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
        caId: z.string().trim()
      }),
      body: z.object({
        status: z.enum([CaStatus.ACTIVE, CaStatus.DISABLED]).optional()
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
        caId: z.string().trim()
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
    url: "/:caId/certificate",
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
          certificateChain: z.string(),
          serialNumber: z.string()
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, serialNumber } = await server.services.certificateAuthority.getCaCert({
        caId: req.params.caId,
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
        caId: z.string().trim()
      }),
      body: z.object({
        csr: z.string().trim(),
        notBefore: validateCaDateField.optional(),
        notAfter: validateCaDateField,
        maxPathLength: z.number().min(-1).default(-1)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim(),
          certificateChain: z.string().trim(),
          issuingCaCertificate: z.string().trim(),
          serialNumber: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, issuingCaCertificate, serialNumber } =
        await server.services.certificateAuthority.signIntermediate({
          caId: req.params.caId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.body
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
        caId: z.string().trim()
      }),
      body: z.object({
        certificate: z.string().trim(),
        certificateChain: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string().trim(),
          caId: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      await server.services.certificateAuthority.importCertToCa({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
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
        caId: z.string().trim()
      }),
      body: z
        .object({
          commonName: z.string().trim().min(1),
          ttl: z.number().int().min(0).optional(),
          notBefore: validateCaDateField.optional(),
          notAfter: validateCaDateField.optional()
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
          certificate: z.string().trim(),
          issuingCaCertificate: z.string().trim(),
          certificateChain: z.string().trim(),
          privateKey: z.string().trim(),
          serialNumber: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { certificate, certificateChain, issuingCaCertificate, privateKey, serialNumber } =
        await server.services.certificateAuthority.issueCertFromCa({
          caId: req.params.caId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.body
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
    method: "GET",
    url: "/:caId/crl",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get CRL of the CA",
      params: z.object({
        caId: z.string().trim()
      }),
      response: {
        200: z.object({
          crl: z.string()
        })
      }
    },
    handler: async (req) => {
      const { crl } = await server.services.certificateAuthority.getCaCrl({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return {
        crl
      };
    }
  });
};
