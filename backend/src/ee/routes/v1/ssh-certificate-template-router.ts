import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { sanitizedSshCertificateTemplate } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-schema";
import { SshCertTemplateStatus } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-types";
import {
  isValidHostPattern,
  isValidUserPattern
} from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-validators";
import { ApiDocsTags, SSH_CERTIFICATE_TEMPLATES } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSshCertificateTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshCertificateTemplates],
      params: z.object({
        certificateTemplateId: z.string().describe(SSH_CERTIFICATE_TEMPLATES.GET.certificateTemplateId)
      }),
      response: {
        200: sanitizedSshCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.sshCertificateTemplate.getSshCertTemplate({
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
          type: EventType.GET_SSH_CERTIFICATE_TEMPLATE,
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
      hide: false,
      tags: [ApiDocsTags.SshCertificateTemplates],
      body: z
        .object({
          sshCaId: z.string().describe(SSH_CERTIFICATE_TEMPLATES.CREATE.sshCaId),
          name: z
            .string()
            .min(1)
            .max(36)
            .refine((v) => slugify(v) === v, {
              message: "Name must be a valid slug"
            })
            .describe(SSH_CERTIFICATE_TEMPLATES.CREATE.name),
          ttl: z
            .string()
            .refine((val) => ms(val) > 0, "TTL must be a positive number")
            .default("1h")
            .describe(SSH_CERTIFICATE_TEMPLATES.CREATE.ttl),
          maxTTL: z
            .string()
            .refine((val) => ms(val) > 0, "Max TTL must be a positive number")
            .default("30d")
            .describe(SSH_CERTIFICATE_TEMPLATES.CREATE.maxTTL),
          allowedUsers: z
            .array(z.string().refine(isValidUserPattern, "Invalid user pattern"))
            .describe(SSH_CERTIFICATE_TEMPLATES.CREATE.allowedUsers),
          allowedHosts: z
            .array(z.string().refine(isValidHostPattern, "Invalid host pattern"))
            .describe(SSH_CERTIFICATE_TEMPLATES.CREATE.allowedHosts),
          allowUserCertificates: z.boolean().describe(SSH_CERTIFICATE_TEMPLATES.CREATE.allowUserCertificates),
          allowHostCertificates: z.boolean().describe(SSH_CERTIFICATE_TEMPLATES.CREATE.allowHostCertificates),
          allowCustomKeyIds: z.boolean().describe(SSH_CERTIFICATE_TEMPLATES.CREATE.allowCustomKeyIds)
        })
        .refine((data) => ms(data.maxTTL) >= ms(data.ttl), {
          message: "Max TLL must be greater than or equal to TTL",
          path: ["maxTTL"]
        }),
      response: {
        200: sanitizedSshCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplate, ca } = await server.services.sshCertificateTemplate.createSshCertTemplate({
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
          type: EventType.CREATE_SSH_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            sshCaId: ca.id,
            name: certificateTemplate.name,
            ttl: certificateTemplate.ttl,
            maxTTL: certificateTemplate.maxTTL,
            allowedUsers: certificateTemplate.allowedUsers,
            allowedHosts: certificateTemplate.allowedHosts,
            allowUserCertificates: certificateTemplate.allowUserCertificates,
            allowHostCertificates: certificateTemplate.allowHostCertificates,
            allowCustomKeyIds: certificateTemplate.allowCustomKeyIds
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
      hide: false,
      tags: [ApiDocsTags.SshCertificateTemplates],
      body: z.object({
        status: z.nativeEnum(SshCertTemplateStatus).optional(),
        name: z
          .string()
          .min(1)
          .max(36)
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.name),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.ttl),
        maxTTL: z
          .string()
          .refine((val) => ms(val) > 0, "Max TTL must be a positive number")
          .optional()
          .describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.maxTTL),
        allowedUsers: z
          .array(z.string().refine(isValidUserPattern, "Invalid user pattern"))
          .optional()
          .describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.allowedUsers),
        allowedHosts: z
          .array(z.string().refine(isValidHostPattern, "Invalid host pattern"))
          .optional()
          .describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.allowedHosts),
        allowUserCertificates: z.boolean().optional().describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.allowUserCertificates),
        allowHostCertificates: z.boolean().optional().describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.allowHostCertificates),
        allowCustomKeyIds: z.boolean().optional().describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.allowCustomKeyIds)
      }),
      params: z.object({
        certificateTemplateId: z.string().describe(SSH_CERTIFICATE_TEMPLATES.UPDATE.certificateTemplateId)
      }),
      response: {
        200: sanitizedSshCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplate, projectId } = await server.services.sshCertificateTemplate.updateSshCertTemplate({
        ...req.body,
        id: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_SSH_CERTIFICATE_TEMPLATE,
          metadata: {
            status: certificateTemplate.status as SshCertTemplateStatus,
            certificateTemplateId: certificateTemplate.id,
            sshCaId: certificateTemplate.sshCaId,
            name: certificateTemplate.name,
            ttl: certificateTemplate.ttl,
            maxTTL: certificateTemplate.maxTTL,
            allowedUsers: certificateTemplate.allowedUsers,
            allowedHosts: certificateTemplate.allowedHosts,
            allowUserCertificates: certificateTemplate.allowUserCertificates,
            allowHostCertificates: certificateTemplate.allowHostCertificates,
            allowCustomKeyIds: certificateTemplate.allowCustomKeyIds
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
      hide: false,
      tags: [ApiDocsTags.SshCertificateTemplates],
      params: z.object({
        certificateTemplateId: z.string().describe(SSH_CERTIFICATE_TEMPLATES.DELETE.certificateTemplateId)
      }),
      response: {
        200: sanitizedSshCertificateTemplate
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.sshCertificateTemplate.deleteSshCertTemplate({
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
          type: EventType.DELETE_SSH_CERTIFICATE_TEMPLATE,
          metadata: {
            certificateTemplateId: certificateTemplate.id
          }
        }
      });

      return certificateTemplate;
    }
  });
};
