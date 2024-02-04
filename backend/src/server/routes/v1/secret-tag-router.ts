import { z } from "zod";

import { SecretTagsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretTagRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:projectId/tags",
    method: "GET",
    schema: {
      params: z.object({
        projectId: z.string().trim()
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
        projectId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim(),
        slug: z.string().trim(),
        color: z.string()
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
        projectId: z.string().trim(),
        tagId: z.string().trim()
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
        id: req.params.tagId
      });
      return { workspaceTag };
    }
  });
};
