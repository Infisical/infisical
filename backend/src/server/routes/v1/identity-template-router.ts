import { z } from "zod";

import { IdentityAuthTemplatesSchema } from "@app/db/schemas/identity-auth-templates";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  IdentityAuthTemplateMethod,
  TEMPLATE_SUCCESS_MESSAGES,
  TEMPLATE_VALIDATION_MESSAGES
} from "@app/services/identity-auth-template/identity-auth-template-enums";

const ldapTemplateFieldsSchema = z.object({
  url: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.URL_REQUIRED),
  bindDN: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.BIND_DN_REQUIRED),
  bindPass: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.BIND_PASSWORD_REQUIRED),
  searchBase: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.LDAP.SEARCH_BASE_REQUIRED),
  ldapCaCertificate: z.string().trim().optional()
});

export const registerIdentityTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Create identity auth template",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: z
          .string()
          .trim()
          .min(1, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_NAME_REQUIRED)
          .max(64, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_NAME_MAX_LENGTH),
        authMethod: z.nativeEnum(IdentityAuthTemplateMethod),
        templateFields: ldapTemplateFieldsSchema
      }),
      response: {
        200: IdentityAuthTemplatesSchema.extend({
          templateFields: z.record(z.string(), z.unknown())
        })
      }
    },
    handler: async (req) => {
      const template = await server.services.identityAuthTemplate.createTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.body.name,
        authMethod: req.body.authMethod,
        templateFields: req.body.templateFields
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_CREATE,
          metadata: {
            templateId: template.id,
            name: template.name
          }
        }
      });

      return template;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:templateId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Update identity auth template",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        templateId: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_ID_REQUIRED)
      }),
      body: z.object({
        name: z
          .string()
          .trim()
          .min(1, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_NAME_REQUIRED)
          .max(64, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_NAME_MAX_LENGTH)
          .optional(),
        templateFields: ldapTemplateFieldsSchema.partial().optional()
      }),
      response: {
        200: IdentityAuthTemplatesSchema.extend({
          templateFields: z.record(z.string(), z.unknown())
        })
      }
    },
    handler: async (req) => {
      const template = await server.services.identityAuthTemplate.updateTemplate({
        templateId: req.params.templateId,
        name: req.body.name,
        templateFields: req.body.templateFields,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_UPDATE,
          metadata: {
            templateId: template.id,
            name: template.name
          }
        }
      });

      return template;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:templateId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Delete identity auth template",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        templateId: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_ID_REQUIRED)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      const template = await server.services.identityAuthTemplate.deleteTemplate({
        templateId: req.params.templateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_DELETE,
          metadata: {
            templateId: template.id,
            name: template.name
          }
        }
      });

      return { message: TEMPLATE_SUCCESS_MESSAGES.DELETED };
    }
  });

  server.route({
    method: "GET",
    url: "/:templateId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Get identity auth template by ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        templateId: z.string().min(1, TEMPLATE_VALIDATION_MESSAGES.TEMPLATE_ID_REQUIRED)
      }),
      response: {
        200: IdentityAuthTemplatesSchema.extend({
          templateFields: ldapTemplateFieldsSchema
        })
      }
    },
    handler: async (req) => {
      const template = await server.services.identityAuthTemplate.getTemplate({
        templateId: req.params.templateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return template;
    }
  });

  server.route({
    method: "GET",
    url: "/search",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "List identity auth templates",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        limit: z.coerce.number().positive().max(100).default(5).optional(),
        offset: z.coerce.number().min(0).default(0).optional(),
        search: z.string().optional()
      }),
      response: {
        200: z.object({
          templates: IdentityAuthTemplatesSchema.extend({
            templateFields: ldapTemplateFieldsSchema
          }).array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { templates, totalCount } = await server.services.identityAuthTemplate.listTemplates({
        limit: req.query.limit,
        offset: req.query.offset,
        search: req.query.search,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { templates, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Get identity auth templates by authentication method",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        authMethod: z.nativeEnum(IdentityAuthTemplateMethod)
      }),
      response: {
        200: IdentityAuthTemplatesSchema.extend({
          templateFields: ldapTemplateFieldsSchema
        }).array()
      }
    },
    handler: async (req) => {
      const templates = await server.services.identityAuthTemplate.getTemplatesByAuthMethod({
        authMethod: req.query.authMethod,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return templates;
    }
  });

  server.route({
    method: "GET",
    url: "/:templateId/usage",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Get template usage by template ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        templateId: z.string()
      }),
      response: {
        200: z
          .object({
            identityId: z.string(),
            identityName: z.string()
          })
          .array()
      }
    },
    handler: async (req) => {
      const templates = await server.services.identityAuthTemplate.findTemplateUsages({
        templateId: req.params.templateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return templates;
    }
  });

  server.route({
    method: "POST",
    url: "/:templateId/delete-usage",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      description: "Unlink identity auth template usage",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        templateId: z.string()
      }),
      body: z.object({
        identityIds: z.string().array()
      }),
      response: {
        200: z
          .object({
            authId: z.string(),
            identityId: z.string(),
            identityName: z.string()
          })
          .array()
      }
    },
    handler: async (req) => {
      const templates = await server.services.identityAuthTemplate.unlinkTemplateUsage({
        templateId: req.params.templateId,
        identityIds: req.body.identityIds,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return templates;
    }
  });
};
