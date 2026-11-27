import RE2 from "re2";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATE_POLICIES } from "@app/lib/api-docs";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  CertSubjectAlternativeNameType,
  pkiDescriptionSchema,
  POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES,
  POLICY_KEY_ALGORITHM_VALUES,
  POLICY_SIGNATURE_ALGORITHM_DOCUMENTED_VALUES,
  POLICY_SIGNATURE_ALGORITHM_VALUES
} from "@app/services/certificate-common/certificate-constants";
import {
  certificatePolicyResponseSchema,
  policyCustomExtensionSchema,
  policySubjectSchema,
  refineRequestReference
} from "@app/services/certificate-policy/certificate-policy-schemas";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const sanTypeSchema = z.nativeEnum(CertSubjectAlternativeNameType);

const policyKeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertKeyUsageType)).optional().describe(CERTIFICATE_POLICIES.usageAllowed),
    required: z.array(z.nativeEnum(CertKeyUsageType)).optional().describe(CERTIFICATE_POLICIES.usageRequired),
    denied: z.array(z.nativeEnum(CertKeyUsageType)).optional().describe(CERTIFICATE_POLICIES.usageDenied)
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Key usages must have at least one allowed, required, or denied value"
    }
  )
  .refine(
    (data) => {
      if (!data.denied || data.denied.length === 0) {
        return true;
      }
      const deniedSet = new Set(data.denied);
      const allowedSet = data.allowed ? new Set(data.allowed) : new Set();
      const requiredSet = data.required ? new Set(data.required) : new Set();

      for (const deniedValue of deniedSet) {
        if (allowedSet.has(deniedValue)) {
          return false;
        }
        if (requiredSet.has(deniedValue)) {
          return false;
        }
      }
      return true;
    },
    {
      message: "A key usage cannot be both denied and present in the allowed or required arrays."
    }
  );

const policyExtendedKeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional().describe(CERTIFICATE_POLICIES.usageAllowed),
    required: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional().describe(CERTIFICATE_POLICIES.usageRequired),
    denied: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional().describe(CERTIFICATE_POLICIES.usageDenied)
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Extended key usages must have at least one allowed, required, or denied value"
    }
  )
  .refine(
    (data) => {
      if (!data.denied || data.denied.length === 0) {
        return true;
      }
      const deniedSet = new Set(data.denied);
      const allowedSet = data.allowed ? new Set(data.allowed) : new Set();
      const requiredSet = data.required ? new Set(data.required) : new Set();

      for (const deniedValue of deniedSet) {
        if (allowedSet.has(deniedValue)) {
          return false;
        }
        if (requiredSet.has(deniedValue)) {
          return false;
        }
      }
      return true;
    },
    {
      message: "An extended key usage cannot be both denied and present in the allowed or required arrays."
    }
  );

const sanRuleValueSchema = z.string().superRefine(refineRequestReference);

const policySanSchema = z
  .object({
    type: sanTypeSchema.describe(CERTIFICATE_POLICIES.sanType),
    allowed: z.array(sanRuleValueSchema).optional().describe(CERTIFICATE_POLICIES.SAN_RULE.allowed),
    required: z.array(sanRuleValueSchema).optional().describe(CERTIFICATE_POLICIES.SAN_RULE.required),
    denied: z.array(sanRuleValueSchema).optional().describe(CERTIFICATE_POLICIES.SAN_RULE.denied)
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "SAN must have at least one allowed, required, or denied value"
    }
  );

const policyValiditySchema = z.object({
  max: z
    .string()
    .refine(
      (val) => {
        if (!val) return true;
        if (val.length < 2) return false;
        const unit = val.slice(-1);
        const number = val.slice(0, -1);
        const digitRegex = new RE2("^\\d+$");
        return ["d", "h", "m", "y"].includes(unit) && digitRegex.test(number);
      },
      {
        message: "Max validity must be in format like '365d', '12m', '1y', or '24h'"
      }
    )
    .optional()
    .describe(CERTIFICATE_POLICIES.validityMax)
});

