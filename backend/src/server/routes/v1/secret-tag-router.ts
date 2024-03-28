import { z } from "zod";

import { SecretTagsSchema } from "@app/db/schemas";
import { SECRET_TAGS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretTagRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:projectId/tags",
    method: "GET",
    schema: {
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.LIST.projectId)
      }),
      response: {
        200: z.object({
          workspaceTags: SecretTagsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspaceTags = await server.services.secretTag.getProjectTags({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { workspaceTags };
    }
  });

  server.route({
    url: "/:projectId/tags",
    method: "POST",
    schema: {
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.CREATE.projectId)
      }),
      body: z.object({
        name: z.string().trim().describe(SECRET_TAGS.CREATE.name),
        slug: z.string().trim().describe(SECRET_TAGS.CREATE.slug),
        color: z.string().trim().describe(SECRET_TAGS.CREATE.color)
      }),
      response: {
        200: z.object({
          workspaceTag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspaceTag = await server.services.secretTag.createTag({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ...req.body
      });
      return { workspaceTag };
    }
  });

  server.route({
    url: "/:projectId/tags/:tagId",
    method: "DELETE",
    schema: {
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.DELETE.projectId),
        tagId: z.string().trim().describe(SECRET_TAGS.DELETE.tagId)
      }),
      response: {
        200: z.object({
          workspaceTag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const workspaceTag = await server.services.secretTag.deleteTag({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.tagId
      });
      return { workspaceTag };
    }
  });
};
