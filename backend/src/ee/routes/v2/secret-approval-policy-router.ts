import { nanoid } from "nanoid";
import { z } from "zod";

import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { removeTrailingSlash } from "@app/lib/fn";
import { EnforcementLevel } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { secretChangePolicyPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { DelegatedApprovalSchema } from "@app/services/delegated-approval/delegated-approval-schemas";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const environmentSlugSchema = slugSchema({ max: 64, field: "Environment slug" });
// Room for 63 environment slugs at their maximum length, plus the commas between them.
const MAX_ENVIRONMENTS_QUERY_LENGTH = 4096;

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
            .transform((val) => removeTrailingSlash(val)),
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
          enforceImportReplication: z
            .boolean()
            .default(false)
            .describe(
              "When true, imports from the same project into the folders this policy governs must respect approval policies, so changes to their values need approval. Existing imports that read their source directly are not changed and have to be recreated. Imports from other projects are not affected."
            ),
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
            enforceImportReplication: approval.enforceImportReplication,
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
          .optional()
          .transform((val) => (val ? removeTrailingSlash(val) : undefined)),
        enforcementLevel: z.nativeEnum(EnforcementLevel).optional(),
        allowedSelfApprovals: z.boolean().default(true),
        enforceImportReplication: z
          .boolean()
          .optional()
          .describe(
            "When true, imports from the same project into the folders this policy governs must respect approval policies, so changes to their values need approval. Existing imports that read their source directly are not changed and have to be recreated. Imports from other projects are not affected."
          ),
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
          properties: { policyId: req.params.sapId, enforceImportReplication: approval.enforceImportReplication }
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
    url: "/non-replication-imports",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSecretApprovalPolicyNonReplicationImports",
      description:
        "List the imports from the same project that read their source directly, in the folders a secret change policy with these settings would govern. With 'Require approval for imported secrets' on, each of these has to be recreated as an import that respects approval policies.",
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36),
        environments: z
          .string()
          .trim()
          .min(1)
          .max(MAX_ENVIRONMENTS_QUERY_LENGTH)
          .superRefine((val, ctx) => {
            val.split(",").forEach((slug) => {
              const result = environmentSlugSchema.safeParse(slug.trim());
              if (!result.success) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error.issues[0].message });
              }
            });
          })
          .describe("Comma-separated list of environment slugs the policy applies to"),
        secretPath: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .describe("The policy's secret path, which can be a glob pattern"),
        policyId: z.string().uuid().optional().describe("The policy being edited, if any")
      }),
      response: {
        200: z.object({
          imports: z
            .object({
              id: z.string(),
              environment: z.object({ slug: z.string(), name: z.string() }),
              secretPath: z.string(),
              sourceEnvironment: z.object({ slug: z.string(), name: z.string() }),
              sourceSecretPath: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const imports = await server.services.secretChangePolicy.listNonReplicationImportsCoveredByPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query,
        environments: req.query.environments.split(",").map((slug) => slug.trim())
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