const policyAlgorithmValueSchema = (kind: string, values: string[], documentedValues: string[]) =>
  // Zod copies the rejected value into the issue's `received`, which the 422 response and the logs include, so a long
  // value is clipped before the enum check. No allowed value is that long, so clipping never turns a value valid.
  z.preprocess(
    (value) => (typeof value === "string" && value.length > 64 ? `${value.slice(0, 64)}...` : value),
    z.enum(values as [string, ...string[]], {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_type) {
          return { message: `Each ${kind} algorithm must be a string. Use one of: ${documentedValues.join(", ")}.` };
        }
        if (issue.code !== z.ZodIssueCode.invalid_enum_value) return { message: ctx.defaultError };
        return {
          message: `Unsupported ${kind} algorithm '${String(issue.received)}'. Use one of: ${documentedValues.join(", ")}.`
        };
      }
    })
  );

// Every rejected item gets its own issue listing the allowed values, so a list over the limit is cut to one item past it
// before the items are checked: the length check still fails, and the 422 stays bounded however long the list is.
const policyAlgorithmListSchema = (kind: string, values: string[], documentedValues: string[]) =>
  z.preprocess(
    (list) => (Array.isArray(list) && list.length > values.length ? list.slice(0, values.length + 1) : list),
    z
      .array(policyAlgorithmValueSchema(kind, values, documentedValues))
      .min(1, `At least one ${kind} algorithm must be provided`)
      .max(values.length, `List at most ${values.length} ${kind} algorithms, each once.`)
  );

const policyAlgorithmsSchema = z.object({
  signature: policyAlgorithmListSchema(
    "signature",
    POLICY_SIGNATURE_ALGORITHM_VALUES,
    POLICY_SIGNATURE_ALGORITHM_DOCUMENTED_VALUES
  )
    .optional()
    .describe(CERTIFICATE_POLICIES.signatureAlgorithms),
  keyAlgorithm: policyAlgorithmListSchema("key", POLICY_KEY_ALGORITHM_VALUES, POLICY_KEY_ALGORITHM_DOCUMENTED_VALUES)
    .optional()
    .describe(CERTIFICATE_POLICIES.keyAlgorithms)
});

const policyBasicConstraintsSchema = z
  .object({
    isCA: z.nativeEnum(CertPolicyState).optional().describe(CERTIFICATE_POLICIES.isCA),
    maxPathLength: z
      .number()
      .int("Path length must be an integer")
      .min(-1, "Path length must be -1 (unlimited) or a non-negative integer")
      .optional()
      .describe(CERTIFICATE_POLICIES.maxPathLength)
  })
  .nullable();

const createCertificatePolicySchema = z.object({
  projectId: z.string().min(1).optional().describe(openApiHidden()),
  name: slugSchema({ min: 1, max: 255, field: "Name" }).describe(CERTIFICATE_POLICIES.name),
  description: pkiDescriptionSchema.optional().describe(CERTIFICATE_POLICIES.description),
  subject: z.array(policySubjectSchema).nullish().describe(CERTIFICATE_POLICIES.subject),
  sans: z.array(policySanSchema).nullish().describe(CERTIFICATE_POLICIES.sans),
  keyUsages: policyKeyUsagesSchema.nullish().describe(CERTIFICATE_POLICIES.keyUsages),
  extendedKeyUsages: policyExtendedKeyUsagesSchema.nullish().describe(CERTIFICATE_POLICIES.extendedKeyUsages),
  algorithms: policyAlgorithmsSchema.nullish().describe(CERTIFICATE_POLICIES.algorithms),
  validity: policyValiditySchema.nullish().describe(CERTIFICATE_POLICIES.validity),
  basicConstraints: policyBasicConstraintsSchema.optional().describe(CERTIFICATE_POLICIES.basicConstraints),
  customExtensions: z.array(policyCustomExtensionSchema).nullish().describe(CERTIFICATE_POLICIES.CUSTOM_EXTENSION_RULES)
});

