import { z } from "zod";

import {
  AGENT_VAULT_SKILL_NAME_MAX_LENGTH,
  AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT,
  skillSizeBucket
} from "@app/ee/services/agent-vault-skill/agent-vault-skill-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext } from "./agent-vault-router-fns";
import {
  agentVaultListQuery,
  AgentVaultSkillDetailSchema,
  AgentVaultSkillFilesResponseSchema,
  AgentVaultSkillSchema,
  AgentVaultSkillUpdateSchema,
  AgentVaultSkillUploadSchema,
  AgentVaultSkillVersionParamSchema,
  AgentVaultSkillVersionSchema,
  AgentVaultSkillVersionWithFilesSchema
} from "./agent-vault-schemas";

const SkillIdParamsSchema = z.object({
  skillId: z.string().uuid().describe(AGENT_VAULT.SKILL.skillId)
});

const SkillVersionParamsSchema = SkillIdParamsSchema.extend({ version: AgentVaultSkillVersionParamSchema });

export const registerAgentVaultSkillRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    bodyLimit: AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT,
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultSkill",
      description:
        "Add a skill to Agent Vault from its folder of files. The name comes from the `name` in SKILL.md, and the files become version 1.",
      tags: [ApiDocsTags.AgentVaultSkills],
      body: AgentVaultSkillUploadSchema,
      response: { 200: z.object({ skill: AgentVaultSkillSchema, version: AgentVaultSkillVersionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, version } = await server.services.agentVaultSkill.createSkill({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        files: req.body.files
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SKILL_CREATE,
          metadata: { skillId: skill.id, skillName: skill.name, version: version.version, sha256: version.sha256 }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultSkillCreated,
        properties: {
          skillId: skill.id,
          fileCount: version.fileCount,
          sizeBucket: skillSizeBucket(version.sizeBytes)
        }
      });

      return { skill, version };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultSkills",
      description:
        "List the skills in Agent Vault and the access bundles each is in, ordered by name. A member sees only the skills on access bundles they have been granted.",
      tags: [ApiDocsTags.AgentVaultSkills],
      querystring: z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(AGENT_VAULT_SKILL_NAME_MAX_LENGTH)
          .optional()
          .describe(AGENT_VAULT.SKILL.nameFilter),
        ...agentVaultListQuery(AGENT_VAULT.SKILL)
      }),
      response: {
        200: z.object({
          skills: AgentVaultSkillDetailSchema.array(),
          totalCount: z.number().describe(AGENT_VAULT.SKILL.totalCount)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultSkill.listSkills({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.query
      })
  });

  server.route({
    method: "GET",
    url: "/:skillId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultSkill",
      description:
        "Get a skill in Agent Vault, the access bundles it is in, and the files of its latest version. A member can get only a skill on an access bundle they have been granted.",
      tags: [ApiDocsTags.AgentVaultSkills],
      params: SkillIdParamsSchema,
      response: {
        200: z.object({
          skill: AgentVaultSkillDetailSchema.extend({
            files: AgentVaultSkillFilesResponseSchema.describe(AGENT_VAULT.SKILL.latestFiles)
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, version } = await server.services.agentVaultSkill.getSkill({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        skillId: req.params.skillId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SKILL_VERSION_VIEW,
          metadata: { skillId: skill.id, skillName: skill.name, version }
        }
      });

      return { skill };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:skillId",
    bodyLimit: AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT,
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultSkill",
      description:
        "Update a skill's files. Each change is saved as a new version; if the files match the latest version, nothing is saved and that version is returned. If the `name` in SKILL.md differs, the skill is renamed, unless another skill already has that name.",
      tags: [ApiDocsTags.AgentVaultSkills],
      params: SkillIdParamsSchema,
      body: AgentVaultSkillUpdateSchema,
      response: {
        200: z.object({
          skill: AgentVaultSkillSchema,
          version: AgentVaultSkillVersionSchema,
          unchanged: z.boolean().describe(AGENT_VAULT.SKILL.unchanged)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, version, unchanged, previousName } = await server.services.agentVaultSkill.updateSkill({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        skillId: req.params.skillId,
        files: req.body.files,
        baseVersion: req.body.baseVersion
      });

      if (!unchanged) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalAgentVaultProjectId,
          event: {
            type: EventType.AGENT_VAULT_SKILL_VERSION_CREATE,
            metadata: { skillId: skill.id, skillName: skill.name, version: version.version, sha256: version.sha256 }
          }
        });

        if (previousName) {
          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId: req.internalAgentVaultProjectId,
            event: {
              type: EventType.AGENT_VAULT_SKILL_RENAME,
              metadata: { skillId: skill.id, oldName: previousName, newName: skill.name }
            }
          });
        }

        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultSkillVersionPublished,
          properties: {
            skillId: skill.id,
            version: version.version,
            isRestore: false,
            fileCount: version.fileCount,
            sizeBucket: skillSizeBucket(version.sizeBytes)
          }
        });
      }

      return { skill, version, unchanged };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:skillId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultSkill",
      description: "Delete a skill from Agent Vault. It is removed from every access bundle.",
      tags: [ApiDocsTags.AgentVaultSkills],
      params: SkillIdParamsSchema,
      response: { 200: z.object({ skill: AgentVaultSkillSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, removedFromBundles } = await server.services.agentVaultSkill.deleteSkill({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        skillId: req.params.skillId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SKILL_DELETE,
          metadata: {
            skillId: skill.id,
            skillName: skill.name,
            removedFromBundles: removedFromBundles.map((bundle) => ({ id: bundle.id, name: bundle.name }))
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultSkillDeleted,
        properties: { skillId: skill.id, removedBundleCount: removedFromBundles.length }
      });

      return { skill };
    }
  });

  server.route({
    method: "GET",
    url: "/:skillId/versions",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultSkillVersions",
      description: "List the kept versions of a skill, newest first. Only admins can list versions.",
      tags: [ApiDocsTags.AgentVaultSkills],
      params: SkillIdParamsSchema,
      response: { 200: z.object({ versions: AgentVaultSkillVersionSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultSkill.listVersions({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        skillId: req.params.skillId
      })
  });

  server.route({
    method: "GET",
    url: "/:skillId/versions/:version",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultSkillVersion",
      description:
        "Get one version of a skill with its files. A member can get only the latest version of a skill on an access bundle they have been granted.",
      tags: [ApiDocsTags.AgentVaultSkills],
      params: SkillVersionParamsSchema,
      response: { 200: z.object({ version: AgentVaultSkillVersionWithFilesSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, version } = await server.services.agentVaultSkill.getVersionFiles({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        skillId: req.params.skillId,
        version: req.params.version
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SKILL_VERSION_VIEW,
          metadata: { skillId: skill.id, skillName: skill.name, version: version.version }
        }
      });

      return { version };
    }
  });

  server.route({
    method: "POST",
    url: "/:skillId/versions/:version/restore",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "restoreAgentVaultSkillVersion",
      description:
        "Restore an earlier version of a skill by publishing a copy of its files as a new version. The versions in between are kept. The skill keeps its current name: if the restored SKILL.md names it differently, its `name` line is changed to the current name. If the files match the latest version, nothing is published and that version is returned.",
      tags: [ApiDocsTags.AgentVaultSkills],
      params: SkillVersionParamsSchema,
      response: {
        200: z.object({
          skill: AgentVaultSkillSchema,
          version: AgentVaultSkillVersionSchema,
          unchanged: z.boolean().describe(AGENT_VAULT.SKILL.restoreUnchanged)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, version, fromVersion, unchanged } = await server.services.agentVaultSkill.restoreVersion({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        skillId: req.params.skillId,
        version: req.params.version
      });

      if (unchanged) return { skill, version, unchanged };

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SKILL_VERSION_RESTORE,
          metadata: {
            skillId: skill.id,
            skillName: skill.name,
            version: version.version,
            restoredFromVersion: fromVersion,
            sha256: version.sha256
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultSkillVersionPublished,
        properties: {
          skillId: skill.id,
          version: version.version,
          isRestore: true,
          fileCount: version.fileCount,
          sizeBucket: skillSizeBucket(version.sizeBytes)
        }
      });

      return { skill, version, unchanged };
    }
  });
};
