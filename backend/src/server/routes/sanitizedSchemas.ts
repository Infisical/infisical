import { z } from "zod";

import {
  CertificateAuthoritiesSchema,
  DynamicSecretsSchema,
  IdentityProjectAdditionalPrivilegeSchema,
  IntegrationAuthsSchema,
  InternalCertificateAuthoritiesSchema,
  ProjectRolesSchema,
  ProjectsSchema,
  SecretApprovalPoliciesSchema,
  SecretTagsSchema,
  UsersSchema
} from "@app/db/schemas";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { ResourceMetadataSchema } from "@app/services/resource-metadata/resource-metadata-schema";

import { UnpackedPermissionSchema } from "./sanitizedSchema/permission";

// sometimes the return data must be santizied to avoid leaking important values
// always prefer pick over omit in zod
export const integrationAuthPubSchema = IntegrationAuthsSchema.pick({
  id: true,
  projectId: true,
  integration: true,
  teamId: true,
  url: true,
  namespace: true,
  accountId: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});

export const DefaultResponseErrorsSchema = {
  400: z.object({
    reqId: z.string(),
    statusCode: z.literal(400),
    message: z.string(),
    error: z.string(),
    details: z.any().optional()
  }),
  404: z.object({
    reqId: z.string(),
    statusCode: z.literal(404),
    message: z.string(),
    error: z.string()
  }),
  401: z.object({
    reqId: z.string(),
    statusCode: z.literal(401),
    message: z.string(),
    error: z.string()
  }),
  403: z.object({
    reqId: z.string(),
    statusCode: z.literal(403),
    message: z.string(),
    details: z.any().optional(),
    error: z.string()
  }),
  // Zod errors return a message of varying shapes and sizes, so z.any() is used here
  422: z.object({
    reqId: z.string(),
    statusCode: z.literal(422),
    message: z.any(),
    error: z.string()
  }),
  500: z.object({
    reqId: z.string(),
    statusCode: z.literal(500),
    message: z.string(),
    error: z.string()
  })
};

export const booleanSchema = z
  .union([z.boolean(), z.string().trim()])
  .transform((value) => {
    if (typeof value === "string") {
      // ie if not empty, 0 or false, return true
      return Boolean(value) && Number(value) !== 0 && value.toLowerCase() !== "false";
    }

    return value;
  })
  .optional()
  .default(true);

export const sapPubSchema = SecretApprovalPoliciesSchema.merge(
  z.object({
    environment: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string()
    }),
    environments: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string()
      })
    ),
    projectId: z.string()
  })
);

export const sanitizedServiceTokenUserSchema = UsersSchema.pick({
  authMethods: true,
  id: true,
  createdAt: true,
  updatedAt: true,
  devices: true,
  email: true,
  firstName: true,
  lastName: true,
  mfaMethods: true
}).merge(
  z.object({
    __v: z.number().default(0),
    _id: z.string()
  })
);

export const secretRawSchema = z.object({
  id: z.string(),
  _id: z.string(),
  workspace: z.string(),
  environment: z.string(),
  version: z.number(),
  type: z.string(),
  secretKey: z.string(),
  secretValue: z.string(),
  secretComment: z.string(),
  secretReminderNote: z.string().nullable().optional(),
  secretReminderRepeatDays: z.number().nullable().optional(),
  skipMultilineEncoding: z.boolean().default(false).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  actor: z
    .object({
      actorId: z.string().nullable().optional(),
      actorType: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      membershipId: z.string().nullable().optional(),
      groupId: z.string().nullable().optional()
    })
    .optional()
    .nullable(),
  isRotatedSecret: z.boolean().optional(),
  rotationId: z.string().uuid().nullish()
});

