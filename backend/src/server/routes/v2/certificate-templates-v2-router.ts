import { z } from "zod";

import { CertificateTemplatesV2Schema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertIncludeType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";

export const registerCertificateTemplatesV2Router = async (server: FastifyZodProvider) => {
  const templateV2AttributeSchema = z
    .object({
      type: z.nativeEnum(CertSubjectAttributeType),
      include: z.nativeEnum(CertIncludeType),
      value: z.array(z.string()).optional()
    })
    .refine(
      (data) => {
        if (data.type === CertSubjectAttributeType.COMMON_NAME && data.value && data.value.length > 1) {
          return false;
        }
        if (data.include === CertIncludeType.MANDATORY && (!data.value || data.value.length > 1)) {
          return false;
        }
        return true;
      },
      {
        message: "Common name can only have one value. Mandatory attributes can only have one value or no value (empty)"
      }
    );

  const templateV2KeyUsagesSchema = z.object({
    requiredUsages: z
      .object({
        all: z.array(z.nativeEnum(CertKeyUsageType))
      })
      .optional(),
    optionalUsages: z
      .object({
        all: z.array(z.nativeEnum(CertKeyUsageType))
      })
      .optional()
  });

  const templateV2ExtendedKeyUsagesSchema = z.object({
    requiredUsages: z
      .object({
        all: z.array(z.nativeEnum(CertExtendedKeyUsageType))
      })
      .optional(),
    optionalUsages: z
      .object({
        all: z.array(z.nativeEnum(CertExtendedKeyUsageType))
      })
      .optional()
  });

  const templateV2SanSchema = z
    .object({
      type: z.nativeEnum(CertSubjectAlternativeNameType),
      include: z.nativeEnum(CertIncludeType),
      value: z.array(z.string()).optional()
    })
    .refine(
      (data) => {
        if (data.include === CertIncludeType.MANDATORY && (!data.value || data.value.length > 1)) {
          return false;
        }
        return true;
      },
      {
        message: "Mandatory SANs can only have one value or no value (empty)"
      }
    );

  const templateV2ValiditySchema = z.object({
    maxDuration: z.object({
      value: z.number().positive(),
      unit: z.nativeEnum(CertDurationUnit)
    }),
    minDuration: z
      .object({
        value: z.number().positive(),
        unit: z.nativeEnum(CertDurationUnit)
      })
      .optional()
  });

  const templateV2SignatureAlgorithmSchema = z.object({
    allowedAlgorithms: z.array(z.string()).min(1),
    defaultAlgorithm: z.string()
  });

  const templateV2KeyAlgorithmSchema = z.object({
    allowedKeyTypes: z.array(z.string()).min(1),
    defaultKeyType: z.string()
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
      body: z
        .object({
          projectId: z.string().min(1),
          slug: slugSchema({ min: 1, max: 255 }),
          description: z.string().max(1000).optional(),
          attributes: z.array(templateV2AttributeSchema).optional(),
          keyUsages: templateV2KeyUsagesSchema.optional(),
          extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
          subjectAlternativeNames: z.array(templateV2SanSchema).optional(),
          validity: templateV2ValiditySchema.optional(),
          signatureAlgorithm: templateV2SignatureAlgorithmSchema.optional(),
          keyAlgorithm: templateV2KeyAlgorithmSchema.optional()
        })
        .refine(
          (data) => {
            const hasConstraints =
              (data.attributes && data.attributes.length > 0) ||
              (data.subjectAlternativeNames && data.subjectAlternativeNames.length > 0) ||
              data.keyUsages ||
              data.extendedKeyUsages ||
              data.validity ||
              data.signatureAlgorithm ||
              data.keyAlgorithm;
            return hasConstraints;
          },
          {
            message:
              "Certificate template must define at least one constraint (attributes, SANs, key usages, validity, or algorithms)"
          }
        ),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesV2Schema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, ...data } = req.body;
      const certificateTemplate = await server.services.certificateTemplateV2.createTemplateV2({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        projectId,
        data
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            name: certificateTemplate.slug,
            projectId: certificateTemplate.projectId
          }
        }
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
      tags: [ApiDocsTags.PkiCertificateTemplates],
      querystring: z.object({
        projectId: z.string().min(1),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().optional()
      }),
      response: {
        200: z.object({
          certificateTemplates: CertificateTemplatesV2Schema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { templates, totalCount } = await server.services.certificateTemplateV2.listTemplatesV2({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.LIST_CERTIFICATE_TEMPLATES,
          metadata: {
            projectId: req.query.projectId
          }
        }
      });

      return { certificateTemplates: templates, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesV2Schema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplateV2.getTemplateV2ById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        templateId: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            name: certificateTemplate.slug
          }
        }
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        id: z.string().uuid()
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 255 }).optional(),
        description: z.string().max(1000).optional(),
        attributes: z.array(templateV2AttributeSchema).optional(),
        keyUsages: templateV2KeyUsagesSchema.optional(),
        extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
        subjectAlternativeNames: z.array(templateV2SanSchema).optional(),
        validity: templateV2ValiditySchema.optional(),
        signatureAlgorithm: templateV2SignatureAlgorithmSchema.optional(),
        keyAlgorithm: templateV2KeyAlgorithmSchema.optional()
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesV2Schema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplateV2.updateTemplateV2({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        templateId: req.params.id,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            name: certificateTemplate.slug
          }
        }
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          certificateTemplate: CertificateTemplatesV2Schema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplateV2.deleteTemplateV2({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        templateId: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.DELETE_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            name: certificateTemplate.slug
          }
        }
      });

      return { certificateTemplate };
    }
  });
};
