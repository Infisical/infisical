import RE2 from "re2";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";
import { certificatePolicyResponseSchema } from "@app/services/certificate-policy/certificate-policy-schemas";

const attributeTypeSchema = z.nativeEnum(CertSubjectAttributeType);
const sanTypeSchema = z.nativeEnum(CertSubjectAlternativeNameType);

const policySubjectSchema = z
  .object({
    type: attributeTypeSchema,
    allowed: z.array(z.string()).optional(),
    required: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Subject attribute must have at least one allowed, required, or denied value"
    }
  );

const policyKeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    required: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    denied: z.array(z.nativeEnum(CertKeyUsageType)).optional()
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
  );

const policyExtendedKeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    required: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    denied: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional()
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
  );

const policySanSchema = z
  .object({
    type: sanTypeSchema,
    allowed: z.array(z.string()).optional(),
    required: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional()
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
});

const policyAlgorithmsSchema = z.object({
  signature: z.array(z.string()).min(1, "At least one signature algorithm must be provided").optional(),
  keyAlgorithm: z.array(z.string()).min(1, "At least one key algorithm must be provided").optional()
});

const createCertificatePolicySchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(255, "Name must be between 1 and 255 characters"),
  description: z.string().max(1000).optional(),
  subject: z.array(policySubjectSchema).optional(),
  sans: z.array(policySanSchema).optional(),
  keyUsages: policyKeyUsagesSchema.optional(),
  extendedKeyUsages: policyExtendedKeyUsagesSchema.optional(),
  algorithms: policyAlgorithmsSchema.optional(),
  validity: policyValiditySchema.optional()
});

const updateCertificatePolicySchema = z.object({
  name: z.string().min(1).max(255, "Name must be between 1 and 255 characters").optional(),
  description: z.string().max(1000).optional(),
  subject: z.array(policySubjectSchema).optional(),
  sans: z.array(policySanSchema).optional(),
  keyUsages: policyKeyUsagesSchema.optional(),
  extendedKeyUsages: policyExtendedKeyUsagesSchema.optional(),
  algorithms: policyAlgorithmsSchema.optional(),
  validity: policyValiditySchema.optional()
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
      body: createCertificatePolicySchema,
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, ...data } = req.body;
      const certificatePolicy = await server.services.certificatePolicy.createPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        projectId,
        data
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_CERTIFICATE_POLICY,
          metadata: {
            certificatePolicyId: certificatePolicy.id,
            name: certificatePolicy.name,
            projectId: certificatePolicy.projectId
          }
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
        projectId: z.string().min(1),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().optional()
      }),
      response: {
        200: z.object({
          certificatePolicies: certificatePolicyResponseSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { policies, totalCount } = await server.services.certificatePolicy.listPolicies({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.LIST_CERTIFICATE_POLICIES,
          metadata: {
            projectId: req.query.projectId
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
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.getPolicyById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
        policyId: req.params.id
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
      params: z.object({
        id: z.string().uuid()
      }),
      body: updateCertificatePolicySchema,
      response: {
        200: z.object({
          certificatePolicy: certificatePolicyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.updatePolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
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
            name: certificatePolicy.name
          }
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificatePolicy = await server.services.certificatePolicy.deletePolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId,
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

      return { certificatePolicy };
    }
  });
};
