import RE2 from "re2";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";
import { certificateTemplateV2ResponseSchema } from "@app/services/certificate-template-v2/certificate-template-v2-schemas";

const attributeTypeSchema = z.nativeEnum(CertSubjectAttributeType);
const sanTypeSchema = z.nativeEnum(CertSubjectAlternativeNameType);

const templateV2SubjectSchema = z
  .object({
    type: attributeTypeSchema,
    allowed: z.array(z.string()).optional(),
    required: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Subject attribute must have at least one allowed, required, or denied value"
    }
  );

const templateV2KeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    required: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    denied: z.array(z.nativeEnum(CertKeyUsageType)).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Key usages must have at least one allowed, required, or denied value"
    }
  );

const templateV2ExtendedKeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    required: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    denied: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Extended key usages must have at least one allowed, required, or denied value"
    }
  );

const templateV2SanSchema = z
  .object({
    type: sanTypeSchema,
    allowed: z.array(z.string()).optional(),
    required: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "SAN must have at least one allowed, required, or denied value"
    }
  );

const templateV2ValiditySchema = z.object({
  max: z
    .string()
    .refine(
      (val) => {
        if (!val) return true;
        if (val.length < 2) return false;
        const unit = val.slice(-1);
        const number = val.slice(0, -1);
        const digitRegex = new RE2("^\\d+$");
        return ["d", "h", "m", "y"].includes(unit) && digitRegex.test(number);
      },
      {
        message: "Max validity must be in format like '365d', '12m', '1y', or '24h'"
      }
    )
    .optional()
});

const templateV2AlgorithmsSchema = z.object({
  signature: z.array(z.string()).min(1, "At least one signature algorithm must be provided").optional(),
  keyAlgorithm: z.array(z.string()).min(1, "At least one key algorithm must be provided").optional()
});

const templateV2CaSettingsSchema = z
  .object({
    maxPathLength: z
      .number()
      .int("Path length must be an integer")
      .min(-1, "Path length must be -1 (unlimited) or a non-negative integer")
      .optional()
  })
  .nullable();

const createCertificateTemplateV2Schema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(255, "Name must be between 1 and 255 characters"),
  description: z.string().max(1000).optional(),
  subject: z.array(templateV2SubjectSchema).optional(),
  sans: z.array(templateV2SanSchema).optional(),
  keyUsages: templateV2KeyUsagesSchema.optional(),
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  algorithms: templateV2AlgorithmsSchema.optional(),
  validity: templateV2ValiditySchema.optional(),
  caSettings: templateV2CaSettingsSchema.optional()
});

const updateCertificateTemplateV2Schema = z.object({
  name: z.string().min(1).max(255, "Name must be between 1 and 255 characters").optional(),
  description: z.string().max(1000).optional(),
  subject: z.array(templateV2SubjectSchema).optional(),
  sans: z.array(templateV2SanSchema).optional(),
  keyUsages: templateV2KeyUsagesSchema.optional(),
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  algorithms: templateV2AlgorithmsSchema.optional(),
  validity: templateV2ValiditySchema.optional(),
  caSettings: templateV2CaSettingsSchema.optional()
});

export const registerCertificateTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      body: createCertificateTemplateV2Schema,
      response: {
        200: z.object({
          certificateTemplate: certificateTemplateV2ResponseSchema
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
            name: certificateTemplate.name,
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
          certificateTemplates: certificateTemplateV2ResponseSchema.array(),
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
          certificateTemplate: certificateTemplateV2ResponseSchema
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
            name: certificateTemplate.name
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
      body: updateCertificateTemplateV2Schema,
      response: {
        200: z.object({
          certificateTemplate: certificateTemplateV2ResponseSchema
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
            name: certificateTemplate.name
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
          certificateTemplate: certificateTemplateV2ResponseSchema
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
            name: certificateTemplate.name
          }
        }
      });

      return { certificateTemplate };
    }
  });
};
