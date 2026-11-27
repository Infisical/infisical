import { z } from "zod";

import { ProjectType, SecretType, TSecretApprovalRequests } from "@app/db/schemas";
import { EventType, SecretApprovalEvent, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { FOLDERS, PROJECTS, RAW_SECRETS } from "@app/lib/api-docs";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { ForbiddenRequestError } from "@app/lib/errors";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { isValidFolderName } from "@app/lib/validator";
import { BaseSecretNameSchema, GenericResourceNameSchema, SecretNameSchema, slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { OauthScope } from "@app/services/oauth-client/oauth-scope";
import {
  PersonalOverridesBehavior,
  SecretImportReferencesBehavior,
  SecretProtectionType
} from "@app/services/secret/secret-types";
import { PostHogEventTypes, TSecretModifiedEvent } from "@app/services/telemetry/telemetry-types";

import { ProjectIdSchema, TMcpToolContext } from "../mcp-tool-fns";

// Lookups accept what the REST routes accept, so secrets and environments named before today's rules stay reachable.
const EnvironmentSlugSchema = z.string().trim().min(1).max(255).describe("The environment slug, from list-projects.");
// Secret keys are stored in a 500-character column.
const SecretLookupNameSchema = BaseSecretNameSchema.max(500);
const NewSecretNameSchema = SecretLookupNameSchema.pipe(SecretNameSchema);
const PathSchema = z
  .string()
  .trim()
  .max(1024)
  .default("/")
  .transform(prefixWithSlash)
  .transform(removeTrailingSlash)
  .describe(
    "The folder path. / is the root folder, which every environment has, and every other folder, such as /app/database, sits under it."
  );
const SecretValueSchema = z.string().transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()));
const SecretCommentSchema = z.string().trim().max(10_000);
const SecretTypeSchema = z
  .nativeEnum(SecretType)
  .default(SecretType.Shared)
  .describe(
    "shared is the secret everyone with access uses. personal is your own value for the shared secret with the same name, which only you can see."
  );

const SecretLocationSchema = z.object({
  projectId: ProjectIdSchema,
  environmentSlug: EnvironmentSlugSchema,
  secretPath: PathSchema
});

type TRawSecret = {
  id: string;
  secretKey: string;
  type: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  secretPath?: string;
  version: number;
};

type TSecretLocation = z.output<typeof SecretLocationSchema> & { secretName: string };

