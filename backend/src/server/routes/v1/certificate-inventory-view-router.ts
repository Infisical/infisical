import { z } from "zod";

import { CertificateInventoryViewsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const InventoryViewFiltersSchema = z
  .object({
    status: z.string().max(100).optional(),
    notAfterTo: z.coerce.date().optional(),
    notAfterFrom: z.coerce.date().optional(),
    notBeforeTo: z.coerce.date().optional(),
    notBeforeFrom: z.coerce.date().optional(),
    enrollmentTypes: z.array(z.string().max(64)).max(10).optional(),
    keyAlgorithm: z.string().max(64).optional(),
    keySizes: z.array(z.number().int().positive()).max(10).optional(),
    caIds: z.array(z.string().uuid()).max(50).optional(),
    profileIds: z.array(z.string().uuid()).max(50).optional(),
    source: z.string().max(64).optional()
  })
  .strict();

const ColumnsSchema = z.array(z.string().max(64)).max(20);

export const registerCertificateInventoryViewRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/certificate-inventory-views",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listCertificateInventoryViews",
      tags: [ApiDocsTags.PkiCertificates],
      description: "List system and custom certificate inventory views for a project.",
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          systemViews: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              filters: z.object({
                status: z.array(z.string()).optional(),
                notAfterTo: z.string().optional()
              }),
              columns: z.null(),
              isSystem: z.literal(true),
              createdByUserId: z.null()
            })
          ),
          customViews: z.array(
            CertificateInventoryViewsSchema.extend({
              isSystem: z.literal(false)
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.certificateInventoryView.listViews({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/certificate-inventory-views",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createCertificateInventoryView",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Create a custom certificate inventory view.",
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(255),
        filters: InventoryViewFiltersSchema.default({}),
        columns: ColumnsSchema.optional()
      }),
      response: {
        200: z.object({
          view: CertificateInventoryViewsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const view = await server.services.certificateInventoryView.createView({
        projectId: req.params.projectId,
        name: req.body.name,
        filters: req.body.filters,
        columns: req.body.columns,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_INVENTORY_VIEW,
          metadata: {
            viewId: view.id,
            name: view.name
          }
        }
      });
      return { view };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/certificate-inventory-views/:viewId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateCertificateInventoryView",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Update a custom certificate inventory view.",
      params: z.object({
        projectId: z.string().trim(),
        viewId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(255).optional(),
        filters: InventoryViewFiltersSchema.optional(),
        columns: ColumnsSchema.optional()
      }),
      response: {
        200: z.object({
          view: CertificateInventoryViewsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const view = await server.services.certificateInventoryView.updateView({
        viewId: req.params.viewId,
        projectId: req.params.projectId,
        name: req.body.name,
        filters: req.body.filters,
        columns: req.body.columns,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_INVENTORY_VIEW,
          metadata: {
            viewId: view.id,
            name: view.name
          }
        }
      });
      return { view };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/certificate-inventory-views/:viewId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteCertificateInventoryView",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Delete a custom certificate inventory view.",
      params: z.object({
        projectId: z.string().trim(),
        viewId: z.string().uuid()
      }),
      response: {
        200: z.object({
          view: CertificateInventoryViewsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const view = await server.services.certificateInventoryView.deleteView({
        viewId: req.params.viewId,
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.DELETE_CERTIFICATE_INVENTORY_VIEW,
          metadata: {
            viewId: req.params.viewId
          }
        }
      });
      return { view };
    }
  });
};
