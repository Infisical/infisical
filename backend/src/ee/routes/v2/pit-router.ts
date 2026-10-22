import { z } from "zod";

import { SecretApprovalRequestsSchema, SecretFoldersSchema } from "@app/db/schemas";
import { EventType, SecretApprovalEvent } from "@app/ee/services/audit-log/audit-log-types";
import { RAW_SECRETS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { isValidFolderName } from "@app/lib/validator";
import { secretsLimit } from "@app/server/config/rateLimiter";
import { BaseSecretNameSchema, SecretNameSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { secretRawSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataWithEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const MAX_CHANGES_PER_OPERATION = 1000;

const SecretValueSchema = z.string().transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()));

const FolderNameSchema = z
  .string()
  .trim()
  .max(255)
  .refine((name) => isValidFolderName(name), {
    message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
  });

const CommitSecretSchema = secretRawSchema.extend({
  secretValueHidden: z.boolean()
});

const CommitApprovalSchema = SecretApprovalRequestsSchema.pick({
  id: true,
  slug: true,
  policyId: true,
  folderId: true,
  status: true,
  hasMerged: true,
  commitMessage: true,
  committerUserId: true,
  committerIdentityId: true,
  createdAt: true,
  updatedAt: true
});

const CommitFolderSchema = SecretFoldersSchema.pick({
  id: true,
  name: true,
  description: true,
  envId: true,
  parentId: true,
  version: true,
  createdAt: true,
  updatedAt: true
});

export const registerPITRouter = async (server: FastifyZodProvider) => {
  // A commit is one changeset against one folder, so its body groups creates, updates, and deletes of both
  // secrets and folders. That is intentional: it is the unit that is applied (or sent for approval) atomically
  // and recorded as a single entry in the folder's commit history.
  server.route({
    method: "POST",
    url: "/batch/commit",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: true,
      description:
        "Commit a set of secret and folder changes to one folder in a single atomic operation. When a change policy applies to the environment and path, the secret changes become an approval request instead of being applied.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z
        .object({
          // Not z.string().uuid(): project ids are varchar(36) and older projects still have pre-UUID ids
          projectId: z.string().trim().min(1).max(36),
          environment: z.string().trim().min(1).max(64),
          secretPath: z.string().trim().max(6144).default("/").transform(removeTrailingSlash),
          message: z.string().trim().max(255).optional(),
          secrets: z
            .object({
              create: z
                .object({
                  secretKey: SecretNameSchema.describe(RAW_SECRETS.CREATE.secretName),
                  secretValue: SecretValueSchema.describe(RAW_SECRETS.CREATE.secretValue),
                  secretComment: z.string().trim().optional().default("").describe(RAW_SECRETS.CREATE.secretComment),
                  skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.CREATE.skipMultilineEncoding),
                  secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
                  tagIds: z.string().uuid().array().max(100).optional().describe(RAW_SECRETS.CREATE.tagIds)
                })
                .array()
                .max(MAX_CHANGES_PER_OPERATION)
                .optional(),
              update: z
                .object({
                  secretKey: BaseSecretNameSchema.describe(RAW_SECRETS.UPDATE.secretName),
                  newSecretName: SecretNameSchema.optional().describe(RAW_SECRETS.UPDATE.newSecretName),
                  secretValue: SecretValueSchema.optional().describe(RAW_SECRETS.UPDATE.secretValue),
                  secretComment: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.secretComment),
                  skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.UPDATE.skipMultilineEncoding),
                  secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
                  tagIds: z.string().uuid().array().max(100).optional().describe(RAW_SECRETS.UPDATE.tagIds)
                })
                .array()
                .max(MAX_CHANGES_PER_OPERATION)
                .optional(),
              delete: z
                .object({
                  secretKey: BaseSecretNameSchema.describe(RAW_SECRETS.DELETE.secretName)
                })
                .array()
                .max(MAX_CHANGES_PER_OPERATION)
                .optional()
            })
            .optional(),
          folders: z
            .object({
              create: z
                .object({
                  folderName: FolderNameSchema,
                  description: z.string().trim().max(255).optional()
                })
                .array()
                .max(MAX_CHANGES_PER_OPERATION)
                .optional(),
              update: z
                .object({
                  id: z.string().uuid(),
                  folderName: FolderNameSchema,
                  description: z.string().trim().max(255).nullable().optional()
                })
                .array()
                .max(MAX_CHANGES_PER_OPERATION)
                .optional(),
              delete: z
                .object({
                  id: z.string().uuid()
                })
                .array()
                .max(MAX_CHANGES_PER_OPERATION)
                .optional()
            })
            .optional()
        })
        .refine(
          ({ secrets, folders }) =>
            [secrets?.create, secrets?.update, secrets?.delete, folders?.create, folders?.update, folders?.delete].some(
              (changes) => (changes?.length ?? 0) > 0
            ),
          { message: "A commit must contain at least one secret or folder change." }
        ),
      response: {
        201: z.object({
          commitId: z.string().uuid().nullable(),
          approval: CommitApprovalSchema.nullable(),
          secrets: z.object({
            created: CommitSecretSchema.array(),
            updated: CommitSecretSchema.array(),
            deleted: CommitSecretSchema.array()
          }),
          folders: z.object({
            created: CommitFolderSchema.array(),
            updated: CommitFolderSchema.array(),
            deleted: CommitFolderSchema.array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req, res) => {
      const {
        projectId,
        environment,
        secretPath,
        message = "",
        secrets: secretChanges,
        folders: folderChanges
      } = req.body;

      const result = await server.services.pit.processNewCommitRawV2({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectId,
        environment,
        secretPath,
        message,
        changes: {
          secrets: secretChanges ?? {},
          folders: folderChanges ?? {}
        }
      });
      const approval = "approval" in result && result.approval ? result.approval : null;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.PIT_PROCESS_NEW_COMMIT_RAW,
          metadata: {
            commitId: result.commitId,
            approvalId: approval?.id,
            projectId,
            environment,
            secretPath,
            message
          }
        }
      });

      for await (const event of result.secretMutationEvents) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId,
          event
        });
      }

      if (approval) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: approval.committerUserId,
              secretApprovalRequestId: approval.id,
              secretApprovalRequestSlug: approval.slug,
              secretPath,
              environment,
              secrets: [
                ...(secretChanges?.create ?? []),
                ...(secretChanges?.update ?? []),
                ...(secretChanges?.delete ?? [])
              ].map((secret) => ({ secretKey: secret.secretKey })),
              eventType: SecretApprovalEvent.Commit
            }
          }
        });
      }

      const secretEventProperties = {
        projectId,
        environment,
        secretPath,
        channel: getUserAgentType(req.headers["user-agent"]),
        ...req.auditLogInfo,
        actorType: req.permission.type
      };
      const secretEvents = [
        { event: PostHogEventTypes.SecretCreated, secrets: result.secrets.created },
        { event: PostHogEventTypes.SecretUpdated, secrets: result.secrets.updated },
        { event: PostHogEventTypes.SecretDeleted, secrets: result.secrets.deleted }
      ] as const;
      for await (const { event, secrets } of secretEvents) {
        if (secrets.length) {
          await server.services.telemetry.sendPostHogEvents({
            event,
            distinctId: getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: { numberOfSecrets: secrets.length, ...secretEventProperties }
          });
        }
      }

      await Promise.all([
        ...result.folders.created.map((folder) =>
          server.services.telemetry.sendPostHogEvents({
            event: PostHogEventTypes.SecretFolderCreated,
            distinctId: getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: { projectId, environment, folderPath: secretPath, folderId: folder.id }
          })
        ),
        ...result.folders.updated.map((folder) =>
          server.services.telemetry.sendPostHogEvents({
            event: PostHogEventTypes.SecretFolderUpdated,
            distinctId: getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: { projectId, environment, folderId: folder.id }
          })
        ),
        ...result.folders.deleted.map((folder) =>
          server.services.telemetry.sendPostHogEvents({
            event: PostHogEventTypes.SecretFolderDeleted,
            distinctId: getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: { projectId, environment, folderId: folder.id }
          })
        )
      ]).catch(() => {});

      void res.status(201);
      return {
        commitId: result.commitId ?? null,
        approval,
        secrets: result.secrets,
        folders: result.folders
      };
    }
  });
};