export const ProjectPermissionSchema = z.object({
  action: z
    .nativeEnum(ProjectPermissionActions)
    .describe("Describe what action an entity can take. Possible actions: create, edit, delete, and read"),
  subject: z
    .nativeEnum(ProjectPermissionSub)
    .describe("The entity this permission pertains to. Possible options: secrets, environments"),
  conditions: z
    .object({
      environment: z.string().describe("The environment slug this permission should allow.").optional(),
      secretPath: z
        .object({
          $glob: z
            .string()
            .min(1)
            .describe("The secret path this permission should allow. Can be a glob pattern such as /folder-name/*/** ")
        })
        .optional()
    })
    .describe("When specified, only matching conditions will be allowed to access given resource.")
    .optional()
});

export const ProjectSpecificPrivilegePermissionSchema = z.object({
  actions: z
    .nativeEnum(ProjectPermissionActions)
    .describe("Describe what action an entity can take. Possible actions: create, edit, delete, and read")
    .array()
    .min(1),
  subject: z
    .enum([ProjectPermissionSub.Secrets])
    .describe("The entity this permission pertains to. Possible options: secrets, environments"),
  conditions: z
    .object({
      environment: z.string().describe("The environment slug this permission should allow."),
      secretPath: z
        .object({
          $glob: z
            .string()
            .min(1)
            .describe("The secret path this permission should allow. Can be a glob pattern such as /folder-name/*/** ")
        })
        .optional()
    })
    .describe("When specified, only matching conditions will be allowed to access given resource.")
});

export const SanitizedIdentityPrivilegeSchema = IdentityProjectAdditionalPrivilegeSchema.extend({
  permissions: UnpackedPermissionSchema.array().transform((permissions) =>
    permissions.filter(
      (caslRule) =>
        ![
          ProjectPermissionSub.DynamicSecrets,
          ProjectPermissionSub.SecretImports,
          ProjectPermissionSub.SecretFolders
        ].includes((caslRule?.subject as ProjectPermissionSub) || "")
    )
  )
});

export const SanitizedRoleSchema = ProjectRolesSchema.omit({ version: true }).extend({
  permissions: UnpackedPermissionSchema.array()
});

export const SanitizedRoleSchemaV1 = ProjectRolesSchema.omit({ version: true }).extend({
  permissions: UnpackedPermissionSchema.array().transform((caslPermission) =>
    // first map and remove other actions of folder permission
    caslPermission
      .map((caslRule) =>
        caslRule.subject === ProjectPermissionSub.SecretFolders
          ? {
              ...caslRule,
              action: caslRule.action.filter((caslAction) => caslAction === ProjectPermissionActions.Read)
            }
          : caslRule
      )
      // now filter out dynamic secret, secret import permission
      .filter(
        (caslRule) =>
          ![ProjectPermissionSub.DynamicSecrets, ProjectPermissionSub.SecretImports].includes(
            (caslRule?.subject as ProjectPermissionSub) || ""
          ) && caslRule.action.length > 0
      )
  )
});

export const SanitizedDynamicSecretSchema = DynamicSecretsSchema.omit({
  encryptedInput: true,
  keyEncoding: true,
  inputCiphertext: true,
  inputIV: true,
  inputTag: true,
  algorithm: true
}).extend({
  metadata: ResourceMetadataSchema.optional()
});

export const SanitizedProjectSchema = ProjectsSchema.pick({
  id: true,
  name: true,
  description: true,
  type: true,
  defaultProduct: true,
  slug: true,
  autoCapitalization: true,
  orgId: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  upgradeStatus: true,
  pitVersionLimit: true,
  kmsCertificateKeyId: true,
  auditLogsRetentionDays: true,
  hasDeleteProtection: true,
  secretSharing: true,
  showSnapshotsLegacy: true,
  secretDetectionIgnoreValues: true
});

export const SanitizedTagSchema = SecretTagsSchema.pick({
  id: true,
  slug: true,
  color: true
}).extend({
  name: z.string()
});

export const InternalCertificateAuthorityResponseSchema = CertificateAuthoritiesSchema.merge(
  InternalCertificateAuthoritiesSchema.omit({
    caId: true,
    notAfter: true,
    notBefore: true
  })
).extend({
  requireTemplateForIssuance: z.boolean().optional(),
  notAfter: z.string().optional(),
  notBefore: z.string().optional()
});
