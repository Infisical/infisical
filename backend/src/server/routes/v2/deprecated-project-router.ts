import { z } from "zod";

import {
  CertificatesSchema,
  PkiAlertsSchema,
  PkiCollectionsSchema,
  ProjectKeysSchema,
  ProjectType
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { InfisicalProjectTemplate } from "@app/ee/services/project-template/project-template-types";
import { sanitizedSshCa } from "@app/ee/services/ssh/ssh-certificate-authority-schema";
import { sanitizedSshCertificate } from "@app/ee/services/ssh-certificate/ssh-certificate-schema";
import { sanitizedSshCertificateTemplate } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-schema";
import { loginMappingSchema, sanitizedSshHost } from "@app/ee/services/ssh-host/ssh-host-schema";
import { LoginMappingSource } from "@app/ee/services/ssh-host/ssh-host-types";
import { sanitizedSshHostGroup } from "@app/ee/services/ssh-host-group/ssh-host-group-schema";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { sanitizedCertificateTemplate } from "@app/services/certificate-template/certificate-template-schema";
import { sanitizedPkiSubscriber } from "@app/services/pki-subscriber/pki-subscriber-schema";
import { ProjectFilterType } from "@app/services/project/project-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { InternalCertificateAuthorityResponseSchema, SanitizedProjectSchema } from "../sanitizedSchemas";

const projectWithEnv = SanitizedProjectSchema.extend({
  _id: z.string(),
  environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array(),
  kmsSecretManagerKeyId: z.string().nullable().optional()
});

export const registerDeprecatedProjectRouter = async (server: FastifyZodProvider) => {
  // depreciated
  /* Get project key */
  server.route({
    method: "GET",
    url: "/:workspaceId/encrypted-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getProjectEncryptedKey",
      description: "Return encrypted project key",
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.GET_KEY.projectId)
      }),
      response: {
        200: ProjectKeysSchema.merge(
          z.object({
            sender: z.object({
              publicKey: z.string().optional()
            })
          })
        )
      }
    },
    onResponse: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const key = await server.services.projectKey.getLatestProjectKey({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.GET_PROJECT_KEY,
          metadata: {
            keyId: key?.id as string
          }
        }
      });

      return key;
    }
  });

  /* Create new project */
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createProject",
      tags: [ApiDocsTags.Projects],
      description: "Create a new project",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectName: z.string().trim().describe(PROJECTS.CREATE.projectName),
        projectDescription: z.string().trim().optional().describe(PROJECTS.CREATE.projectDescription),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(PROJECTS.CREATE.slug),
        kmsKeyId: z.string().optional(),
        template: slugSchema({ field: "Template Name", max: 64 })
          .optional()
          .default(InfisicalProjectTemplate.Default)
          .describe(PROJECTS.CREATE.template),
        type: z.nativeEnum(ProjectType).default(ProjectType.SecretManager),
        shouldCreateDefaultEnvs: z.boolean().optional().default(true),
        hasDeleteProtection: z.boolean().optional().default(false)
      }),
      response: {
        200: z.object({
          project: projectWithEnv
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectName: req.body.projectName,
        projectDescription: req.body.projectDescription,
        slug: req.body.slug,
        kmsKeyId: req.body.kmsKeyId,
        template: req.body.template,
        type: req.body.type,
        createDefaultEnvs: req.body.shouldCreateDefaultEnvs,
        hasDeleteProtection: req.body.hasDeleteProtection
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: project.orgId,
          name: project.name,
          ...req.auditLogInfo
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.CREATE_PROJECT,
          metadata: {
            ...req.body,
            name: req.body.projectName
          }
        }
      });

      return { project };
    }
  });

  /* Delete a project by slug */
  // moved to DELETE /v1/projects/slug/:slug
  server.route({
    method: "DELETE",
    url: "/:slug",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteProject",
      tags: [ApiDocsTags.Projects],
      description: "Delete project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slug: slugSchema({ min: 5, max: 64 }).describe("The slug of the project to delete.")
      }),
      response: {
        200: SanitizedProjectSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),

    handler: async (req) => {
      const project = await server.services.project.deleteProject({
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.params.slug,
          orgId: req.permission.orgId
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.DELETE_PROJECT,
          metadata: project
        }
      });

      return project;
    }
  });

  /* Get a project by slug */
  // moved to GET /v1/projects/slug/:slug
  server.route({
    method: "GET",
    url: "/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getProject",
      tags: [ApiDocsTags.Projects],
      description: "Get project details by slug",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slug: slugSchema({ max: 64 }).describe("The slug of the project to get.")
      }),
      response: {
        200: projectWithEnv
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.getAProject({
        filter: {
          slug: req.params.slug,
          orgId: req.permission.orgId,
          type: ProjectFilterType.SLUG
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return project;
    }
  });

  /* Update a project by slug */
  server.route({
    method: "PATCH",
    url: "/:slug",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateProject",
      params: z.object({
        slug: slugSchema({ min: 5, max: 64 }).describe("The slug of the project to update.")
      }),
      body: z.object({
        name: z.string().trim().optional().describe(PROJECTS.UPDATE.name),
        description: z.string().trim().optional().describe(PROJECTS.UPDATE.projectDescription),
        autoCapitalization: z.boolean().optional().describe(PROJECTS.UPDATE.autoCapitalization),
        hasDeleteProtection: z.boolean().optional().describe(PROJECTS.UPDATE.hasDeleteProtection)
      }),
      response: {
        200: SanitizedProjectSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.updateProject({
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.params.slug,
          orgId: req.permission.orgId
        },
        update: {
          name: req.body.name,
          description: req.body.description,
          autoCapitalization: req.body.autoCapitalization,
          hasDeleteProtection: req.body.hasDeleteProtection
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.UPDATE_PROJECT,
          metadata: req.body
        }
      });

      return project;
    }
  });

  server.route({
    method: "GET",
    url: "/:slug/cas",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectCas",
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      params: z.object({
        slug: slugSchema({ min: 5, max: 64 }).describe(PROJECTS.LIST_CAS.slug)
      }),
      querystring: z.object({
        status: z.enum([CaStatus.ACTIVE, CaStatus.PENDING_CERTIFICATE]).optional().describe(PROJECTS.LIST_CAS.status),
        friendlyName: z.string().optional().describe(PROJECTS.LIST_CAS.friendlyName),
        commonName: z.string().optional().describe(PROJECTS.LIST_CAS.commonName),
        offset: z.coerce.number().min(0).max(100).default(0).describe(PROJECTS.LIST_CAS.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(PROJECTS.LIST_CAS.limit)
      }),
      response: {
        200: z.object({
          cas: z.array(InternalCertificateAuthorityResponseSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const cas = await server.services.project.listProjectCas({
        filter: {
          slug: req.params.slug,
          orgId: req.permission.orgId,
          type: ProjectFilterType.SLUG
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        ...req.query
      });
      return { cas };
    }
  });

  server.route({
    method: "GET",
    url: "/:slug/certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectCertificates",
      tags: [ApiDocsTags.PkiCertificates],
      params: z.object({
        slug: slugSchema({ min: 5, max: 64 }).describe(PROJECTS.LIST_CERTIFICATES.slug)
      }),
      querystring: z.object({
        friendlyName: z.string().optional().describe(PROJECTS.LIST_CERTIFICATES.friendlyName),
        commonName: z.string().optional().describe(PROJECTS.LIST_CERTIFICATES.commonName),
        offset: z.coerce.number().min(0).max(100).default(0).describe(PROJECTS.LIST_CERTIFICATES.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(PROJECTS.LIST_CERTIFICATES.limit)
      }),
      response: {
        200: z.object({
          certificates: z.array(CertificatesSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificates, totalCount } = await server.services.project.listProjectCertificates({
        filter: {
          slug: req.params.slug,
          orgId: req.permission.orgId,
          type: ProjectFilterType.SLUG
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        ...req.query
      });
      return { certificates, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/pki-alerts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectPkiAlerts",
      tags: [ApiDocsTags.PkiAlerting],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          alerts: z.array(PkiAlertsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { alerts } = await server.services.project.listProjectAlerts({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { alerts };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/pki-collections",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectPkiCollections",
      tags: [ApiDocsTags.PkiCertificateCollections],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          collections: z.array(PkiCollectionsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiCollections } = await server.services.project.listProjectPkiCollections({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { collections: pkiCollections };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/pki-subscribers",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectPkiSubscribers",
      tags: [ApiDocsTags.PkiSubscribers],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_PKI_SUBSCRIBERS.projectId)
      }),
      response: {
        200: z.object({
          subscribers: z.array(sanitizedPkiSubscriber)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const subscribers = await server.services.project.listProjectPkiSubscribers({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { subscribers };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/certificate-templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectCertificateTemplates",
      tags: [ApiDocsTags.PkiCertificateTemplates],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          certificateTemplates: sanitizedCertificateTemplate.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplates } = await server.services.project.listProjectCertificateTemplates({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { certificateTemplates };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listProjectSshCertificates",
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_CAS.projectId)
      }),
      querystring: z.object({
        offset: z.coerce.number().default(0).describe(PROJECTS.LIST_SSH_CERTIFICATES.offset),
        limit: z.coerce.number().default(25).describe(PROJECTS.LIST_SSH_CERTIFICATES.limit)
      }),
      response: {
        200: z.object({
          certificates: z.array(sanitizedSshCertificate),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificates, totalCount } = await server.services.project.listProjectSshCertificates({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId,
        offset: req.query.offset,
        limit: req.query.limit
      });

      return { certificates, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-certificate-templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshCertificateTemplates",
      tags: [ApiDocsTags.SshCertificateTemplates],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_CERTIFICATE_TEMPLATES.projectId)
      }),
      response: {
        200: z.object({
          certificateTemplates: z.array(sanitizedSshCertificateTemplate)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificateTemplates } = await server.services.project.listProjectSshCertificateTemplates({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { certificateTemplates };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-cas",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshCas",
      tags: [ApiDocsTags.SshCertificateAuthorities],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_CAS.projectId)
      }),
      response: {
        200: z.object({
          cas: z.array(sanitizedSshCa)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const cas = await server.services.project.listProjectSshCas({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { cas };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-hosts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshHosts",
      tags: [ApiDocsTags.SshHosts],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_HOSTS.projectId)
      }),
      response: {
        200: z.object({
          hosts: z.array(
            sanitizedSshHost.extend({
              loginMappings: loginMappingSchema
                .extend({
                  source: z.nativeEnum(LoginMappingSource)
                })
                .array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hosts = await server.services.project.listProjectSshHosts({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { hosts };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/ssh-host-groups",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listProjectSshHostGroups",
      tags: [ApiDocsTags.SshHostGroups],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_SSH_HOST_GROUPS.projectId)
      }),
      response: {
        200: z.object({
          groups: z.array(
            sanitizedSshHostGroup.extend({
              loginMappings: loginMappingSchema.array(),
              hostCount: z.number()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const groups = await server.services.project.listProjectSshHostGroups({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      return { groups };
    }
  });
};
