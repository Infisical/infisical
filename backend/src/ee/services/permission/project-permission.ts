import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";
import { z } from "zod";

import {
  CASL_ACTION_SCHEMA_ENUM,
  CASL_ACTION_SCHEMA_NATIVE_ENUM
} from "@app/ee/services/permission/permission-schemas";
import { conditionsMatcher, PermissionConditionOperators } from "@app/lib/casl";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";

import { PermissionConditionSchema } from "./permission-types";

export enum ProjectPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionSecretActions {
  DescribeAndReadValue = "read",
  DescribeSecret = "describeSecret",
  ReadValue = "readValue",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionCmekActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Encrypt = "encrypt",
  Decrypt = "decrypt"
}

export enum ProjectPermissionDynamicSecretActions {
  ReadRootCredential = "read-root-credential",
  CreateRootCredential = "create-root-credential",
  EditRootCredential = "edit-root-credential",
  DeleteRootCredential = "delete-root-credential",
  Lease = "lease"
}

export enum ProjectPermissionSecretSyncActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  SyncSecrets = "sync-secrets",
  ImportSecrets = "import-secrets",
  RemoveSecrets = "remove-secrets"
}

export enum ProjectPermissionSecretRotationActions {
  Read = "read",
  ReadCredentials = "read-credentials",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Rotate = "rotate"
}

export enum ProjectPermissionKmipActions {
  CreateClients = "create-clients",
  UpdateClients = "update-clients",
  DeleteClients = "delete-clients",
  ReadClients = "read-clients",
  GenerateClientCertificates = "generate-client-certificates"
}

export enum ProjectPermissionSub {
  Role = "role",
  Member = "member",
  Groups = "groups",
  Settings = "settings",
  Integrations = "integrations",
  Webhooks = "webhooks",
  ServiceTokens = "service-tokens",
  Environments = "environments",
  Tags = "tags",
  AuditLogs = "audit-logs",
  IpAllowList = "ip-allowlist",
  Project = "workspace",
  Secrets = "secrets",
  SecretFolders = "secret-folders",
  SecretImports = "secret-imports",
  DynamicSecrets = "dynamic-secrets",
  SecretRollback = "secret-rollback",
  SecretApproval = "secret-approval",
  SecretRotation = "secret-rotation",
  Identity = "identity",
  CertificateAuthorities = "certificate-authorities",
  Certificates = "certificates",
  CertificateTemplates = "certificate-templates",
  SshCertificateAuthorities = "ssh-certificate-authorities",
  SshCertificates = "ssh-certificates",
  SshCertificateTemplates = "ssh-certificate-templates",
  PkiAlerts = "pki-alerts",
  PkiCollections = "pki-collections",
  Kms = "kms",
  Cmek = "cmek",
  SecretSyncs = "secret-syncs",
  Kmip = "kmip"
}

export type SecretSubjectFields = {
  environment: string;
  secretPath: string;
  secretName?: string;
  secretTags?: string[];
};

export type SecretFolderSubjectFields = {
  environment: string;
  secretPath: string;
};

export type DynamicSecretSubjectFields = {
  environment: string;
  secretPath: string;
};

export type SecretImportSubjectFields = {
  environment: string;
  secretPath: string;
};

export type IdentityManagementSubjectFields = {
  identityId: string;
};

