import { z } from "zod";

import { CertificateTemplatesV2Schema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  certificateRequestSchema,
  createCertificateTemplateV2Schema,
  deleteCertificateTemplateV2Schema,
  getCertificateTemplateV2ByIdSchema,
  listCertificateTemplatesV2Schema,
  updateCertificateTemplateV2Schema
} from "@app/services/certificate-template-v2/certificate-template-v2-schemas";

export const registerCertificateTemplatesV2Router = async (server: FastifyZodProvider) => {
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
      querystring: listCertificateTemplatesV2Schema,
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
      params: getCertificateTemplateV2ByIdSchema,
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
      params: getCertificateTemplateV2ByIdSchema,
      body: updateCertificateTemplateV2Schema,
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
      params: deleteCertificateTemplateV2Schema,
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

  server.route({
    method: "POST",
    url: "/:id/validate",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: getCertificateTemplateV2ByIdSchema,
      body: z.object({
        request: certificateRequestSchema
      }),
      response: {
        200: z.object({
          valid: z.boolean(),
          errors: z.array(z.string()).optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.certificateTemplateV2.validateCertificateRequest(
        req.params.id,
        req.body.request
      );

      return {
        valid: result.isValid,
        errors: result.errors.length > 0 ? result.errors : undefined
      };
    }
  });
};
