import { z } from "zod";

import { CertificateInventoryViewsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
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
    keyAlgorithm: z.union([z.string().max(64), z.array(z.string().max(64)).max(10)]).optional(),
    keySizes: z.array(z.number().int().positive()).max(10).optional(),
    caIds: z.array(z.string().uuid()).max(50).optional(),
    profileIds: z.array(z.string().uuid()).max(50).optional(),
    applicationIds: z.array(z.string().uuid()).max(50).optional(),
    source: z.union([z.string().max(64), z.array(z.string().max(64)).max(10)]).optional(),
    metadata: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(255),
          value: z.string().trim().max(1020).optional()
        })
      )
      .max(20)
      .optional()
  })
  .strict();

const ValidColumns = [
  "sanCn",
  "serialNumber",
  "enrollmentMethod",
  "status",
  "health",
  "issuedAt",
  "expiresAt",
  "ca",
  "profile",
  "application",
  "algorithm",
  "source"
] as const;

const ColumnsSchema = z.array(z.enum(ValidColumns)).max(20);

export const registerCertificateInventoryViewRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "listCertificateInventoryViews",
      tags: [ApiDocsTags.PkiCertificates],
      description: "List system and custom certificate inventory views for a project.",
      querystring: z.object({
        projectId: z.string().trim().optional().describe(openApiHidden()),
        applicationId: z.string().uuid().optional()
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
          sharedViews: z.array(
            CertificateInventoryViewsSchema.extend({
              isSystem: z.literal(false),
              isShared: z.literal(true)
            })
          ),
          customViews: z.array(
            CertificateInventoryViewsSchema.extend({
              isSystem: z.literal(false),
              isShared: z.literal(false)
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.certificateInventoryView.listViews({
        projectId: req.internalCertManagerProjectId,
        applicationId: req.query.applicationId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "createCertificateInventoryView",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Create a custom certificate inventory view.",
      body: z.object({
        projectId: z.string().trim().optional().describe(openApiHidden()),
        name: z.string().trim().min(1).max(255),
        filters: InventoryViewFiltersSchema.default({}),
        columns: ColumnsSchema.optional(),
        isShared: z.boolean().default(false).optional(),
        applicationId: z.string().uuid().optional()
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
        projectId: req.internalCertManagerProjectId,
        applicationId: req.body.applicationId,
        name: req.body.name,
        filters: req.body.filters,
        columns: req.body.columns,
        isShared: req.body.isShared,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_INVENTORY_VIEW,
          metadata: {
            viewId: view.id,
            name: view.name,
            filters: req.body.filters,
            columns: req.body.columns,
            isShared: req.body.isShared,
            ...(view.applicationId && { applicationId: view.applicationId })
          }
        }
      });
      return { view };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:viewId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "updateCertificateInventoryView",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Update a custom certificate inventory view.",
      params: z.object({
        viewId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string().trim().optional().describe(openApiHidden()),
        name: z.string().trim().min(1).max(255).optional(),
        filters: InventoryViewFiltersSchema.optional(),
        columns: ColumnsSchema.optional(),
        isShared: z.boolean().optional()
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
        projectId: req.internalCertManagerProjectId,
        name: req.body.name,
        filters: req.body.filters,
        columns: req.body.columns,
        isShared: req.body.isShared,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_INVENTORY_VIEW,
          metadata: {
            viewId: view.id,
            name: view.name,
            filters: req.body.filters,
            columns: req.body.columns,
            isShared: req.body.isShared,
            ...(view.applicationId && { applicationId: view.applicationId })
          }
        }
      });
      return { view };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:viewId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "deleteCertificateInventoryView",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Delete a custom certificate inventory view.",
      params: z.object({
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
        projectId: req.internalCertManagerProjectId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.DELETE_CERTIFICATE_INVENTORY_VIEW,
          metadata: {
            viewId: req.params.viewId,
            name: view.name,
            ...(view.applicationId && { applicationId: view.applicationId })
          }
        }
      });
      return { view };
    }
  });
};