export type ProjectPermissionSet =
  | [
      ProjectPermissionSecretActions,
      ProjectPermissionSub.Secrets | (ForcedSubject<ProjectPermissionSub.Secrets> & SecretSubjectFields)
    ]
  | [
      ProjectPermissionActions,
      (
        | ProjectPermissionSub.SecretFolders
        | (ForcedSubject<ProjectPermissionSub.SecretFolders> & SecretFolderSubjectFields)
      )
    ]
  | [
      ProjectPermissionDynamicSecretActions,
      (
        | ProjectPermissionSub.DynamicSecrets
        | (ForcedSubject<ProjectPermissionSub.DynamicSecrets> & DynamicSecretSubjectFields)
      )
    ]
  | [
      ProjectPermissionActions,
      (
        | ProjectPermissionSub.SecretImports
        | (ForcedSubject<ProjectPermissionSub.SecretImports> & SecretImportSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.Role]
  | [ProjectPermissionActions, ProjectPermissionSub.Tags]
  | [ProjectPermissionActions, ProjectPermissionSub.Member]
  | [ProjectPermissionActions, ProjectPermissionSub.Groups]
  | [ProjectPermissionActions, ProjectPermissionSub.Integrations]
  | [ProjectPermissionActions, ProjectPermissionSub.Webhooks]
  | [ProjectPermissionActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretApproval]
  | [ProjectPermissionSecretRotationActions, ProjectPermissionSub.SecretRotation]
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.Identity | (ForcedSubject<ProjectPermissionSub.Identity> & IdentityManagementSubjectFields)
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.CertificateAuthorities]
  | [ProjectPermissionActions, ProjectPermissionSub.Certificates]
  | [ProjectPermissionActions, ProjectPermissionSub.CertificateTemplates]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificateAuthorities]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificates]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificateTemplates]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiAlerts]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiCollections]
  | [ProjectPermissionSecretSyncActions, ProjectPermissionSub.SecretSyncs]
  | [ProjectPermissionKmipActions, ProjectPermissionSub.Kmip]
  | [ProjectPermissionCmekActions, ProjectPermissionSub.Cmek]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Kms];

const SECRET_PATH_MISSING_SLASH_ERR_MSG = "Invalid Secret Path; it must start with a '/'";
const SECRET_PATH_PERMISSION_OPERATOR_SCHEMA = z.union([
  z.string().refine((val) => val.startsWith("/"), SECRET_PATH_MISSING_SLASH_ERR_MSG),
  z
    .object({
      [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ].refine(
        (val) => val.startsWith("/"),
        SECRET_PATH_MISSING_SLASH_ERR_MSG
      ),
      [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ].refine(
        (val) => val.startsWith("/"),
        SECRET_PATH_MISSING_SLASH_ERR_MSG
      ),
      [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN].refine(
        (val) => val.every((el) => el.startsWith("/")),
        SECRET_PATH_MISSING_SLASH_ERR_MSG
      ),
      [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
    })
    .partial()
]);
// akhilmhdh: don't modify this for v2
// if you want to update create a new schema
const SecretConditionV1Schema = z
  .object({
    environment: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ]),
    secretPath: SECRET_PATH_PERMISSION_OPERATOR_SCHEMA
  })
  .partial();

const SecretConditionV2Schema = z
  .object({
    environment: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
        })
        .partial()
    ]),
    secretPath: SECRET_PATH_PERMISSION_OPERATOR_SCHEMA,
    secretName: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
        })
        .partial()
    ]),
    secretTags: z
      .object({
        [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
      })
      .partial()
  })
  .partial();

const IdentityManagementConditionSchema = z
  .object({
    identityId: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ])
  })
  .partial();

const GeneralPermissionSchema = [
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretApproval).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretRotation).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretRotationActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretRollback).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([ProjectPermissionActions.Read, ProjectPermissionActions.Create]).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Member).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Groups).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Role).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Integrations).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Webhooks).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.ServiceTokens).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Settings).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Environments).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Tags).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.AuditLogs).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.IpAllowList).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.CertificateAuthorities).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Certificates).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.CertificateTemplates).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z
      .literal(ProjectPermissionSub.SshCertificateAuthorities)
      .describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SshCertificates).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z
      .literal(ProjectPermissionSub.SshCertificateTemplates)
      .describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PkiAlerts).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PkiCollections).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Project).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([ProjectPermissionActions.Edit, ProjectPermissionActions.Delete]).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Kms).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([ProjectPermissionActions.Edit]).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Cmek).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionCmekActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretSyncs).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretSyncActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Kmip).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionKmipActions).describe(
      "Describe what action an entity can take."
    )
  })
];

