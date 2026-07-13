import { z } from "zod";

import { ProjectFolderGrantsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectFolderGrantRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        sourceProjectId: z.string()
      }),
      response: {
        200: z.object({
          grants: ProjectFolderGrantsSchema.extend({
            folderName: z.string(),
            environmentName: z.string(),
            environmentSlug: z.string(),
            targetProjectName: z.string(),
            secretCount: z.number()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const grants = await server.services.projectFolderGrant.listGrantsByProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        sourceProjectId: req.query.sourceProjectId
      });
      return { grants };
    }
  });

  server.route({
    method: "GET",
    url: "/received",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        targetProjectId: z.string()
      }),
      response: {
        200: z.object({
          grants: ProjectFolderGrantsSchema.extend({
            folderName: z.string(),
            environmentName: z.string(),
            environmentSlug: z.string(),
            sourceProjectName: z.string(),
            sourceProjectSlug: z.string(),
            secretCount: z.number()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const grants = await server.services.projectFolderGrant.listGrantsForTargetProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        targetProjectId: req.query.targetProjectId
      });
      return { grants };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.object({
        sourceProjectId: z.string(),
        environment: z.string(),
        secretPath: z.string(),
        targetProjectId: z.string()
      }),
      response: {
        200: z.object({ grant: ProjectFolderGrantsSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const grant = await server.services.projectFolderGrant.createGrant({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: grant.sourceProjectId,
        event: {
          type: EventType.CREATE_PROJECT_FOLDER_GRANT,
          metadata: {
            grantId: grant.id,
            sourceProjectId: grant.sourceProjectId,
            targetProjectId: grant.targetProjectId,
            environment: req.body.environment,
            secretPath: req.body.secretPath
          }
        }
      });

      return { grant };
    }
  });

  server.route({
    method: "GET",
    url: "/:grantId/usage",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        grantId: z.string().uuid()
      }),
      querystring: z.object({
        sourceProjectId: z.string()
      }),
      response: {
        200: z.object({
          importCount: z.number(),
          referenceCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.projectFolderGrant.getGrantUsage({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        grantId: req.params.grantId,
        sourceProjectId: req.query.sourceProjectId
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/:grantId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        grantId: z.string().uuid()
      }),
      querystring: z.object({
        sourceProjectId: z.string()
      }),
      response: {
        200: z.object({ grant: ProjectFolderGrantsSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const grant = await server.services.projectFolderGrant.deleteGrant({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        grantId: req.params.grantId,
        sourceProjectId: req.query.sourceProjectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: grant.sourceProjectId,
        event: {
          type: EventType.DELETE_PROJECT_FOLDER_GRANT,
          metadata: {
            grantId: grant.id,
            sourceProjectId: grant.sourceProjectId,
            targetProjectId: grant.targetProjectId,
            environment: grant.environment,
            secretPath: grant.secretPath
          }
        }
      });

      return { grant };
    }
  });
};
