import { z } from "zod";

import { SecretTagsSchema } from "@app/db/schemas";
import { ApiDocsTags, SECRET_TAGS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretTagRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/tags",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listSecretTags",
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.LIST.projectId)
      }),
      response: {
        200: z.object({
          tags: SecretTagsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const tags = await server.services.secretTag.getProjectTags({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { tags };
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
      operationId: "getSecretTagById",
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_ID.projectId),
        tagId: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_ID.tagId)
      }),
      response: {
        200: z.object({
          // akhilmhdh: for terraform backward compatiability
          tag: SecretTagsSchema.extend({ name: z.string() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const tag = await server.services.secretTag.getTagById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.tagId
      });
      return { tag };
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
      operationId: "getSecretTagBySlug",
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_SLUG.projectId),
        tagSlug: z.string().trim().describe(SECRET_TAGS.GET_TAG_BY_SLUG.tagSlug)
      }),
      response: {
        200: z.object({
          // akhilmhdh: for terraform backward compatiability
          tag: SecretTagsSchema.extend({ name: z.string() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const tag = await server.services.secretTag.getTagBySlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.tagSlug,
        projectId: req.params.projectId
      });
      return { tag };
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
      operationId: "createSecretTag",
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
          tag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const tag = await server.services.secretTag.createTag({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ...req.body
      });
      return { tag };
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
      operationId: "updateSecretTag",
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
          tag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const tag = await server.services.secretTag.updateTag({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        id: req.params.tagId
      });
      return { tag };
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
      operationId: "deleteSecretTag",
      tags: [ApiDocsTags.Folders],
      params: z.object({
        projectId: z.string().trim().describe(SECRET_TAGS.DELETE.projectId),
        tagId: z.string().trim().describe(SECRET_TAGS.DELETE.tagId)
      }),
      response: {
        200: z.object({
          tag: SecretTagsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const tag = await server.services.secretTag.deleteTag({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.tagId
      });
      return { tag };
    }
  });
};
