import { z } from "zod";

import { SecretTagsSchema } from "@app/db/schemas";
import { ApiDocsTags, SECRET_TAGS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDeprecatedSecretTagRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/tags",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.LIST.projectId)
      }),
      response: {
        200: z.object({
          workspaceTags: SecretTagsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
    method: "GET",
    url: "/:projectId/tags/:tagId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_ID.projectId),
        tagId: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_ID.tagId)
      }),
      response: {
        200: z.object({
          // akhilmhdh: for terraform backward compatiability
          workspaceTag: SecretTagsSchema.extend({ name: z.string() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspaceTag = await server.services.secretTag.getTagById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.tagId
      });
      return { workspaceTag };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/tags/slug/:tagSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_SLUG.projectId),
        tagSlug: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_SLUG.tagSlug)
      }),
      response: {
        200: z.object({
          // akhilmhdh: for terraform backward compatiability
          workspaceTag: SecretTagsSchema.extend({ name: z.string() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspaceTag = await server.services.secretTag.getTagBySlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.tagSlug,
        projectId: req.params.projectId
      });
      return { workspaceTag };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/tags",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.CREATE.projectId)
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).describe(SECRET_TAGS.CREATE.slug),
        color: z.string().trim().describe(SECRET_TAGS.CREATE.color)
      }),
      response: {
        200: z.object({
          workspaceTag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
    method: "PATCH",
    url: "/:projectId/tags/:tagId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.UPDATE.projectId),
        tagId: z.string().trim().describe(SECRET_TAGS.UPDATE.tagId)
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).describe(SECRET_TAGS.UPDATE.slug),
        color: z.string().trim().describe(SECRET_TAGS.UPDATE.color)
      }),
      response: {
        200: z.object({
          workspaceTag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const workspaceTag = await server.services.secretTag.updateTag({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        id: req.params.tagId
      });
      return { workspaceTag };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/tags/:tagId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
