import { nanoid } from "nanoid";
import { z } from "zod";

import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ExternalApprovalType } from "@app/ee/services/external-approval/external-approval-enums";
import { AccessApprovalPolicies } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { EnforcementLevel } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { aapPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const maxTimePeriodSchema = z
  .string()
  .trim()
  .nullish()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (!val || val === "permanent") return null;
    const parsedMs = ms(val);

    if (typeof parsedMs !== "number" || parsedMs <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid time period format or value. Must be a positive duration (e.g., '1h', '30m', '2d')."
      });
      return z.NEVER;
    }
    return val;
  });

const MIN_EXPIRATION_MS = 60 * 1000; // 1 minute
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const requestExpirationTimeSchema = z
  .string()
  .trim()
  .nullish()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (!val || val === "never") return null;
    const parsedMs = ms(val);

    if (typeof parsedMs !== "number" || parsedMs <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid time period format or value. Must be a positive duration (e.g., '1h', '3d', '72h')."
      });
      return z.NEVER;
    }

    if (parsedMs < MIN_EXPIRATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Request expiration time must be at least 1 minute."
      });
      return z.NEVER;
    }

    if (parsedMs > MAX_EXPIRATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Request expiration time cannot exceed 1 year."
      });
      return z.NEVER;
    }

    return val;
  });

const externalApprovalSchema = z.object({
  type: z.nativeEnum(ExternalApprovalType).describe(AccessApprovalPolicies.EXTERNAL_APPROVAL.type),
  connectionId: z.string().uuid().describe(AccessApprovalPolicies.EXTERNAL_APPROVAL.connectionId),
  approverIdentityId: z.string().uuid().describe(AccessApprovalPolicies.EXTERNAL_APPROVAL.approverIdentityId)
});

