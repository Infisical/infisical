import picomatch from "picomatch";
import { z } from "zod";

import { SecretApprovalRequestsSchema, SecretType, ServiceTokenScopes, UserSecretType } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { USER_SECRETS } from "@app/lib/api-docs";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { secretsLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { ProjectFilterType } from "@app/services/project/project-types";
import { SecretProtectionType } from "@app/services/secret/secret-types";
import { LoginUserSecretSchema } from "@app/services/user-secrets/user-secret-types";

import { secretRawSchema } from "../sanitizedSchemas";

export const registerUserSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/raw",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "List secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        workspaceId: z.string().trim().optional().describe(USER_SECRETS.LIST.workspaceId),
        workspaceSlug: z.string().trim().optional().describe(USER_SECRETS.LIST.workspaceSlug),
        environment: z.string().trim().optional().describe(USER_SECRETS.LIST.environment)
      }),
      response: {
        200: z.object({
          secrets: secretRawSchema
            .extend({
              secretPath: z.string().optional()
            })
            .array(),
          imports: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              folderId: z.string().optional(),
              secrets: secretRawSchema.omit({ createdAt: true, updatedAt: true }).array()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      let secretPath = "/";

      let { environment, workspaceId } = req.query;
      if (req.auth.actor === ActorType.SERVICE) {
        const scope = ServiceTokenScopes.parse(req.auth.serviceToken.scopes);
        const isSingleScope = scope.length === 1;
        if (isSingleScope && !picomatch.scan(scope[0].secretPath).isGlob) {
          secretPath = scope[0].secretPath;
          environment = scope[0].environment;
          workspaceId = req.auth.serviceToken.projectId;
        }
      } else if (req.permission.type === ActorType.IDENTITY && req.query.workspaceSlug && !workspaceId) {
        const workspace = await server.services.project.getAProject({
          filter: {
            type: ProjectFilterType.SLUG,
            orgId: req.permission.orgId,
            slug: req.query.workspaceSlug
          },
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId
        });

        if (!workspace) throw new NotFoundError({ message: `No project found with slug ${req.query.workspaceSlug}` });

        workspaceId = workspace.id;
      }

      if (!workspaceId || !environment) throw new BadRequestError({ message: "Missing workspace id or environment" });

      const { secrets, imports } = await server.services.secret.getSecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        environment,
        actorAuthMethod: req.permission.authMethod,
        projectId: workspaceId,
        path: secretPath,
        isUserSecret: true
      });

      await server.services.auditLog.createAuditLog({
        projectId: workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_SECRETS,
          metadata: {
            environment,
            secretPath,
            numberOfSecrets: secrets.length
          }
        }
      });

      return { secrets, imports };
    }
  });

  server.route({
    method: "POST",
    url: "/raw/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Create user secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(USER_SECRETS.CREATE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(USER_SECRETS.CREATE.workspaceId),
        environment: z.string().trim().describe(USER_SECRETS.CREATE.environment),
        secretValue: z
          .string()
          .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
          .describe(USER_SECRETS.CREATE.secretValue),
        secretComment: z.string().trim().optional().default("").describe(USER_SECRETS.CREATE.secretComment),
        type: z.nativeEnum(UserSecretType).default(UserSecretType.Login).describe(USER_SECRETS.CREATE.type)
      }),
      response: {
        200: z.union([
          z.object({
            secret: secretRawSchema
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      switch (req.body.type) {
        case UserSecretType.Login: {
          await LoginUserSecretSchema.parseAsync(JSON.parse(req.body.secretValue));
          break;
        }
        default: {
          throw new BadRequestError({ message: `Unsupported secret type` });
        }
      }
      const secretOperation = await server.services.secret.createSecretRaw({
        secretPath: "/",
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        environment: req.body.environment,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.body.workspaceId,
        secretName: req.params.secretName,
        type: SecretType.Shared,
        secretValue: req.body.secretValue,
        isUserSecret: true
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }

      const { secret } = secretOperation;
      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_USER_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: "/",
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
      });

      return { secret };
    }
  });
};