// Do not update this schema anymore, as it's kept purely for backwards compatability. Update V2 schema only.
export const ProjectPermissionV1Schema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal(ProjectPermissionSub.Secrets).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretConditionV1Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretFolders).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_ENUM([ProjectPermissionActions.Read]).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Identity).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  ...GeneralPermissionSchema
]);

export const ProjectPermissionV2Schema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal(ProjectPermissionSub.Secrets).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretConditionV2Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretFolders).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretConditionV1Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretImports).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretConditionV1Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.DynamicSecrets).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionDynamicSecretActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretConditionV1Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Identity).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: IdentityManagementConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  ...GeneralPermissionSchema
]);

export type TProjectPermissionV2Schema = z.infer<typeof ProjectPermissionV2Schema>;

const buildAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  // Admins get full access to everything
  [
    ProjectPermissionSub.SecretFolders,
    ProjectPermissionSub.SecretImports,
    ProjectPermissionSub.SecretApproval,
    ProjectPermissionSub.Member,
    ProjectPermissionSub.Groups,
    ProjectPermissionSub.Role,
    ProjectPermissionSub.Integrations,
    ProjectPermissionSub.Webhooks,
    ProjectPermissionSub.Identity,
    ProjectPermissionSub.ServiceTokens,
    ProjectPermissionSub.Settings,
    ProjectPermissionSub.Environments,
    ProjectPermissionSub.Tags,
    ProjectPermissionSub.AuditLogs,
    ProjectPermissionSub.IpAllowList,
    ProjectPermissionSub.CertificateAuthorities,
    ProjectPermissionSub.Certificates,
    ProjectPermissionSub.CertificateTemplates,
    ProjectPermissionSub.PkiAlerts,
    ProjectPermissionSub.PkiCollections,
    ProjectPermissionSub.SshCertificateAuthorities,
    ProjectPermissionSub.SshCertificates,
    ProjectPermissionSub.SshCertificateTemplates
  ].forEach((el) => {
    can(
      [
        ProjectPermissionActions.Read,
        ProjectPermissionActions.Edit,
        ProjectPermissionActions.Create,
        ProjectPermissionActions.Delete
      ],
      el
    );
  });

  can(
    [
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Delete
    ],
    ProjectPermissionSub.Secrets
  );

  can(
    [
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      ProjectPermissionDynamicSecretActions.Lease
    ],
    ProjectPermissionSub.DynamicSecrets
  );

  can([ProjectPermissionActions.Edit, ProjectPermissionActions.Delete], ProjectPermissionSub.Project);
  can([ProjectPermissionActions.Read, ProjectPermissionActions.Create], ProjectPermissionSub.SecretRollback);
  can([ProjectPermissionActions.Edit], ProjectPermissionSub.Kms);
  can(
    [
      ProjectPermissionCmekActions.Create,
      ProjectPermissionCmekActions.Edit,
      ProjectPermissionCmekActions.Delete,
      ProjectPermissionCmekActions.Read,
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt
    ],
    ProjectPermissionSub.Cmek
  );
  can(
    [
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSecretSyncActions.RemoveSecrets
    ],
    ProjectPermissionSub.SecretSyncs
  );

  can(
    [
      ProjectPermissionKmipActions.CreateClients,
      ProjectPermissionKmipActions.UpdateClients,
      ProjectPermissionKmipActions.DeleteClients,
      ProjectPermissionKmipActions.ReadClients,
      ProjectPermissionKmipActions.GenerateClientCertificates
    ],
    ProjectPermissionSub.Kmip
  );

  can(
    [
      ProjectPermissionSecretRotationActions.Create,
      ProjectPermissionSecretRotationActions.Edit,
      ProjectPermissionSecretRotationActions.Delete,
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSecretRotationActions.ReadCredentials,
      ProjectPermissionSecretRotationActions.Rotate
    ],
    ProjectPermissionSub.SecretRotation
  );

  return rules;
};

