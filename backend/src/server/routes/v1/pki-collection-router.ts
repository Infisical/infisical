import { z } from "zod";

import { PkiCollectionItemsSchema, PkiCollectionsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PKI_COLLECTIONS } from "@app/lib/api-docs";
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
      hide: false,
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Create PKI collection",
      body: z.object({
        projectId: z.string().trim().describe(PKI_COLLECTIONS.CREATE.projectId),
        name: z.string().trim().describe(PKI_COLLECTIONS.CREATE.name),
        description: z.string().trim().default("").describe(PKI_COLLECTIONS.CREATE.description)
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
      hide: false,
      operationId: "getPkiCollection",
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Get PKI collection",
      params: z.object({
        collectionId: z.string().trim().describe(PKI_COLLECTIONS.GET.collectionId)
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
      hide: false,
      operationId: "updatePkiCollection",
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Update PKI collection",
      params: z.object({
        collectionId: z.string().trim().describe(PKI_COLLECTIONS.UPDATE.collectionId)
      }),
      body: z.object({
        name: z.string().trim().optional().describe(PKI_COLLECTIONS.UPDATE.name),
        description: z.string().trim().optional().describe(PKI_COLLECTIONS.UPDATE.description)
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
      hide: false,
      operationId: "deletePkiCollection",
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Delete PKI collection",
      params: z.object({
        collectionId: z.string().trim().describe(PKI_COLLECTIONS.DELETE.collectionId)
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
      hide: false,
      operationId: "listPkiCollectionItems",
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Get items in PKI collection",
      params: z.object({
        collectionId: z.string().trim().describe(PKI_COLLECTIONS.LIST_ITEMS.collectionId)
      }),
      querystring: z.object({
        type: z.nativeEnum(PkiItemType).optional().describe(PKI_COLLECTIONS.LIST_ITEMS.type),
        offset: z.coerce.number().min(0).max(100).default(0).describe(PKI_COLLECTIONS.LIST_ITEMS.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(PKI_COLLECTIONS.LIST_ITEMS.limit)
      }),
      response: {
        200: z.object({
          collectionItems: z.array(
            PkiCollectionItemsSchema.omit({ caId: true, certId: true }).extend({
              type: z.nativeEnum(PkiItemType),
              itemId: z.string().trim(),
              notBefore: z.date(),
              notAfter: z.date(),
              friendlyName: z.string().trim()
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
      hide: false,
      operationId: "addItemToPkiCollection",
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Add item to PKI collection",
      params: z.object({
        collectionId: z.string().trim().describe(PKI_COLLECTIONS.ADD_ITEM.collectionId)
      }),
      body: z.object({
        type: z.nativeEnum(PkiItemType).describe(PKI_COLLECTIONS.ADD_ITEM.type),
        itemId: z.string().trim().describe(PKI_COLLECTIONS.ADD_ITEM.itemId)
      }),
      response: {
        200: PkiCollectionItemsSchema.omit({ caId: true, certId: true }).extend({
          type: z.nativeEnum(PkiItemType).describe(PKI_COLLECTIONS.ADD_ITEM.type),
          itemId: z.string().trim().describe(PKI_COLLECTIONS.ADD_ITEM.itemId)
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
    url: "/:collectionId/items/:collectionItemId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "removeItemFromPkiCollection",
      tags: [ApiDocsTags.PkiCertificateCollections],
      description: "Remove item from PKI collection",
      params: z.object({
        collectionId: z.string().trim().describe(PKI_COLLECTIONS.DELETE_ITEM.collectionId),
        collectionItemId: z.string().trim().describe(PKI_COLLECTIONS.DELETE_ITEM.collectionItemId)
      }),
      response: {
        200: PkiCollectionItemsSchema.omit({ caId: true, certId: true }).extend({
          type: z.nativeEnum(PkiItemType).describe(PKI_COLLECTIONS.DELETE_ITEM.type),
          itemId: z.string().trim().describe(PKI_COLLECTIONS.DELETE_ITEM.itemId)
        })
      }
    },
    handler: async (req) => {
      const { pkiCollection, pkiCollectionItem } = await server.services.pkiCollection.removeItemFromPkiCollection({
        collectionId: req.params.collectionId,
        itemId: req.params.collectionItemId,
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
