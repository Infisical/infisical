import { z } from "zod";

import { PkiCollectionItemsSchema, PkiCollectionsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PkiItemType } from "@app/services/pki-collection/pki-collection-types";

export const registerPkiCollectionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create PKI collection",
      body: z.object({
        projectId: z.string().trim(),
        name: z.string().trim()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.createPkiCollection({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.CREATE_PKI_COLLECTION,
          metadata: {
            pkiCollectionId: pkiCollection.id,
            name: pkiCollection.name
          }
        }
      });

      return pkiCollection;
    }
  });

  server.route({
    method: "GET",
    url: "/:collectionId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.getPkiCollectionById({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.GET_PKI_COLLECTION,
          metadata: {
            pkiCollectionId: pkiCollection.id
          }
        }
      });

      return pkiCollection;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:collectionId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().optional()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.updatePkiCollection({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.UPDATE_PKI_COLLECTION,
          metadata: {
            pkiCollectionId: pkiCollection.id,
            name: pkiCollection.name
          }
        }
      });

      return pkiCollection;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:collectionId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.deletePkiCollection({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.DELETE_PKI_COLLECTION,
          metadata: {
            pkiCollectionId: pkiCollection.id
          }
        }
      });

      return pkiCollection;
    }
  });

  server.route({
    method: "GET",
    url: "/:collectionId/items",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get items in PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          collectionItems: z.array(
            PkiCollectionItemsSchema.omit({ caId: true, certId: true }).extend({
              type: z.nativeEnum(PkiItemType),
              itemId: z.string().trim()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { pkiCollection, pkiCollectionItems, totalCount } =
        await server.services.pkiCollection.getPkiCollectionItems({
          collectionId: req.params.collectionId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.GET_PKI_COLLECTION_ITEMS,
          metadata: {
            pkiCollectionId: pkiCollection.id
          }
        }
      });

      return {
        collectionItems: pkiCollectionItems,
        totalCount
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:collectionId/items",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Add item to PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      body: z.object({
        type: z.nativeEnum(PkiItemType),
        itemId: z.string().trim()
      }),
      response: {
        200: PkiCollectionItemsSchema.omit({ caId: true, certId: true }).extend({
          type: z.nativeEnum(PkiItemType),
          itemId: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { pkiCollection, pkiCollectionItem } = await server.services.pkiCollection.addItemToPkiCollection({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.ADD_PKI_COLLECTION_ITEM,
          metadata: {
            pkiCollectionId: pkiCollection.id,
            pkiCollectionItemId: pkiCollectionItem.id,
            type: pkiCollectionItem.type,
            itemId: pkiCollectionItem.itemId
          }
        }
      });

      return pkiCollectionItem;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:collectionId/items/:itemId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Remove item from PKI collection",
      params: z.object({
        collectionId: z.string().trim(),
        itemId: z.string().trim()
      }),
      response: {
        200: PkiCollectionItemsSchema.omit({ caId: true, certId: true }).extend({
          type: z.nativeEnum(PkiItemType),
          itemId: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { pkiCollection, pkiCollectionItem } = await server.services.pkiCollection.removeItemFromPkiCollection({
        collectionId: req.params.collectionId,
        itemId: req.params.itemId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiCollection.projectId,
        event: {
          type: EventType.DELETE_PKI_COLLECTION_ITEM,
          metadata: {
            pkiCollectionId: pkiCollection.id,
            pkiCollectionItemId: pkiCollectionItem.id
          }
        }
      });

      return pkiCollectionItem;
    }
  });
};