export const projectAdminPermissions = buildAdminPermissionRules();

const buildMemberPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Delete
    ],
    ProjectPermissionSub.Secrets
  );
  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.SecretFolders
  );
  can(
    [
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      ProjectPermissionDynamicSecretActions.Lease
    ],
    ProjectPermissionSub.DynamicSecrets
  );
  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.SecretImports
  );

  can([ProjectPermissionActions.Read], ProjectPermissionSub.SecretApproval);
  can([ProjectPermissionSecretRotationActions.Read], ProjectPermissionSub.SecretRotation);

  can([ProjectPermissionActions.Read, ProjectPermissionActions.Create], ProjectPermissionSub.SecretRollback);

  can([ProjectPermissionActions.Read, ProjectPermissionActions.Create], ProjectPermissionSub.Member);

  can([ProjectPermissionActions.Read], ProjectPermissionSub.Groups);

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Integrations
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Webhooks
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Identity
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.ServiceTokens
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Settings
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Environments
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Tags
  );

  can([ProjectPermissionActions.Read], ProjectPermissionSub.Role);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.AuditLogs);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.IpAllowList);

  // double check if all CRUD are needed for CA and Certificates
  can([ProjectPermissionActions.Read], ProjectPermissionSub.CertificateAuthorities);

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Certificates
  );

  can([ProjectPermissionActions.Read], ProjectPermissionSub.CertificateTemplates);

  can([ProjectPermissionActions.Read], ProjectPermissionSub.PkiAlerts);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.PkiCollections);

  can([ProjectPermissionActions.Read], ProjectPermissionSub.SshCertificateAuthorities);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.SshCertificates);
  can([ProjectPermissionActions.Create], ProjectPermissionSub.SshCertificates);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.SshCertificateTemplates);

  can(
    [
      ProjectPermissionCmekActions.Create,
      ProjectPermissionCmekActions.Edit,
      ProjectPermissionCmekActions.Delete,
      ProjectPermissionCmekActions.Read,
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt
    ],
    ProjectPermissionSub.Cmek
  );

  can(
    [
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSecretSyncActions.RemoveSecrets
    ],
    ProjectPermissionSub.SecretSyncs
  );

  return rules;
};

export const projectMemberPermissions = buildMemberPermissionRules();

const buildViewerPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionSecretActions.DescribeAndReadValue, ProjectPermissionSub.Secrets);
  can(ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSub.Secrets);
  can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretFolders);
  can(ProjectPermissionDynamicSecretActions.ReadRootCredential, ProjectPermissionSub.DynamicSecrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionSecretRotationActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.CertificateAuthorities);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);
  can(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SshCertificateAuthorities);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SshCertificates);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SshCertificateTemplates);
  can(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs);

  return rules;
};

export const projectViewerPermission = buildViewerPermissionRules();

const buildNoAccessProjectPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  return rules;
};

export const buildServiceTokenProjectPermission = (
  scopes: Array<{ secretPath: string; environment: string }>,
  permission: string[]
) => {
  const canWrite = permission.includes("write");
  const canRead = permission.includes("read");
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  scopes.forEach(({ secretPath, environment }) => {
    [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
      (subject) => {
        if (canWrite) {
          can(ProjectPermissionActions.Edit, subject, {
            // @ts-expect-error type
            secretPath: { $glob: secretPath },
            environment
          });
          can(ProjectPermissionActions.Create, subject, {
            // @ts-expect-error type
            secretPath: { $glob: secretPath },
            environment
          });
          can(ProjectPermissionActions.Delete, subject, {
            // @ts-expect-error type
            secretPath: { $glob: secretPath },
            environment
          });
        }
        if (canRead) {
          can(ProjectPermissionActions.Read, subject, {
            // @ts-expect-error type
            secretPath: { $glob: secretPath },
            environment
          });
        }
      }
    );
  });

  return build({ conditionsMatcher });
};

