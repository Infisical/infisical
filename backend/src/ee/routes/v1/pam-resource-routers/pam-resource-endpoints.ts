import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPamAccount, TPamResource } from "@app/ee/services/pam-resource/pam-resource-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamResourceEndpoints = <T extends TPamResource, C extends TPamAccount>({
  server,
  resourceType,
  createResourceSchema,
  updateResourceSchema,
  createAccountSchema,
  updateAccountSchema,
  resourceResponseSchema,
  accountResponseSchema
}: {
  server: FastifyZodProvider;
  resourceType: PamResource;
  createResourceSchema: z.ZodType<{
    projectId: T["projectId"];
    connectionDetails: T["connectionDetails"];
    gatewayId: T["gatewayId"];
    name: T["name"];
  }>;
  createAccountSchema: z.ZodType<{
    credentials: C["credentials"];
    folderId?: C["folderId"];
    name: C["name"];
    description?: C["description"];
  }>;
  updateResourceSchema: z.ZodType<{
    connectionDetails?: T["connectionDetails"];
    gatewayId?: T["gatewayId"];
    name?: T["name"];
  }>;
  updateAccountSchema: z.ZodType<{
    credentials?: C["credentials"];
    name?: C["name"];
    description?: C["description"];
  }>;
  resourceResponseSchema: z.ZodTypeAny;
  accountResponseSchema: z.ZodTypeAny;
}) => {
  server.route({
    method: "GET",
    url: "/:resourceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.getById(req.params.resourceId, resourceType, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: resource.projectId,
        event: {
          type: EventType.PAM_RESOURCE_GET,
          metadata: {
            resourceId: resource.id,
            resourceType: resource.resourceType,
            name: resource.name
          }
        }
      });

      return { resource };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create PAM resource",
      body: createResourceSchema,
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.create(
        {
          ...req.body,
          resourceType
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_RESOURCE_CREATE,
          metadata: {
            resourceType,
            gatewayId: req.body.gatewayId,
            name: req.body.name
          }
        }
      });

      return { resource };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:resourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      body: updateResourceSchema,
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.updateById(
        {
          ...req.body,
          resourceId: req.params.resourceId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: resource.projectId,
        event: {
          type: EventType.PAM_RESOURCE_UPDATE,
          metadata: {
            resourceId: req.params.resourceId,
            resourceType,
            gatewayId: req.body.gatewayId,
            name: req.body.name
          }
        }
      });

      return { resource };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:resourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.deleteById(req.params.resourceId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: resource.projectId,
        event: {
          type: EventType.PAM_RESOURCE_DELETE,
          metadata: {
            resourceId: req.params.resourceId,
            resourceType
          }
        }
      });

      return { resource };
    }
  });

  // PAM Accounts
  server.route({
    method: "POST",
    url: "/:resourceId/accounts",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create PAM resource account",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      body: createAccountSchema,
      response: {
        200: z.object({
          account: accountResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const account = await server.services.pamResource.createAccount(
        {
          ...req.body,
          resourceId: req.params.resourceId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: account.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_CREATE,
          metadata: {
            resourceId: req.params.resourceId,
            resourceType,
            folderId: req.body.folderId,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { account };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:resourceId/accounts/:accountId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM resource account",
      params: z.object({
        resourceId: z.string().uuid(),
        accountId: z.string().uuid()
      }),
      body: updateAccountSchema,
      response: {
        200: z.object({
          account: accountResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const account = await server.services.pamResource.updateAccountById(
        {
          ...req.body,
          accountId: req.params.accountId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: account.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_UPDATE,
          metadata: {
            accountId: req.params.accountId,
            resourceId: req.params.resourceId,
            resourceType,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { account };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:resourceId/accounts/:accountId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete PAM resource account",
      params: z.object({
        resourceId: z.string().uuid(),
        accountId: z.string().uuid()
      }),
      response: {
        200: z.object({
          account: accountResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const account = await server.services.pamResource.deleteAccountById(req.params.accountId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: account.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_DELETE,
          metadata: {
            accountId: req.params.accountId,
            resourceId: req.params.resourceId,
            resourceType
          }
        }
      });

      return { account };
    }
  });
};