export const registerAccessApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z
        .object({
          projectSlug: z.string().trim(),
          name: z.string().trim().max(255).optional(),
          secretPath: z
            .string()
            .trim()
            .min(1, { message: "Secret path cannot be empty" })
            .transform(removeTrailingSlash),
          environment: z.string().optional(),
          environments: z.string().array().optional(),
          approvers: z
            .discriminatedUnion("type", [
              z.object({
                type: z.literal(ApproverType.Group),
                id: z.string(),
                sequence: z.number().int().default(1)
              }),
              z.object({
                type: z.literal(ApproverType.User),
                id: z.string().optional(),
                username: z.string().optional(),
                sequence: z.number().int().default(1)
              })
            ])
            .array()
            .max(100, "Cannot have more than 100 approvers")
            .refine(
              // @ts-expect-error this is ok
              (el) => el.every((i) => Boolean(i?.id) || Boolean(i?.username)),
              "Must provide either username or id"
            )
            .optional()
            .default([]),
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
          approvalsRequired: z
            .object({
              numberOfApprovals: z.number().int(),
              stepNumber: z.number().int()
            })
            .array()
            .optional(),
          approvals: z.number().min(1).default(1),
          enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
          allowedSelfApprovals: z.boolean().default(true),
          maxTimePeriod: maxTimePeriodSchema,
          requestExpirationTime: requestExpirationTimeSchema,
          externalApproval: externalApprovalSchema.optional()
        })
        .refine(
          (val) => Boolean(val.environment) || Boolean(val.environments),
          "Must provide either environment or environments"
        )
        .refine((val) => Boolean(val.externalApproval) || val.approvers.length > 0, {
          message: "At least one approver should be provided",
          path: ["approvers"]
        }),
      response: {
        200: z.object({
          approval: aapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const envPrefix = (req.body.environment || req.body.environments?.join("-") || "policy").slice(0, 250);

      const approval = await server.services.accessApprovalPolicy.createAccessApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actorRootOrgId: req.permission.rootOrgId,
        actorParentOrgId: req.permission.parentOrgId,
        ...req.body,
        name: req.body.name ?? `${envPrefix}-${nanoid(3)}`
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AccessApprovalPolicyCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            policyId: approval.id,
            projectId: approval.projectId,
            environments: approval.environments.map((e: { slug: string }) => e.slug),
            secretPath: req.body.secretPath,
            approvals: req.body.approvals,
            enforcementLevel: req.body.enforcementLevel,
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
      querystring: z.object({
        projectSlug: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: aapPubSchema
            .extend({
              approvers: z
                .object({
                  type: z.nativeEnum(ApproverType),
                  id: z.string().nullable().optional(),
                  name: z.string().nullable().optional(),
                  sequence: z.number().nullable().optional(),
                  approvalsRequired: z.number().nullable().optional()
                })
                .array()
                .nullable()
                .optional(),
              bypassers: z.object({ type: z.nativeEnum(BypasserType), id: z.string().nullable().optional() }).array()
            })
            .array()
            .nullable()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const approvals = await server.services.accessApprovalPolicy.getAccessApprovalPolicyByProjectSlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectSlug: req.query.projectSlug
      });

      return { approvals };
    }
  });

  server.route({
    url: "/count",
    method: "GET",
    schema: {
      querystring: z.object({
        projectSlug: z.string(),
        envSlug: z.string()
      }),
      response: {
        200: z.object({
          count: z.number()
        })
      }
    },

    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { count } = await server.services.accessApprovalPolicy.getAccessPolicyCountByEnvSlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        projectSlug: req.query.projectSlug,
        actorOrgId: req.permission.orgId,
        envSlug: req.query.envSlug
      });
      return { count };
    }
  });

  server.route({
    url: "/:policyId",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      body: z
        .object({
          name: z.string().trim().max(255).optional(),
          secretPath: z
            .string()
            .trim()
            .min(1, { message: "Secret path cannot be empty" })
            .optional()
            .transform((val) => (val ? removeTrailingSlash(val) : val)),
          approvers: z
            .discriminatedUnion("type", [
              z.object({
                type: z.literal(ApproverType.Group),
                id: z.string(),
                sequence: z.number().int().default(1)
              }),
              z.object({
                type: z.literal(ApproverType.User),
                id: z.string().optional(),
                username: z.string().optional(),
                sequence: z.number().int().default(1)
              })
            ])
            .array()
            .max(100, "Cannot have more than 100 approvers")
            .refine(
              // @ts-expect-error this is ok
              (el) => el.every((i) => Boolean(i?.id) || Boolean(i?.username)),
              "Must provide either username or id"
            )
            .optional(),
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
          approvals: z.number().min(1).optional(),
          enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
          allowedSelfApprovals: z.boolean().default(true),
          environments: z.array(z.string()).optional(),
          approvalsRequired: z
            .object({
              numberOfApprovals: z.number().int(),
              stepNumber: z.number().int()
            })
            .array()
            .optional(),
          maxTimePeriod: maxTimePeriodSchema,
          requestExpirationTime: requestExpirationTimeSchema,
          externalApproval: externalApprovalSchema.nullish()
        })
        .refine((val) => val.approvers === undefined || Boolean(val.externalApproval) || val.approvers.length > 0, {
          message: "At least one approver should be provided",
          path: ["approvers"]
        }),
      response: {
        200: z.object({
          approval: aapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.accessApprovalPolicy.updateAccessApprovalPolicy({
        policyId: req.params.policyId,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorRootOrgId: req.permission.rootOrgId,
        actorParentOrgId: req.permission.parentOrgId,
        ...req.body
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AccessApprovalPolicyUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { policyId: req.params.policyId }
        })
        .catch(() => {});

      return { approval };
    }
  });

  server.route({
    url: "/:policyId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      response: {
        200: z.object({
          approval: aapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.accessApprovalPolicy.deleteAccessApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        policyId: req.params.policyId
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AccessApprovalPolicyDeleted,
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
    url: "/:policyId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      response: {
        200: z.object({
          approval: aapPubSchema.extend({
            approvers: z
              .object({
                type: z.nativeEnum(ApproverType),
                id: z.string().nullable().optional(),
                name: z.string().nullable().optional(),
                approvalsRequired: z.number().nullable().optional(),
                sequence: z.number().nullable().optional()
              })
              .array()
              .nullable()
              .optional(),
            bypassers: z
              .object({
                type: z.nativeEnum(BypasserType),
                id: z.string().nullable().optional(),
                name: z.string().nullable().optional()
              })
              .array()
              .nullable()
              .optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const approval = await server.services.accessApprovalPolicy.getAccessApprovalPolicyById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      return { approval };
    }
  });
};