export const projectNoAccessPermissions = buildNoAccessProjectPermission();

/* eslint-disable */

/**
 * Extracts and formats permissions from a CASL Ability object or a raw permission set.
 * @param ability
 * @returns
 */
const extractPermissions = (ability: any) =>
  ability.A.map((permission: any) => `${permission.action}_${permission.subject}`);

/**
 * Compares two sets of permissions to determine if the first set is at least as privileged as the second set.
 * The function checks if all permissions in the second set are contained within the first set and if the first set has equal or more permissions.
 *
 */
export const isAtLeastAsPrivilegedWorkspace = (
  permissions1: MongoAbility<ProjectPermissionSet> | ProjectPermissionSet,
  permissions2: MongoAbility<ProjectPermissionSet> | ProjectPermissionSet
) => {
  const set1 = new Set(extractPermissions(permissions1));
  const set2 = new Set(extractPermissions(permissions2));

  // eslint-disable-next-line
  for (const perm of set2) {
    if (!set1.has(perm)) {
      return false;
    }
  }

  return set1.size >= set2.size;
};
/* eslint-enable */

export const backfillPermissionV1SchemaToV2Schema = (
  data: z.infer<typeof ProjectPermissionV1Schema>[],
  dontRemoveReadFolderPermission?: boolean
) => {
  let formattedData = UnpackedPermissionSchema.array().parse(data);
  const secretSubjects = formattedData.filter((el) => el.subject === ProjectPermissionSub.Secrets);

  // this means the folder permission as readonly is set
  const hasReadOnlyFolder = formattedData.filter((el) => el.subject === ProjectPermissionSub.SecretFolders);
  const secretImportPolicies = secretSubjects.map(({ subject, ...el }) => ({
    ...el,
    subject: ProjectPermissionSub.SecretImports as const
  }));

  const secretPolicies = secretSubjects.map(({ subject, ...el }) => ({
    subject: ProjectPermissionSub.Secrets as const,
    ...el,
    action:
      el.action.includes(ProjectPermissionActions.Read) && !el.action.includes(ProjectPermissionSecretActions.ReadValue)
        ? el.action.concat(ProjectPermissionSecretActions.ReadValue)
        : el.action
  }));

  const secretFolderPolicies = secretSubjects

    .map(({ subject, ...el }) => ({
      ...el,
      // read permission is not needed anymore
      action: el.action.filter((caslAction) => caslAction !== ProjectPermissionActions.Read),
      subject: ProjectPermissionSub.SecretFolders
    }))
    .filter((el) => el.action?.length > 0);

  const dynamicSecretPolicies = secretSubjects.map(({ subject, ...el }) => {
    const action = el.action.map((e) => {
      switch (e) {
        case ProjectPermissionActions.Edit:
          return ProjectPermissionDynamicSecretActions.EditRootCredential;
        case ProjectPermissionActions.Create:
          return ProjectPermissionDynamicSecretActions.CreateRootCredential;
        case ProjectPermissionActions.Delete:
          return ProjectPermissionDynamicSecretActions.DeleteRootCredential;
        case ProjectPermissionActions.Read:
          return ProjectPermissionDynamicSecretActions.ReadRootCredential;
        default:
          return ProjectPermissionDynamicSecretActions.ReadRootCredential;
      }
    });

    return {
      ...el,
      action: el.action.includes(ProjectPermissionActions.Edit)
        ? [...action, ProjectPermissionDynamicSecretActions.Lease]
        : action,
      subject: ProjectPermissionSub.DynamicSecrets
    };
  });

  if (!dontRemoveReadFolderPermission) {
    formattedData = formattedData.filter((i) => i.subject !== ProjectPermissionSub.SecretFolders);
  }

  return formattedData.concat(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-error this is valid ts
    secretImportPolicies,
    secretPolicies,
    dynamicSecretPolicies,
    hasReadOnlyFolder.length ? [] : secretFolderPolicies
  );
};
