import { z } from "zod";

import { CertificateTemplatesSchema } from "@app/db/schemas/certificate-templates";
import { ApiDocsTags } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  validateAltNamesField,
  validateCaDateField
} from "@app/services/certificate-authority/certificate-authority-validators";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

export const registerPkiTemplatesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createPkiTemplate",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      body: z.object({
        name: slugSchema(),
        caName: slugSchema({ field: "caName" }),
        projectId: z.string(),
        commonName: validateTemplateRegexField,
        subjectAlternativeName: validateTemplateRegexField,
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        keyUsages: z
          .nativeEnum(CertKeyUsage)
          .array()
          .optional()
          .default([CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT]),
        extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional().default([])
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.pkiTemplate.createTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:templateName",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updatePkiTemplate",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        templateName: slugSchema()
      }),
      body: z.object({
        name: slugSchema().optional(),
        caName: slugSchema(),
        projectId: z.string(),
        commonName: validateTemplateRegexField.optional(),
        subjectAlternativeName: validateTemplateRegexField.optional(),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional(),
        keyUsages: z
          .nativeEnum(CertKeyUsage)
          .array()
          .optional()
          .default([CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT]),
        extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional().default([])
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.pkiTemplate.updateTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        templateName: req.params.templateName,
        ...req.body
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:templateName",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deletePkiTemplate",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        templateName: z.string().min(1)
      }),
      body: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.pkiTemplate.deleteTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        templateName: req.params.templateName,
        projectId: req.body.projectId
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "GET",
    url: "/:templateName",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getPkiTemplate",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        templateName: slugSchema()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesSchema.extend({
            ca: z.object({ id: z.string(), name: z.string() })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.pkiTemplate.getTemplateByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        templateName: req.params.templateName,
        projectId: req.query.projectId
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listPkiTemplates",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      querystring: z.object({
        projectId: z.string(),
        limit: z.coerce.number().default(100),
        offset: z.coerce.number().default(0)
      }),
      response: {
        200: z.object({
          certificateTemplates: CertificateTemplatesSchema.extend({
            ca: z.object({ id: z.string(), name: z.string() })
          }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplates, totalCount } = await server.services.pkiTemplate.listTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return { certificateTemplates, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:templateName/issue-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "issueCertificateFromTemplate",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        templateName: slugSchema()
      }),
      body: z.object({
        projectId: z.string(),
        commonName: validateTemplateRegexField,
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        keyUsages: z.nativeEnum(CertKeyUsage).array().optional(),
        extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsage).array().optional(),
        notBefore: validateCaDateField.optional(),
        notAfter: validateCaDateField.optional(),
        altNames: validateAltNamesField
      }),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.pkiTemplate.issueCertificate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        templateName: req.params.templateName,
        ...req.body
      });

      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/:templateName/sign-certificate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "signCertificateFromTemplate",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        templateName: slugSchema()
      }),
      body: z.object({
        projectId: z.string(),
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        csr: z.string().trim().min(1).max(4096)
      }),
      response: {
        200: z.object({
          certificate: z.string().trim(),
          issuingCaCertificate: z.string().trim(),
          certificateChain: z.string().trim(),
          serialNumber: z.string().trim()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.pkiTemplate.signCertificate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        templateName: req.params.templateName,
        ...req.body
      });

      return data;
    }
  });
};
