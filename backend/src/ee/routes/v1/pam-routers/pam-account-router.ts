import z from "zod";

import { PamAccountsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { ACCOUNT_TYPE_CONFIGS } from "@app/ee/services/pam-account/pam-account-schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TSupportedConfigs = typeof ACCOUNT_TYPE_CONFIGS;
type TSupportedAccountType = keyof TSupportedConfigs;
type TSupportedConfigValue = TSupportedConfigs[TSupportedAccountType];

const BaseAccountFields = PamAccountsSchema.pick({
  id: true,
  name: true,
  description: true,
  folderId: true,
  projectId: true,
  templateId: true,
  gatewayId: true,
  gatewayPoolId: true,
  recordingConnectionId: true,
  createdAt: true,
  updatedAt: true
});

const SanitizedAccountListItemSchema = BaseAccountFields.extend({
  folderName: z.string().nullable().optional(),
  templateName: z.string(),
  accountType: z.string()
});

const toPascalCase = (s: string) =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const registerPerTypeEndpoints = (
  server: FastifyZodProvider,
  accountType: PamAccountType,
  config: TSupportedConfigValue
) => {
  const typeId = toPascalCase(accountType);

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: `create${typeId}PamAccount`,
      body: z.object({
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(256).optional(),
        folderId: z.string().uuid(),
        templateId: z.string().uuid(),
        connectionDetails: config.connectionDetails,
        credentials: config.credentials,
        gatewayId: z.string().uuid().optional(),
        gatewayPoolId: z.string().uuid().optional(),
        recordingConnectionId: z.string().uuid().optional()
      }),
      response: {
        200: BaseAccountFields.extend({
          accountType: z.string(),
          folderName: z.string(),
          templateName: z.string(),
          connectionDetails: z.unknown()
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const account = await server.services.pamAccount.create({
        accountType,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_ACCOUNT_CREATE,
          metadata: {
            accountId: account.id,
            accountType,
            folderId: req.body.folderId,
            templateId: req.body.templateId,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return account;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accountId",
    schema: {
      operationId: `update${typeId}PamAccount`,
      params: z.object({ accountId: z.string().uuid() }),
      body: z.object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).nullable().optional(),
        folderId: z.string().uuid().optional(),
        templateId: z.string().uuid().optional(),
        connectionDetails: config.connectionDetails.optional(),
        credentials: config.credentials.optional(),
        gatewayId: z.string().uuid().nullable().optional(),
        gatewayPoolId: z.string().uuid().nullable().optional(),
        recordingConnectionId: z.string().uuid().nullable().optional()
      }),
      response: {
        200: BaseAccountFields
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const account = await server.services.pamAccount.update({
        accountId: req.params.accountId,
        accountType,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_ACCOUNT_UPDATE,
          metadata: {
            accountId: account.id,
            accountType,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return account;
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId",
    schema: {
      operationId: `get${typeId}PamAccount`,
      params: z.object({ accountId: z.string().uuid() }),
      response: {
        200: SanitizedAccountListItemSchema.extend({
          templateAccessPolicy: z.unknown().nullable().optional(),
          templateSettings: z.unknown().nullable().optional(),
          connectionDetails: z.unknown()
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamAccount.getById({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accountId",
    schema: {
      operationId: `delete${typeId}PamAccount`,
      params: z.object({ accountId: z.string().uuid() }),
      response: {
        200: BaseAccountFields
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const account = await server.services.pamAccount.deleteAccount({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_ACCOUNT_DELETE,
          metadata: {
            accountId: account.id,
            accountType,
            accountName: account.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return account;
    }
  });
};

export const registerPamAccountRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listPamAccounts",
      querystring: z.object({
        folderId: z.string().uuid().optional(),
        templateId: z.string().uuid().optional(),
        search: z.string().optional()
      }),
      response: {
        200: z.array(SanitizedAccountListItemSchema)
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamAccount.list({
        projectId: req.internalPamProjectId,
        folderId: req.query.folderId,
        templateId: req.query.templateId,
        search: req.query.search,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "GET",
    url: "/accessible",
    schema: {
      operationId: "listAccessiblePamAccounts",
      response: {
        200: z.array(
          SanitizedAccountListItemSchema.pick({
            id: true,
            name: true,
            description: true,
            folderId: true,
            projectId: true,
            templateId: true,
            createdAt: true,
            updatedAt: true,
            folderName: true,
            templateName: true,
            accountType: true
          })
        )
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamAccount.listAccessible({
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  await Promise.all(
    (Object.entries(ACCOUNT_TYPE_CONFIGS) as [TSupportedAccountType, TSupportedConfigValue][]).map(
      ([accountType, config]) =>
        server.register(
          async (typeRouter) => {
            registerPerTypeEndpoints(typeRouter as unknown as FastifyZodProvider, accountType, config);
          },
          { prefix: `/${accountType}` }
        )
    )
  );
};
