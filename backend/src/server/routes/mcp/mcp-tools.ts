import { ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import { McpServer, StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { AccessScope, ProjectMembershipRole, ProjectType, SecretType, TSecretApprovalRequests } from "@app/db/schemas";
import { EventType, SecretApprovalEvent, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import {
  BadRequestError,
  ConflictError,
  ForbiddenRequestError,
  NotFoundError,
  UnauthorizedError
} from "@app/lib/errors";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { isValidFolderName } from "@app/lib/validator";
import { GenericResourceNameSchema, SecretNameSchema, slugSchema } from "@app/server/lib/schemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { OauthScope } from "@app/services/oauth-client/oauth-scope";
import {
  PersonalOverridesBehavior,
  SecretImportReferencesBehavior,
  SecretProtectionType
} from "@app/services/secret/secret-types";

const ProjectIdSchema = z.string().trim().min(1).max(36).describe("The project ID, from list-projects.");
const EnvironmentSlugSchema = slugSchema({ field: "Environment slug" }).describe(
  "The environment slug, from list-projects."
);
const PathSchema = z
  .string()
  .trim()
  .max(1024)
  .default("/")
  .transform(prefixWithSlash)
  .transform(removeTrailingSlash)
  .describe("The folder path, such as / or /app/database.");
const SecretValueSchema = z.string().transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()));

const SecretLocationSchema = z.object({
  projectId: ProjectIdSchema,
  environmentSlug: EnvironmentSlugSchema,
  secretPath: PathSchema
});

// The SDK validates arguments through Standard Schema, which zod 3 implements, and advertises them in tools/list
// as JSON Schema, which zod 3 cannot produce on its own.
const toToolInput = <T extends z.ZodTypeAny>(schema: T) => {
  const jsonSchema = () => zodToJsonSchema(schema) as Record<string, unknown>;
  return {
    "~standard": { ...schema["~standard"], jsonSchema: { input: jsonSchema, output: jsonSchema } }
  } as StandardSchemaWithJSON<z.input<T>, z.output<T>>;
};

const getToolErrorMessage = (error: unknown) => {
  if (error instanceof ForbiddenError) return `You are not allowed to ${error.action} on ${error.subjectType}`;
  if (
    error instanceof BadRequestError ||
    error instanceof NotFoundError ||
    error instanceof ForbiddenRequestError ||
    error instanceof UnauthorizedError ||
    error instanceof ConflictError
  ) {
    return error.message;
  }

  logger.error(error, "MCP tool call failed");
  return "Something went wrong while running this tool. Try again, and contact support if it keeps happening.";
};

type TRawSecret = {
  id: string;
  secretKey: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  secretPath?: string;
  version: number;
};

const toSecretOutput = ({
  id,
  secretKey,
  secretValue,
  secretValueHidden,
  secretComment,
  secretPath,
  version
}: TRawSecret) => ({
  id,
  secretKey,
  ...(secretValueHidden ? { secretValueHidden } : { secretValue }),
  secretComment,
  secretPath,
  version
});

type TSecretLocation = { projectId: string; environmentSlug: string; secretPath: string; secretName: string };

// One server per request, holding the caller's identity. Each tool does what the REST route behind it does: the
// same service call, audit log and read tracking, with the audit log marked as coming from MCP.
export const createMcpServer = (server: FastifyZodProvider, req: FastifyRequest) => {
  const mcpServer = new McpServer(
    { name: "infisical", version: "1.0.0" },
    { instructions: "Call list-projects first to find project IDs and environment slugs." }
  );

  const actor = {
    actor: req.permission.type,
    actorId: req.permission.id,
    actorOrgId: req.permission.orgId,
    actorAuthMethod: req.permission.authMethod
  };
  const auditLogInfo = { ...req.auditLogInfo, userAgentType: UserAgentType.MCP };
  const isOauth = req.auth.authMode === AuthMode.OAUTH;
  // A machine identity's role decides whether it reads values; a delegated token also needs the user's consent.
  const canReadSecretValues =
    req.auth.authMode !== AuthMode.OAUTH || Boolean(req.auth.token.scopes?.includes(OauthScope.SecretsRead));

  const submittedForApproval = async (
    approval: Pick<TSecretApprovalRequests, "id" | "slug" | "status" | "committerUserId">,
    { projectId, environmentSlug, secretPath, secretName }: TSecretLocation,
    eventType: SecretApprovalEvent
  ) => {
    await server.services.auditLog.createAuditLog({
      ...auditLogInfo,
      projectId,
      event: {
        type: EventType.SECRET_APPROVAL_REQUEST,
        metadata: {
          committedBy: approval.committerUserId,
          secretApprovalRequestId: approval.id,
          secretApprovalRequestSlug: approval.slug,
          secretPath,
          environment: environmentSlug,
          secretKey: secretName,
          eventType
        }
      }
    });

    return {
      approval: { id: approval.id, slug: approval.slug, status: approval.status },
      message: "This environment has a change policy, so the change was submitted for approval and is not applied yet."
    };
  };

  const registerTool = <T extends z.ZodTypeAny>(
    name: string,
    config: { description: string; inputSchema: T; annotations: ToolAnnotations; allowsOauth?: boolean },
    run: (args: z.output<T>) => Promise<unknown>
  ) => {
    if (isOauth && config.allowsOauth === false) return;

    mcpServer.registerTool(
      name,
      {
        description: config.description,
        inputSchema: toToolInput(config.inputSchema),
        annotations: config.annotations
      },
      async (args) => {
        try {
          // Scopes narrow a delegated token through the request context. Refuse rather than run unnarrowed if a
          // change in how the SDK dispatches tools ever loses it.
          if (isOauth && !requestContext.get(RequestContextKey.OauthScopes)) {
            throw new Error("OAuth scopes missing from the request context");
          }

          return { content: [{ type: "text" as const, text: JSON.stringify(await run(args)) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: getToolErrorMessage(error) }], isError: true };
        }
      }
    );
  };

  registerTool(
    "list-projects",
    {
      description: "List the Secrets Management projects you can access, with their environments.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => {
      const { projects } = await server.services.project.getProjects({
        ...actor,
        includeRoles: false,
        type: ProjectType.SecretManager
      });

      return projects.map(({ id, name, slug, description, environments }) => ({
        id,
        name,
        slug,
        description,
        environments: environments.map((env) => ({ name: env.name, slug: env.slug }))
      }));
    }
  );

  registerTool(
    "create-project",
    {
      description: "Create a Secrets Management project with the default environments.",
      inputSchema: z.object({
        projectName: GenericResourceNameSchema,
        description: z.string().trim().max(256).optional(),
        slug: slugSchema({ max: 64, field: "Project slug" }).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      // No delegation scope covers creating projects.
      allowsOauth: false
    },
    async ({ projectName, description, slug }) => {
      const project = await server.services.project.createProject({
        ...actor,
        projectName,
        projectDescription: description,
        slug,
        type: ProjectType.SecretManager
      });

      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        orgId: req.permission.orgId,
        projectId: project.id,
        event: {
          type: EventType.CREATE_PROJECT,
          metadata: { name: project.name, slug: project.slug, type: ProjectType.SecretManager }
        }
      });

      return { id: project.id, name: project.name, slug: project.slug };
    }
  );

  registerTool(
    "create-environment",
    {
      description: "Add an environment to a project.",
      inputSchema: z.object({
        projectId: ProjectIdSchema,
        name: GenericResourceNameSchema,
        slug: slugSchema({ field: "Environment slug" }),
        position: z.number().int().min(1).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      // Environments are project settings, which a delegated token cannot change.
      allowsOauth: false
    },
    async (args) => {
      const environment = await server.services.projectEnv.createEnvironment({ ...actor, ...args });

      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId: environment.projectId,
        event: { type: EventType.CREATE_ENVIRONMENT, metadata: { name: environment.name, slug: environment.slug } }
      });

      return { id: environment.id, name: environment.name, slug: environment.slug };
    }
  );

  registerTool(
    "list-folders",
    {
      description: "List the folders in a folder.",
      inputSchema: z.object({
        projectId: ProjectIdSchema,
        environmentSlug: EnvironmentSlugSchema,
        path: PathSchema,
        recursive: z.boolean().default(false).describe("Include folders in all subfolders.")
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ projectId, environmentSlug, path, recursive }) => {
      const folders = await server.services.folder.getFolders({
        ...actor,
        projectId,
        environment: environmentSlug,
        path,
        recursive
      });

      return folders.map(({ id, name, description }) => ({ id, name, description }));
    }
  );

  registerTool(
    "create-folder",
    {
      description: "Create a folder.",
      inputSchema: z.object({
        projectId: ProjectIdSchema,
        environmentSlug: EnvironmentSlugSchema,
        path: PathSchema.describe("The folder to create it in, such as / or /app."),
        name: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .refine(isValidFolderName, "Folder names can only contain letters, numbers, dashes and underscores."),
        description: z.string().trim().max(256).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ projectId, environmentSlug, path, name, description }) => {
      const folder = await server.services.folder.createFolder({
        ...actor,
        projectId,
        environment: environmentSlug,
        path,
        name,
        description
      });

      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_FOLDER,
          metadata: {
            environment: environmentSlug,
            folderId: folder.id,
            folderName: folder.name,
            folderPath: path,
            ...(description ? { description } : {})
          }
        }
      });

      return { id: folder.id, name: folder.name };
    }
  );

  registerTool(
    "list-secrets",
    {
      description: canReadSecretValues
        ? "List the secrets in a folder, with their values where you have permission to read them."
        : "List the secret names in a folder. Values are hidden because this connection was not granted secrets:read.",
      inputSchema: SecretLocationSchema.extend({
        recursive: z.boolean().default(false).describe("Include secrets in all subfolders."),
        expandSecretReferences: z.boolean().default(true),
        includeImports: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ projectId, environmentSlug, secretPath, recursive, expandSecretReferences, includeImports }) => {
      const { secrets, imports, etag, notModified } = await server.services.secret.getSecretsRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        path: secretPath,
        recursive,
        expandSecretReferences,
        includeImports,
        viewSecretValue: canReadSecretValues,
        personalOverridesBehavior: PersonalOverridesBehavior.NeverInclude,
        secretImportReferencesBehavior: SecretImportReferencesBehavior.Relative
      });

      if (canReadSecretValues) {
        void server.services.secretReadActivity.recordBulkRead({
          actor: req.permission.type,
          actorId: req.permission.id,
          projectId,
          environment: environmentSlug,
          secretPath,
          recursive,
          isFiltered: false,
          includeImports,
          expandSecretReferences,
          includesPersonalOverrides: false,
          notModified,
          etag,
          secrets,
          imports
        });
      }

      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRETS,
          metadata: { environment: environmentSlug, secretPath, numberOfSecrets: secrets.length }
        }
      });

      return {
        secrets: secrets.map(toSecretOutput),
        imports: imports?.map((secretImport) => ({
          environment: secretImport.environment,
          secretPath: secretImport.secretPath,
          secrets: secretImport.secrets.map(toSecretOutput)
        }))
      };
    }
  );

  registerTool(
    "get-secret",
    {
      description: canReadSecretValues
        ? "Get a secret by name, with its value if you have permission to read it."
        : "Get a secret by name, without its value, because this connection was not granted secrets:read.",
      inputSchema: SecretLocationSchema.extend({
        secretName: SecretNameSchema,
        expandSecretReferences: z.boolean().default(true),
        includeImports: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ projectId, environmentSlug, secretPath, secretName, expandSecretReferences, includeImports }) => {
      const secret = await server.services.secret.getSecretByNameRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        path: secretPath,
        secretName,
        type: SecretType.Shared,
        expandSecretReferences,
        expandPersonalOverrides: true,
        includeImports,
        viewSecretValue: canReadSecretValues
      });

      if (canReadSecretValues) {
        void server.services.secretReadActivity.recordRead({
          actor: req.permission.type,
          actorId: req.permission.id,
          projectId,
          secretIds: [secret.id],
          referencesExpanded: expandSecretReferences
        });
      }

      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET,
          metadata: {
            environment: environmentSlug,
            secretPath,
            secretId: secret.id,
            secretKey: secretName,
            secretVersion: secret.version,
            secretMetadata: secret.secretMetadata?.map((meta) => ({
              key: meta.key,
              isEncrypted: meta.isEncrypted,
              value: meta.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : meta.value
            }))
          }
        }
      });

      return toSecretOutput(secret);
    }
  );

  registerTool(
    "create-secret",
    {
      description: "Create a secret.",
      inputSchema: SecretLocationSchema.extend({
        secretName: SecretNameSchema,
        secretValue: SecretValueSchema,
        secretComment: z.string().trim().max(10_000).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async (args) => {
      const { projectId, environmentSlug, secretPath, secretName, secretValue, secretComment } = args;
      const secretOperation = await server.services.secret.createSecretRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        secretPath,
        secretName,
        secretValue,
        secretComment,
        type: SecretType.Shared
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        return submittedForApproval(secretOperation.approval, args, SecretApprovalEvent.Create);
      }

      const { secret } = secretOperation;
      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_SECRET,
          metadata: {
            environment: environmentSlug,
            secretPath,
            secretId: secret.id,
            secretKey: secretName,
            secretVersion: secret.version,
            secretTags: secret.tags?.map((tag) => tag.name)
          }
        }
      });

      return { id: secret.id, secretKey: secret.secretKey, version: secret.version };
    }
  );

  registerTool(
    "update-secret",
    {
      description: "Change a secret's value or comment, or rename it.",
      inputSchema: SecretLocationSchema.extend({
        secretName: SecretNameSchema,
        newSecretName: SecretNameSchema.optional(),
        secretValue: SecretValueSchema.optional(),
        secretComment: z.string().trim().max(10_000).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
    },
    async (args) => {
      const { projectId, environmentSlug, secretPath, secretName, newSecretName, secretValue, secretComment } = args;
      const secretOperation = await server.services.secret.updateSecretRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        secretPath,
        secretName,
        newSecretName,
        secretValue,
        secretComment,
        type: SecretType.Shared
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        return submittedForApproval(secretOperation.approval, args, SecretApprovalEvent.Update);
      }

      const { secret } = secretOperation;
      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_SECRET,
          metadata: {
            environment: environmentSlug,
            secretPath,
            secretId: secret.id,
            secretKey: secretName,
            secretVersion: secret.version,
            secretTags: secret.tags?.map((tag) => tag.name)
          }
        }
      });

      return { id: secret.id, secretKey: secret.secretKey, version: secret.version };
    }
  );

  registerTool(
    "delete-secret",
    {
      description: "Delete a secret from one environment and folder.",
      inputSchema: SecretLocationSchema.extend({ secretName: SecretNameSchema }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
    },
    async (args) => {
      const { projectId, environmentSlug, secretPath, secretName } = args;
      const secretOperation = await server.services.secret.deleteSecretRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        secretPath,
        secretName,
        type: SecretType.Shared
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        return submittedForApproval(secretOperation.approval, args, SecretApprovalEvent.Delete);
      }

      const { secret } = secretOperation;
      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.DELETE_SECRET,
          metadata: {
            environment: environmentSlug,
            secretPath,
            secretId: secret.id,
            secretKey: secretName,
            secretVersion: secret.version
          }
        }
      });

      return { id: secret.id, secretKey: secret.secretKey, deleted: true };
    }
  );

  registerTool(
    "invite-members-to-project",
    {
      description:
        "Add users to a project by email or username. Users outside the organization are invited to it first.",
      inputSchema: z
        .object({
          projectId: ProjectIdSchema,
          emails: z.string().trim().toLowerCase().email().array().max(100).default([]),
          usernames: z.string().trim().toLowerCase().min(1).max(255).array().max(100).default([]),
          roleSlugs: slugSchema({ field: "Role slug" }).array().min(1).max(10).optional()
        })
        .refine(
          ({ emails, usernames }) => emails.length || usernames.length,
          "Provide at least one email or username."
        ),
      annotations: { readOnlyHint: false, destructiveHint: false },
      // Project membership is administration, which a delegated token cannot change.
      allowsOauth: false
    },
    async ({ projectId, emails, usernames, roleSlugs }) => {
      const usernamesAndEmails = [...emails, ...usernames];

      await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        data: { roles: [], usernames: usernamesAndEmails, skipUsersWithOrgAccess: true }
      });

      const { memberships } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {
          roles: (roleSlugs || [ProjectMembershipRole.Member]).map((role) => ({ isTemporary: false, role })),
          usernames: usernamesAndEmails
        }
      });

      await server.services.auditLog.createAuditLog({
        ...auditLogInfo,
        projectId,
        event: {
          type: EventType.ADD_BATCH_PROJECT_MEMBER,
          metadata: {
            members: memberships.map(({ actorUserId, id }) => ({
              userId: actorUserId || "",
              membershipId: id,
              email: ""
            }))
          }
        }
      });

      return memberships.map(({ id, actorUserId }) => ({ membershipId: id, userId: actorUserId }));
    }
  );

  return mcpServer;
};
