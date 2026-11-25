import { nanoid } from "nanoid";
import { z } from "zod";

import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { SECRET_CHANGE_POLICIES } from "@app/lib/api-docs";
import { canonicalizeSecretPathPattern, hasDotPathSegment, removeTrailingSlash } from "@app/lib/fn";
import { EnforcementLevel } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { secretChangePolicyPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { DelegatedApprovalSchema } from "@app/services/delegated-approval/delegated-approval-schemas";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SECRET_PATH_DOT_SEGMENT_ERR_MSG = "Secret path cannot contain '.' or '..' as a folder name";

export const registerSecretApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createSecretApprovalPolicy",
      body: z
        .object({
          projectId: z.string(),
          name: z.string().optional(),
          environment: z.string().optional(),
          environments: z.string().array().optional(),
          secretPath: z
            .string()
            .min(1, { message: "Secret path cannot be empty" })
            .max(1024)
            .refine((val) => !hasDotPathSegment(val), SECRET_PATH_DOT_SEGMENT_ERR_MSG)
            .transform(canonicalizeSecretPathPattern),
          approvers: z
            .discriminatedUnion("type", [
              z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
              z.object({
                type: z.literal(ApproverType.User),
                id: z.string().optional(),
                username: z.string().optional()
              })
            ])
            .array()
            .min(1, { message: "At least one approver should be provided" })
            .max(100, "Cannot have more than 100 approvers"),
          bypassers: z
            .discriminatedUnion("type", [
              z.object({ type: z.literal(BypasserType.Group), id: z.string() }),
              z.object({
                type: z.literal(BypasserType.User),
                id: z.string().optional(),
                username: z.string().optional()
              })
            ])
            .array()
            .max(100, "Cannot have more than 100 bypassers")
            .optional(),
          approvals: z.number().min(1).default(1),
          enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
          allowedSelfApprovals: z.boolean().default(true),
          enforceOnSecretImports: z.boolean().default(false).describe(SECRET_CHANGE_POLICIES.enforceOnSecretImports),
          bypassForMachineIdentities: z.boolean().default(false),
          delegatedApproval: DelegatedApprovalSchema.optional().describe(
            "Not supported on secret change policies. Only secret access policies can be handled by a delegated approval system, so sending this returns an error."
          )
        })
        .refine((data) => data.environment || data.environments, "At least one environment should be provided"),
      response: {
        200: z.object({
          approval: secretChangePolicyPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretChangePolicy.createSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        name: req.body.name ?? `${req.body.environment || req.body.environments?.join(",")}-${nanoid(3)}`,
        enforcementLevel: req.body.enforcementLevel
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretApprovalPolicyCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            policyId: approval.id,
            projectId: approval.projectId,
            environments: approval.environments.map((e) => e.slug),
            secretPath: req.body.secretPath,
            approvals: req.body.approvals,
            enforcementLevel: req.body.enforcementLevel,
            enforceOnSecretImports: approval.enforceOnSecretImports,
            ...req.auditLogInfo
          }
        })
        .catch(() => {});

      return { approval };
    }
  });

  server.route({
    url: "/:sapId",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateSecretApprovalPolicy",
      params: z.object({
        sapId: z.string()
      }),
      body: z.object({
        name: z.string().optional(),
        approvers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
            z.object({ type: z.literal(ApproverType.User), id: z.string().optional(), username: z.string().optional() })
          ])
          .array()
          .min(1, { message: "At least one approver should be provided" })
          .max(100, "Cannot have more than 100 approvers"),
        bypassers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(BypasserType.Group), id: z.string() }),
            z.object({ type: z.literal(BypasserType.User), id: z.string().optional(), username: z.string().optional() })
          ])
          .array()
          .max(100, "Cannot have more than 100 bypassers")
          .optional(),
        approvals: z.number().min(1).default(1),
        secretPath: z
          .string()
          .trim()
          .min(1, { message: "Secret path cannot be empty" })
          .max(1024)
          .refine((val) => !hasDotPathSegment(val), SECRET_PATH_DOT_SEGMENT_ERR_MSG)
          .optional()
          .transform((val) => (val ? canonicalizeSecretPathPattern(val) : undefined)),
        enforcementLevel: z.nativeEnum(EnforcementLevel).optional(),
        allowedSelfApprovals: z.boolean().default(true),
        enforceOnSecretImports: z.boolean().optional().describe(SECRET_CHANGE_POLICIES.enforceOnSecretImports),
        bypassForMachineIdentities: z.boolean().optional(),
        environments: z.array(z.string()).optional(),
        delegatedApproval: DelegatedApprovalSchema.optional().describe(
          "Not supported on secret change policies. Only secret access policies can be handled by a delegated approval system, so sending this returns an error."
        )
      }),
      response: {
        200: z.object({
          approval: secretChangePolicyPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretChangePolicy.updateSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        secretPolicyId: req.params.sapId
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretApprovalPolicyUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { policyId: req.params.sapId, enforceOnSecretImports: approval.enforceOnSecretImports }
        })
        .catch(() => {});

      return { approval };
    }
  });

  server.route({
    url: "/:sapId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteSecretApprovalPolicy",
      params: z.object({
        sapId: z.string()
      }),
      response: {
        200: z.object({
          approval: secretChangePolicyPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretChangePolicy.deleteSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPolicyId: req.params.sapId
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretApprovalPolicyDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            policyId: approval.id,
            projectId: approval.projectId,
            ...req.auditLogInfo
          }
        })
        .catch(() => {});

      return { approval };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSecretApprovalPolicies",
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: secretChangePolicyPubSchema
            .extend({
              approvers: z
                .object({
                  id: z.string().nullable().optional(),
                  type: z.nativeEnum(ApproverType)
                })
                .array(),
              bypassers: z
                .object({
                  id: z.string().nullable().optional(),
                  type: z.nativeEnum(BypasserType)
                })
                .array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const approvals = await server.services.secretChangePolicy.getSecretApprovalPolicyByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId
      });
      return { approvals };
    }
  });

  server.route({
    url: "/:sapId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretApprovalPolicy",
      params: z.object({
        sapId: z.string()
      }),
      response: {
        200: z.object({
          approval: secretChangePolicyPubSchema.extend({
            approvers: z
              .object({
                id: z.string().nullable().optional(),
                type: z.nativeEnum(ApproverType),
                username: z.string().nullable().optional()
              })
              .array(),
            bypassers: z
              .object({
                id: z.string().nullable().optional(),
                type: z.nativeEnum(BypasserType),
                username: z.string().nullable().optional()
              })
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const approval = await server.services.secretChangePolicy.getSecretApprovalPolicyById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      return { approval };
    }
  });

  server.route({
    url: "/:sapId/imports",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "listSecretApprovalPolicyImports",
      description: SECRET_CHANGE_POLICIES.LIST_IMPORTS.description,
      params: z.object({
        sapId: z.string().uuid().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.sapId)
      }),
      querystring: z.object({
        isReplication: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional()
          .describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.isReplicationFilter)
      }),
      response: {
        200: z.object({
          imports: z
            .object({
              id: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.id),
              environment: z
                .object({
                  slug: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.environmentSlug),
                  name: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.environmentName)
                })
                .describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.environment),
              secretPath: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.secretPath),
              sourceEnvironment: z
                .object({
                  slug: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.environmentSlug),
                  name: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.environmentName)
                })
                .describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.sourceEnvironment),
              sourceSecretPath: z.string().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.sourceSecretPath),
              isReplication: z.boolean().describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.isReplication)
            })
            .array()
            .describe(SECRET_CHANGE_POLICIES.LIST_IMPORTS.imports)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const imports = await server.services.secretChangePolicy.listSecretApprovalPolicyImports({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        sapId: req.params.sapId,
        isReplication: req.query.isReplication
      });
      return { imports };
    }
  });

  server.route({
    url: "/board",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretApprovalPolicyBoard",
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          policy: secretChangePolicyPubSchema
            .extend({
              userApprovers: z.object({ userId: z.string().nullable().optional() }).array()
            })
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const policy = await server.services.secretChangePolicy.getSecretApprovalPolicyOfFolder({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      return { policy };
    }
  });
};
