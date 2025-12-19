import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPamAccount } from "@app/ee/services/pam-resource/pam-resource-types";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamResourceEndpoints = <C extends TPamAccount>({
  server,
  resourceType,
  createAccountSchema,
  updateAccountSchema,
  accountResponseSchema
}: {
  server: FastifyZodProvider;
  resourceType: PamResource;
  createAccountSchema: z.ZodType<{
    credentials: C["credentials"];
    resourceId: C["resourceId"];
    folderId?: C["folderId"];
    name: C["name"];
    description?: C["description"];
    rotationEnabled?: C["rotationEnabled"];
    rotationIntervalSeconds?: C["rotationIntervalSeconds"];
    requireMfa?: C["requireMfa"];
  }>;
  updateAccountSchema: z.ZodType<{
    credentials?: C["credentials"];
    name?: C["name"];
    description?: C["description"];
    rotationEnabled?: C["rotationEnabled"];
    rotationIntervalSeconds?: C["rotationIntervalSeconds"];
    requireMfa?: C["requireMfa"];
  }>;
  accountResponseSchema: z.ZodTypeAny;
}) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create PAM account",
      body: createAccountSchema,
      response: {
        200: z.object({
          account: accountResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const account = await server.services.pamAccount.create(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: account.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_CREATE,
          metadata: {
            resourceId: req.body.resourceId,
            resourceType,
            folderId: req.body.folderId,
            name: req.body.name,
            description: req.body.description,
            rotationEnabled: req.body.rotationEnabled ?? false,
            rotationIntervalSeconds: req.body.rotationIntervalSeconds,
            requireMfa: req.body.requireMfa
          }
        }
      });

      return { account };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accountId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM account",
      params: z.object({
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
      const account = await server.services.pamAccount.updateById(
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
            resourceId: account.resourceId,
            resourceType,
            name: req.body.name,
            description: req.body.description,
            rotationEnabled: req.body.rotationEnabled,
            rotationIntervalSeconds: req.body.rotationIntervalSeconds,
            requireMfa: req.body.requireMfa
          }
        }
      });

      return { account };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accountId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete PAM account",
      params: z.object({
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
      const account = await server.services.pamAccount.deleteById(req.params.accountId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: account.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_DELETE,
          metadata: {
            accountId: req.params.accountId,
            accountName: account.name,
            resourceId: account.resourceId,
            resourceType
          }
        }
      });

      return { account };
    }
  });
};
