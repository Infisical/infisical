import { z } from "zod";

import { CertificateTemplateEstConfigsSchema } from "@app/db/schemas/certificate-template-est-configs";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATE_TEMPLATES } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { sanitizedCertificateTemplate } from "@app/services/certificate-template/certificate-template-schema";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

const sanitizedEstConfig = CertificateTemplateEstConfigsSchema.pick({
  id: true,
  certificateTemplateId: true,
  isEnabled: true,
  disableBootstrapCertValidation: true
});

export const registerDeprecatedCertificateTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        certificateTemplateId: z.string().describe(CERTIFICATE_TEMPLATES.GET.certificateTemplateId)
      }),
      response: {
        200: sanitizedCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.getCertTemplate({
        id: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return certificateTemplate;
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      body: z.object({
        caId: z.string().describe(CERTIFICATE_TEMPLATES.CREATE.caId),
        pkiCollectionId: z.string().optional().describe(CERTIFICATE_TEMPLATES.CREATE.pkiCollectionId),
        name: slugSchema().describe(CERTIFICATE_TEMPLATES.CREATE.name),
        commonName: validateTemplateRegexField.describe(CERTIFICATE_TEMPLATES.CREATE.commonName),
        subjectAlternativeName: validateTemplateRegexField.describe(
          CERTIFICATE_TEMPLATES.CREATE.subjectAlternativeName
        ),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .describe(CERTIFICATE_TEMPLATES.CREATE.ttl),
        keyUsages: z
          .nativeEnum(CertKeyUsage)
          .array()
          .optional()
          .default([CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT])
          .describe(CERTIFICATE_TEMPLATES.CREATE.keyUsages),
        extendedKeyUsages: z
          .nativeEnum(CertExtendedKeyUsage)
          .array()
          .optional()
          .default([])
          .describe(CERTIFICATE_TEMPLATES.CREATE.extendedKeyUsages)
      }),
      response: {
        200: sanitizedCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.createCertTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return certificateTemplate;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      body: z.object({
        caId: z.string().optional().describe(CERTIFICATE_TEMPLATES.UPDATE.caId),
        pkiCollectionId: z.string().optional().describe(CERTIFICATE_TEMPLATES.UPDATE.pkiCollectionId),
        name: slugSchema().optional().describe(CERTIFICATE_TEMPLATES.UPDATE.name),
        commonName: validateTemplateRegexField.optional().describe(CERTIFICATE_TEMPLATES.UPDATE.commonName),
        subjectAlternativeName: validateTemplateRegexField
          .optional()
          .describe(CERTIFICATE_TEMPLATES.UPDATE.subjectAlternativeName),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(CERTIFICATE_TEMPLATES.UPDATE.ttl),
        keyUsages: z.nativeEnum(CertKeyUsage).array().optional().describe(CERTIFICATE_TEMPLATES.UPDATE.keyUsages),
        extendedKeyUsages: z
          .nativeEnum(CertExtendedKeyUsage)
          .array()
          .optional()
          .describe(CERTIFICATE_TEMPLATES.UPDATE.extendedKeyUsages)
      }),
      params: z.object({
        certificateTemplateId: z.string().describe(CERTIFICATE_TEMPLATES.UPDATE.certificateTemplateId)
      }),
      response: {
        200: sanitizedCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.updateCertTemplate({
        ...req.body,
        id: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return certificateTemplate;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        certificateTemplateId: z.string().describe(CERTIFICATE_TEMPLATES.DELETE.certificateTemplateId)
      }),
      response: {
        200: sanitizedCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.deleteCertTemplate({
        id: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return certificateTemplate;
    }
  });

  server.route({
    method: "POST",
    url: "/:certificateTemplateId/est-config",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      description: "Create Certificate Template EST configuration",
      params: z.object({
        certificateTemplateId: z.string().trim()
      }),
      body: z
        .object({
          caChain: z.string().trim().optional(),
          passphrase: z.string().min(1),
          isEnabled: z.boolean().default(true),
          disableBootstrapCertValidation: z.boolean().default(false)
        })
        .refine(
          ({ caChain, disableBootstrapCertValidation }) =>
            disableBootstrapCertValidation || (!disableBootstrapCertValidation && caChain),
          "CA chain is required"
        ),
      response: {
        200: sanitizedEstConfig
      }
    },
    handler: async (req) => {
      const estConfig = await server.services.certificateTemplate.createEstConfiguration({
        certificateTemplateId: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: estConfig.projectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG,
          metadata: {
            certificateTemplateId: estConfig.certificateTemplateId,
            isEnabled: estConfig.isEnabled as boolean
          }
        }
      });

      return estConfig;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:certificateTemplateId/est-config",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      description: "Update Certificate Template EST configuration",
      params: z.object({
        certificateTemplateId: z.string().trim()
      }),
      body: z.object({
        caChain: z.string().trim().optional(),
        passphrase: z.string().min(1).optional(),
        disableBootstrapCertValidation: z.boolean().optional(),
        isEnabled: z.boolean().optional()
      }),
      response: {
        200: sanitizedEstConfig
      }
    },
    handler: async (req) => {
      const estConfig = await server.services.certificateTemplate.updateEstConfiguration({
        certificateTemplateId: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: estConfig.projectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG,
          metadata: {
            certificateTemplateId: estConfig.certificateTemplateId,
            isEnabled: estConfig.isEnabled as boolean
          }
        }
      });

      return estConfig;
    }
  });

  server.route({
    method: "GET",
    url: "/:certificateTemplateId/est-config",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      description: "Get Certificate Template EST configuration",
      params: z.object({
        certificateTemplateId: z.string().trim()
      }),
      response: {
        200: sanitizedEstConfig.extend({
          caChain: z.string()
        })
      }
    },
    handler: async (req) => {
      const estConfig = await server.services.certificateTemplate.getEstConfiguration({
        isInternal: false,
        certificateTemplateId: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: estConfig.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_TEMPLATE_EST_CONFIG,
          metadata: {
            certificateTemplateId: estConfig.certificateTemplateId
          }
        }
      });

      return estConfig;
    }
  });
};
