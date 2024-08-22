import ms from "ms";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATE_TEMPLATES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { sanitizedCertificateTemplate } from "@app/services/certificate-template/certificate-template-schema";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

export const registerCertificateTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: readLimit
    },
    schema: {
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id
          }
        }
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
      body: z.object({
        caId: z.string().describe(CERTIFICATE_TEMPLATES.CREATE.caId),
        pkiCollectionId: z.string().optional().describe(CERTIFICATE_TEMPLATES.CREATE.pkiCollectionId),
        name: z.string().min(1).describe(CERTIFICATE_TEMPLATES.CREATE.name),
        commonName: validateTemplateRegexField.describe(CERTIFICATE_TEMPLATES.CREATE.commonName),
        subjectAlternativeName: validateTemplateRegexField.describe(
          CERTIFICATE_TEMPLATES.CREATE.subjectAlternativeName
        ),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .describe(CERTIFICATE_TEMPLATES.CREATE.ttl)
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            caId: certificateTemplate.caId,
            pkiCollectionId: certificateTemplate.pkiCollectionId as string,
            name: certificateTemplate.name,
            commonName: certificateTemplate.commonName,
            subjectAlternativeName: certificateTemplate.subjectAlternativeName,
            ttl: certificateTemplate.ttl
          }
        }
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
      body: z.object({
        caId: z.string().optional().describe(CERTIFICATE_TEMPLATES.UPDATE.caId),
        pkiCollectionId: z.string().optional().describe(CERTIFICATE_TEMPLATES.UPDATE.pkiCollectionId),
        name: z.string().min(1).optional().describe(CERTIFICATE_TEMPLATES.UPDATE.name),
        commonName: validateTemplateRegexField.optional().describe(CERTIFICATE_TEMPLATES.UPDATE.commonName),
        subjectAlternativeName: validateTemplateRegexField
          .optional()
          .describe(CERTIFICATE_TEMPLATES.UPDATE.subjectAlternativeName),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(CERTIFICATE_TEMPLATES.UPDATE.ttl)
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            caId: certificateTemplate.caId,
            pkiCollectionId: certificateTemplate.pkiCollectionId as string,
            name: certificateTemplate.name,
            commonName: certificateTemplate.commonName,
            subjectAlternativeName: certificateTemplate.subjectAlternativeName,
            ttl: certificateTemplate.ttl
          }
        }
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificateTemplate.projectId,
        event: {
          type: EventType.DELETE_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id
          }
        }
      });

      return certificateTemplate;
    }
  });
};
