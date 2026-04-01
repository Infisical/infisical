import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPamAccount } from "@app/ee/services/pam-resource/pam-resource-types";
import { writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerPamAccountEndpoints = <C extends TPamAccount>({
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
    requireMfa?: C["requireMfa"];
    internalMetadata?: Record<string, unknown>;
    metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
  }>;
  updateAccountSchema: z.ZodType<{
    credentials?: C["credentials"];
    name?: C["name"];
    description?: C["description"];
    requireMfa?: C["requireMfa"];
    internalMetadata?: Record<string, unknown>;
    metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
  }>;
  accountResponseSchema: z.ZodTypeAny;
}) => {
  // Convert resource type enum value to PascalCase for operation IDs
  // e.g., "postgres" -> "Postgres", "aws-iam" -> "AwsIam"
  const resourceTypeId = resourceType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: `create${resourceTypeId}PamAccount`,
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
            requireMfa: req.body.requireMfa
          }
        }
      });

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            resourceType,
            projectId: account.projectId
          }
        })
        .catch(() => {});

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
      operationId: `update${resourceTypeId}PamAccount`,
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
      operationId: `delete${resourceTypeId}PamAccount`,
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

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            resourceType,
            projectId: account.projectId
          }
        })
        .catch(() => {});

      return { account };
    }
  });
};
