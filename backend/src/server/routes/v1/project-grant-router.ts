import { z } from "zod";

import { ProjectFolderGrantsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectGrantRouter = async (server: FastifyZodProvider) => {
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
      const grants = await server.services.projectGrant.listGrantsByProject({
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
      const grant = await server.services.projectGrant.createGrant({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return { grant };
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
      const grant = await server.services.projectGrant.deleteGrant({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        grantId: req.params.grantId,
        sourceProjectId: req.query.sourceProjectId
      });
      return { grant };
    }
  });
};