const updateCertificatePolicySchema = createCertificatePolicySchema.omit({ projectId: true }).extend({
  name: z
    .string()
    .min(1)
    .max(255, "Name must be between 1 and 255 characters")
    .optional()
    .describe(CERTIFICATE_POLICIES.updateName)
});

export const registerCertificatePolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createCertificatePolicy",
      tags: [ApiDocsTags.PkiCertificatePolicies],
      description: CERTIFICATE_POLICIES.CREATE_DESCRIPTION,
      body: createCertificatePolicySchema,
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.createPolicy({
        actor: req.actor,
        projectId: req.internalCertManagerProjectId,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_POLICY,
          metadata: {
            certificatePolicyId: certificatePolicy.id,
            name: certificatePolicy.name,
            projectId: certificatePolicy.projectId,
            ...(certificatePolicy.customExtensions && {
              customExtensionOids: certificatePolicy.customExtensions.map((rule) => rule.oid)
            })
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertificatePolicyCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.actor.orgId,
        properties: {
          orgId: req.actor.orgId,
          projectId: certificatePolicy.projectId
        }
      });

      return { certificatePolicy };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listCertificatePolicies",
      tags: [ApiDocsTags.PkiCertificatePolicies],
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().optional(),
        projectId: z.string().uuid().optional().describe(openApiHidden())
      }),
      response: {
        200: z.object({
          certificatePolicies: certificatePolicyResponseSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { policies, totalCount } = await server.services.certificatePolicy.listPolicies({
        actor: req.actor,
        ...req.query,
        projectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.LIST_CERTIFICATE_POLICIES,
          metadata: {
            projectId
          }
        }
      });

      return { certificatePolicies: policies, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getCertificatePolicy",
      tags: [ApiDocsTags.PkiCertificatePolicies],
      params: z.object({
        id: z.string().uuid()
      }),
      querystring: z.object({
        applicationId: z.string().uuid().optional()
      }),
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.getPolicyById({
        actor: req.actor,
        policyId: req.params.id,
        applicationId: req.query.applicationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificatePolicy.projectId,
        event: {
          type: EventType.GET_CERTIFICATE_POLICY,
          metadata: {
            certificatePolicyId: certificatePolicy.id,
            name: certificatePolicy.name
          }
        }
      });

      return { certificatePolicy };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateCertificatePolicy",
      tags: [ApiDocsTags.PkiCertificatePolicies],
      description: CERTIFICATE_POLICIES.UPDATE_DESCRIPTION,
      params: z.object({
        id: z.string().uuid().describe(CERTIFICATE_POLICIES.id)
      }),
      body: updateCertificatePolicySchema,
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.updatePolicy({
        actor: req.actor,
        policyId: req.params.id,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificatePolicy.projectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_POLICY,
          metadata: {
            certificatePolicyId: certificatePolicy.id,
            name: certificatePolicy.name,
            ...(certificatePolicy.customExtensions && {
              customExtensionOids: certificatePolicy.customExtensions.map((rule) => rule.oid)
            })
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertificatePolicyUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.actor.orgId,
        properties: {
          orgId: req.actor.orgId,
          projectId: certificatePolicy.projectId
        }
      });

      return { certificatePolicy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteCertificatePolicy",
      tags: [ApiDocsTags.PkiCertificatePolicies],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.deletePolicy({
        actor: req.actor,
        policyId: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: certificatePolicy.projectId,
        event: {
          type: EventType.DELETE_CERTIFICATE_POLICY,
          metadata: {
            certificatePolicyId: certificatePolicy.id,
            name: certificatePolicy.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertificatePolicyDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.actor.orgId,
        properties: {
          orgId: req.actor.orgId,
          projectId: certificatePolicy.projectId
        }
      });

      return { certificatePolicy };
    }
  });
};