// Each tool does what the REST route behind it does: the same service call, audit log and read tracking, with the
// audit log marked as coming from MCP.
export const registerSecretManagerTools = ({
  server,
  req,
  scopes,
  actor,
  auditLogInfo,
  sendEvent,
  registerTool
}: TMcpToolContext) => {
  // Describe Only grants names and metadata; values also need the user's consent to secrets:read.
  const canReadSecretValues = scopes.includes(OauthScope.SecretsRead);

  // The service never masks the user's own personal secrets, so a connection without secrets:read is masked here.
  const $toSecretOutput = ({
    id,
    secretKey,
    type,
    secretValue,
    secretValueHidden,
    secretComment,
    secretPath,
    version
  }: TRawSecret) => ({
    id,
    secretKey,
    type,
    ...(secretValueHidden || !canReadSecretValues ? { secretValueHidden: true } : { secretValue }),
    secretComment,
    secretPath,
    version
  });

  // The services behind list-projects and list-folders check membership but no ability, so the scopes never narrow
  // them. Without this a write-only connection could list what it was not allowed to see.
  const $assertCanSeeProjectContents = () => {
    if (!canReadSecretValues && !scopes.includes(OauthScope.SecretsDescribe)) {
      throw new ForbiddenRequestError({
        message:
          "This connection wasn't granted access to see projects and folders. Reconnect and choose Describe Only, Read Only or Full Access."
      });
    }
  };

  // The service lets users manage their own personal secrets with describe access alone, which Describe Only and Read
  // Only connections are granted, so only the scope stops those connections from changing them.
  const $assertCanWritePersonalSecret = (type: SecretType) => {
    if (type === SecretType.Personal && !scopes.includes(OauthScope.SecretsWrite)) {
      throw new ForbiddenRequestError({
        message: "This connection wasn't granted access to change personal secrets. Reconnect and choose Full Access."
      });
    }
  };

  // The product analytics event the tool's REST route sends, with MCP as the channel.
  const $sendSecretsEvent = (
    event: TSecretModifiedEvent["event"],
    { projectId, environmentSlug, secretPath }: z.output<typeof SecretLocationSchema>,
    numberOfSecrets = 1
  ) =>
    sendEvent({
      event,
      distinctId: getTelemetryDistinctId(req),
      organizationId: req.permission.orgId,
      properties: {
        numberOfSecrets,
        projectId,
        environment: environmentSlug,
        secretPath,
        channel: UserAgentType.REMOTE_MCP,
        ...auditLogInfo,
        actorType: req.permission.type
      }
    });

  const $submittedForApproval = async (
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
      message: `${secretPath} in ${environmentSlug} has a secret change policy, so the change was submitted for approval. It applies once the request is approved and merged.`
    };
  };

  const $appliedSecretWrite = async (
    type: EventType.CREATE_SECRET | EventType.UPDATE_SECRET,
    { projectId, environmentSlug, secretPath, secretName }: TSecretLocation,
    secret: { id: string; secretKey: string; version: number; tags?: { name: string }[] }
  ) => {
    await server.services.auditLog.createAuditLog({
      ...auditLogInfo,
      projectId,
      event: {
        type,
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
  };

  registerTool(
    "list-projects",
    {
      description: "List the Secrets Management projects you can access, with their environments.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => {
      $assertCanSeeProjectContents();
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
        projectName: GenericResourceNameSchema.describe(PROJECTS.CREATE.projectName),
        description: z.string().trim().max(256).optional().describe(PROJECTS.CREATE.projectDescription),
        slug: slugSchema({ max: 64, field: "Project slug" }).optional().describe(PROJECTS.CREATE.slug)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ projectName, description, slug }) => {
      const project = await server.services.project.createProject({
        ...actor,
        projectName,
        projectDescription: description,
        slug,
        type: ProjectType.SecretManager
      });

      await sendEvent({
        event: PostHogEventTypes.ProjectCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: project.orgId,
          name: project.name,
          projectType: ProjectType.SecretManager,
          ...auditLogInfo
        }
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
    "list-folders",
    {
      description: "List the folders in a folder.",
      inputSchema: SecretLocationSchema.extend({
        recursive: z.boolean().default(false).describe(FOLDERS.LIST.recursive)
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ projectId, environmentSlug, secretPath, recursive }) => {
      $assertCanSeeProjectContents();
      const folders = await server.services.folder.getFolders({
        ...actor,
        projectId,
        environment: environmentSlug,
        path: secretPath,
        recursive
      });

      // The other tools take a path, not an ID. A recursive listing gives each folder's path below secretPath; a flat one
      // gives only its name.
      return folders.map((folder) => {
        const pathBelow = "relativePath" in folder ? folder.relativePath : `/${folder.name}`;
        return {
          id: folder.id,
          name: folder.name,
          description: folder.description,
          path: secretPath === "/" ? pathBelow : `${secretPath}${pathBelow}`
        };
      });
    }
  );

  registerTool(
    "create-folder",
    {
      description: "Create a folder.",
      inputSchema: SecretLocationSchema.extend({
        secretPath: PathSchema.describe("The folder to create it in, such as / or /app."),
        name: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .refine(isValidFolderName, "Folder names can only contain letters, numbers, dashes and underscores.")
          .describe(FOLDERS.CREATE.name),
        description: z.string().trim().max(256).optional().describe(FOLDERS.CREATE.description)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ projectId, environmentSlug, secretPath, name, description }) => {
      const folder = await server.services.folder.createFolder({
        ...actor,
        projectId,
        environment: environmentSlug,
        path: secretPath,
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
            folderPath: secretPath,
            ...(description ? { description } : {})
          }
        }
      });

      await sendEvent({
        event: PostHogEventTypes.SecretFolderCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: { projectId, environment: environmentSlug, folderPath: secretPath, folderId: folder.id }
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
        recursive: z.boolean().default(false).describe(RAW_SECRETS.LIST.recursive),
        expandSecretReferences: z.boolean().default(true).describe(RAW_SECRETS.LIST.expand),
        includeImports: z.boolean().default(true).describe(RAW_SECRETS.LIST.includeImports),
        includePersonalOverrides: z.boolean().default(false).describe(RAW_SECRETS.LIST.includePersonalOverrides)
      }),
      annotations: { readOnlyHint: true }
    },
    async ({
      projectId,
      environmentSlug,
      secretPath,
      recursive,
      expandSecretReferences,
      includeImports,
      includePersonalOverrides
    }) => {
      // References expanded with the reader's own overrides are credited to the secrets they resolved to.
      const referencedSecretIds: string[] = [];
      const { secrets, imports, etag, notModified } = await server.services.secret.getSecretsRaw({
        ...actor,
        onSecretReferenced: (secretId) => referencedSecretIds.push(secretId),
        projectId,
        environment: environmentSlug,
        path: secretPath,
        recursive,
        expandSecretReferences,
        includeImports,
        viewSecretValue: canReadSecretValues,
        // A secret whose value the user can't read comes back with its value hidden instead of failing the whole list.
        throwOnMissingReadValuePermission: false,
        personalOverridesBehavior: includePersonalOverrides
          ? PersonalOverridesBehavior.Priority
          : PersonalOverridesBehavior.NeverInclude,
        expandPersonalOverrides: includePersonalOverrides,
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
          includesPersonalOverrides: includePersonalOverrides,
          notModified,
          etag,
          secrets,
          imports,
          referencedSecretIds: includePersonalOverrides && expandSecretReferences ? referencedSecretIds : undefined
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

      await $sendSecretsEvent(
        PostHogEventTypes.SecretPulled,
        { projectId, environmentSlug, secretPath },
        secrets.length
      );

      return {
        secrets: secrets.map($toSecretOutput),
        imports: imports?.map((secretImport) => ({
          environment: secretImport.environment,
          secretPath: secretImport.secretPath,
          secrets: secretImport.secrets.map($toSecretOutput)
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
        secretName: SecretLookupNameSchema.describe(RAW_SECRETS.GET.secretName),
        expandSecretReferences: z.boolean().default(true).describe(RAW_SECRETS.GET.expand),
        includeImports: z.boolean().default(true).describe(RAW_SECRETS.GET.includeImports),
        type: SecretTypeSchema
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ projectId, environmentSlug, secretPath, secretName, expandSecretReferences, includeImports, type }) => {
      const referencedSecretIds: string[] = [];
      const secret = await server.services.secret.getSecretByNameRaw({
        ...actor,
        onSecretReferenced: (secretId) => referencedSecretIds.push(secretId),
        projectId,
        environment: environmentSlug,
        path: secretPath,
        secretName,
        type,
        expandSecretReferences,
        expandPersonalOverrides: true,
        includeImports,
        viewSecretValue: canReadSecretValues
      });

      if (canReadSecretValues) {
        // A personal secret expands through the reader's own overrides, so the secrets its references resolved to are
        // credited in place of matching references by key.
        const usesOverrides = type === SecretType.Personal && expandSecretReferences;
        void server.services.secretReadActivity.recordRead({
          actor: req.permission.type,
          actorId: req.permission.id,
          projectId,
          secretIds: usesOverrides ? [secret.id, ...referencedSecretIds] : [secret.id],
          referencesExpanded: usesOverrides ? false : expandSecretReferences
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

      await $sendSecretsEvent(PostHogEventTypes.SecretPulled, { projectId, environmentSlug, secretPath });

      return $toSecretOutput(secret);
    }
  );

  registerTool(
    "create-secret",
    {
      description: "Create a secret.",
      inputSchema: SecretLocationSchema.extend({
        secretName: NewSecretNameSchema.describe(RAW_SECRETS.CREATE.secretName),
        secretValue: SecretValueSchema.describe(RAW_SECRETS.CREATE.secretValue),
        secretComment: SecretCommentSchema.optional().describe(RAW_SECRETS.CREATE.secretComment),
        type: SecretTypeSchema
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async (args) => {
      const { projectId, environmentSlug, secretPath, secretName, secretValue, secretComment, type } = args;
      $assertCanWritePersonalSecret(type);
      const secretOperation = await server.services.secret.createSecretRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        secretPath,
        secretName,
        secretValue,
        secretComment,
        type
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        return $submittedForApproval(secretOperation.approval, args, SecretApprovalEvent.Create);
      }

      await $sendSecretsEvent(PostHogEventTypes.SecretCreated, args);
      return $appliedSecretWrite(EventType.CREATE_SECRET, args, secretOperation.secret);
    }
  );

  registerTool(
    "update-secret",
    {
      description: "Modify an existing secret's key, value, or comment.",
      inputSchema: SecretLocationSchema.extend({
        secretName: SecretLookupNameSchema.describe(RAW_SECRETS.UPDATE.secretName),
        newSecretName: NewSecretNameSchema.optional().describe(RAW_SECRETS.UPDATE.newSecretName),
        secretValue: SecretValueSchema.optional().describe(RAW_SECRETS.UPDATE.secretValue),
        secretComment: SecretCommentSchema.optional().describe(RAW_SECRETS.UPDATE.secretComment),
        type: SecretTypeSchema
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
    },
    async (args) => {
      const { projectId, environmentSlug, secretPath, secretName, newSecretName, secretValue, secretComment, type } =
        args;
      $assertCanWritePersonalSecret(type);
      const secretOperation = await server.services.secret.updateSecretRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        secretPath,
        secretName,
        newSecretName,
        secretValue,
        secretComment,
        type
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        return $submittedForApproval(secretOperation.approval, args, SecretApprovalEvent.Update);
      }

      await $sendSecretsEvent(PostHogEventTypes.SecretUpdated, args);
      return $appliedSecretWrite(EventType.UPDATE_SECRET, args, secretOperation.secret);
    }
  );

  registerTool(
    "delete-secret",
    {
      description: "Delete a secret from one environment and folder.",
      inputSchema: SecretLocationSchema.extend({
        secretName: SecretLookupNameSchema.describe(RAW_SECRETS.DELETE.secretName),
        type: SecretTypeSchema
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
    },
    async (args) => {
      const { projectId, environmentSlug, secretPath, secretName, type } = args;
      $assertCanWritePersonalSecret(type);
      const secretOperation = await server.services.secret.deleteSecretRaw({
        ...actor,
        projectId,
        environment: environmentSlug,
        secretPath,
        secretName,
        type
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        return $submittedForApproval(secretOperation.approval, args, SecretApprovalEvent.Delete);
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

      await $sendSecretsEvent(PostHogEventTypes.SecretDeleted, args);

      return { id: secret.id, secretKey: secret.secretKey, deleted: true };
    }
  );
};
