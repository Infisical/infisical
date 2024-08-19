import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import {
  CertificateAuthoritiesSchema,
  CertificatesSchema,
  PkiAlertsSchema,
  PkiCollectionsSchema,
  ProjectKeysSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PROJECTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-types";
import { sanitizedCertificateTemplate } from "@app/services/certificate-template/certificate-template-schema";
import { ProjectFilterType } from "@app/services/project/project-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { SanitizedProjectSchema } from "../sanitizedSchemas";

const projectWithEnv = SanitizedProjectSchema.extend({
  _id: z.string(),
  environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
});

const slugSchema = z
  .string()
  .min(5)
  .max(36)
  .refine((v) => slugify(v) === v, {
    message: "Slug must be at least 5 character but no more than 36"
  });

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  /* Get project key */
  server.route({
    method: "GET",
    url: "/:workspaceId/encrypted-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return encrypted project key",
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.GET_KEY.workspaceId)
      }),
      response: {
        200: ProjectKeysSchema.merge(
          z.object({
            sender: z.object({
              publicKey: z.string()
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
          type: EventType.GET_WORKSPACE_KEY,
          metadata: {
            keyId: key?.id as string
          }
        }
      });

      return key;
    }
  });

  /* Start upgrade of a project */
  server.route({
    method: "POST",
    url: "/:projectId/upgrade",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        userPrivateKey: z.string().trim()
      }),
      response: {
        200: z.void()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.project.upgradeProject({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId,
        userPrivateKey: req.body.userPrivateKey
      });
    }
  });

  /* Get upgrade status of project */
  server.route({
    url: "/:projectId/upgrade/status",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          status: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const status = await server.services.project.getProjectUpgradeStatus({
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id
      });

      return { status };
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
      description: "Create a new project",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectName: z.string().trim().describe(PROJECTS.CREATE.projectName),
        slug: z
          .string()
          .min(5)
          .max(36)
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(PROJECTS.CREATE.slug),
        kmsKeyId: z.string().optional()
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
        workspaceName: req.body.projectName,
        slug: req.body.slug,
        kmsKeyId: req.body.kmsKeyId
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          orgId: project.orgId,
          name: project.name,
          ...req.auditLogInfo
        }
      });

      return { project };
    }
  });

  /* Delete a project by slug */
  server.route({
    method: "DELETE",
    url: "/:slug",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slug: slugSchema.describe("The slug of the project to delete.")
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

      return project;
    }
  });

  /* Get a project by slug */
  server.route({
    method: "GET",
    url: "/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        slug: slugSchema.describe("The slug of the project to get.")
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
      params: z.object({
        slug: slugSchema.describe("The slug of the project to update.")
      }),
      body: z.object({
        name: z.string().trim().optional().describe("The new name of the project."),
        autoCapitalization: z.boolean().optional().describe("The new auto-capitalization setting.")
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
          autoCapitalization: req.body.autoCapitalization
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
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
      params: z.object({
        slug: slugSchema.describe(PROJECTS.LIST_CAS.slug)
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
          cas: z.array(CertificateAuthoritiesSchema)
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
      params: z.object({
        slug: slugSchema.describe(PROJECTS.LIST_CERTIFICATES.slug)
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
    url: "/:projectId/certificate-templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
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
};
