import { z } from "zod";

import { NamespacesSchema } from "@app/db/schemas";
import { ApiDocsTags, NAMESPACES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { slugSchema } from "@app/server/lib/schemas";

const SanitizedNamespaceSchema = NamespacesSchema.pick({
  id: true,
  name: true,
  description: true,
  orgId: true,
  createdAt: true,
  updatedAt: true
});

export const registerNamespaceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Namespaces],
      description: "Create a new namespace",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: slugSchema().describe(NAMESPACES.CREATE.name),
        description: z.string().optional().describe(NAMESPACES.CREATE.description)
      }),
      response: {
        200: z.object({
          namespace: SanitizedNamespaceSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const namespace = await server.services.namespace.createNamespace({
        permission: req.permission,
        name: req.body.name,
        description: req.body.description
      });
      return { namespace };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Namespaces],
      description: "List namespaces",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(NAMESPACES.LIST.offset),
        limit: z.coerce.number().min(1).max(100).default(50).describe(NAMESPACES.LIST.limit),
        search: z.string().optional().describe(NAMESPACES.LIST.search)
      }),
      response: {
        200: z.object({
          namespaces: SanitizedNamespaceSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const namespaces = await server.services.namespace.listNamespaces({
        permission: req.permission,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search
      });
      return { namespaces };
    }
  });

  server.route({
    method: "GET",
    url: "/:name",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Namespaces],
      description: "Get namespace by name",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        name: slugSchema().describe(NAMESPACES.GET.name)
      }),
      response: {
        200: z.object({
          namespace: SanitizedNamespaceSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const namespace = await server.services.namespace.getNamespaceByName({
        permission: req.permission,
        name: req.params.name
      });
      return { namespace };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Namespaces],
      description: "Update namespace",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        name: slugSchema().describe(NAMESPACES.UPDATE.name)
      }),
      body: z.object({
        newName: slugSchema().optional().describe(NAMESPACES.UPDATE.newName),
        description: z.string().optional().describe(NAMESPACES.UPDATE.description)
      }),
      response: {
        200: z.object({
          namespace: SanitizedNamespaceSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const namespace = await server.services.namespace.updateNamespace({
        permission: req.permission,
        name: req.params.name,
        newName: req.body.newName,
        description: req.body.description
      });
      return { namespace };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Namespaces],
      description: "Delete namespace",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        name: slugSchema().describe(NAMESPACES.DELETE.name)
      }),
      response: {
        200: z.object({
          namespace: SanitizedNamespaceSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const namespace = await server.services.namespace.deleteNamespace({
        permission: req.permission,
        name: req.params.name
      });
      return { namespace };
    }
  });
};
