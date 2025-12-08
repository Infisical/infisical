import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";
import { z } from "zod";

import { ProjectMembershipRole } from "@app/db/schemas";
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

export enum ProjectPermissionCommitsActions {
  Read = "read",
  PerformRollback = "perform-rollback"
}

export enum ProjectPermissionCertificateAuthorityActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Renew = "renew",
  SignIntermediate = "sign-intermediate"
}

export enum ProjectPermissionCertificateActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  ReadPrivateKey = "read-private-key",
  Import = "import"
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
  Decrypt = "decrypt",
  Sign = "sign",
  Verify = "verify"
}

export enum ProjectPermissionDynamicSecretActions {
  ReadRootCredential = "read-root-credential",
  CreateRootCredential = "create-root-credential",
  EditRootCredential = "edit-root-credential",
  DeleteRootCredential = "delete-root-credential",
  Lease = "lease"
}

export enum ProjectPermissionIdentityActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AssumePrivileges = "assume-privileges",
  RevokeAuth = "revoke-auth",
  CreateToken = "create-token",
  GetToken = "get-token",
  DeleteToken = "delete-token"
}

export enum ProjectPermissionMemberActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AssumePrivileges = "assume-privileges"
}

export enum ProjectPermissionGroupActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges"
}

export enum ProjectPermissionSshHostActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueHostCert = "issue-host-cert"
}

export enum ProjectPermissionPkiTemplateActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  ListCerts = "list-certs"
}

export enum ProjectPermissionPkiSubscriberActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  ListCerts = "list-certs"
}

export enum ProjectPermissionCertificateProfileActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  RevealAcmeEabSecret = "reveal-acme-eab-secret",
  RotateAcmeEabSecret = "rotate-acme-eab-secret"
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

export enum ProjectPermissionPkiSyncActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
}

export enum ProjectPermissionSecretRotationActions {
  Read = "read",
  ReadGeneratedCredentials = "read-generated-credentials",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  RotateSecrets = "rotate-secrets"
}

export enum ProjectPermissionKmipActions {
  CreateClients = "create-clients",
  UpdateClients = "update-clients",
  DeleteClients = "delete-clients",
  ReadClients = "read-clients",
  GenerateClientCertificates = "generate-client-certificates"
}

export enum ProjectPermissionSecretScanningDataSourceActions {
  Read = "read-data-sources",
  Create = "create-data-sources",
  Edit = "edit-data-sources",
  Delete = "delete-data-sources",
  TriggerScans = "trigger-data-source-scans",
  ReadScans = "read-data-source-scans",
  ReadResources = "read-data-source-resources"
}

export enum ProjectPermissionAppConnectionActions {
  Read = "read-app-connections",
  Create = "create-app-connections",
  Edit = "edit-app-connections",
  Delete = "delete-app-connections",
  Connect = "connect-app-connections"
}

export enum ProjectPermissionSecretScanningFindingActions {
  Read = "read-findings",
  Update = "update-findings"
}

export enum ProjectPermissionSecretScanningConfigActions {
  Read = "read-configs",
  Update = "update-configs"
}

export enum ProjectPermissionSecretEventActions {
  SubscribeCreated = "subscribe-on-created",
  SubscribeUpdated = "subscribe-on-updated",
  SubscribeDeleted = "subscribe-on-deleted",
  SubscribeImportMutations = "subscribe-on-import-mutations"
}

export enum ProjectPermissionAuditLogsActions {
  Read = "read"
}

export enum ProjectPermissionPamAccountActions {
  Access = "access",
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionPamSessionActions {
  Read = "read"
  // Terminate = "terminate"
}

export enum ProjectPermissionApprovalRequestActions {
  Read = "read",
  Create = "create"
}

export const isCustomProjectRole = (slug: string) =>
  !Object.values(ProjectMembershipRole).includes(slug as ProjectMembershipRole);

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
  Commits = "commits",
  Identity = "identity",
  CertificateAuthorities = "certificate-authorities",
  Certificates = "certificates",
  CertificateTemplates = "certificate-templates",
  SshCertificateAuthorities = "ssh-certificate-authorities",
  SshCertificates = "ssh-certificates",
  SshCertificateTemplates = "ssh-certificate-templates",
  SshHosts = "ssh-hosts",
  SshHostGroups = "ssh-host-groups",
  PkiSubscribers = "pki-subscribers",
  PkiAlerts = "pki-alerts",
  PkiCollections = "pki-collections",
  Kms = "kms",
  Cmek = "cmek",
  SecretSyncs = "secret-syncs",
  PkiSyncs = "pki-syncs",
  Kmip = "kmip",
  SecretScanningDataSources = "secret-scanning-data-sources",
  SecretScanningFindings = "secret-scanning-findings",
  SecretScanningConfigs = "secret-scanning-configs",
  SecretEvents = "secret-events",
  AppConnections = "app-connections",
  PamFolders = "pam-folders",
  PamResources = "pam-resources",
  PamAccounts = "pam-accounts",
  PamSessions = "pam-sessions",
  CertificateProfiles = "certificate-profiles",
  ApprovalRequests = "approval-requests"
}

export type SecretSubjectFields = {
  environment: string;
  secretPath: string;
  secretName?: string;
  secretTags?: string[];
};

export type SecretEventSubjectFields = {
  environment: string;
  secretPath: string;
  secretName?: string;
  secretTags?: string[];
};

export type SecretFolderSubjectFields = {
  environment: string;
  secretPath: string;
};

export type SecretSyncSubjectFields = {
  environment: string;
  secretPath: string;
};

export type PkiSyncSubjectFields = {
  subscriberName?: string;
  name: string;
};

export type DynamicSecretSubjectFields = {
  environment: string;
  secretPath: string;
  metadata?: {
    key: string;
    value: string;
  }[];
};

export type SecretImportSubjectFields = {
  environment: string;
  secretPath: string;
};

export type SecretRotationsSubjectFields = {
  environment: string;
  secretPath: string;
};

export type IdentityManagementSubjectFields = {
  identityId: string;
};

export type SshHostSubjectFields = {
  hostname: string;
};

export type PkiTemplateSubjectFields = {
  name: string;
  // (dangtony98): consider adding [commonName] as a subject field in the future
};

export type PkiSubscriberSubjectFields = {
  name: string;
  // (dangtony98): consider adding [commonName] as a subject field in the future
};

export type CertificateAuthoritySubjectFields = {
  name: string;
};

export type CertificateSubjectFields = {
  commonName?: string;
  altNames?: string;
  serialNumber?: string;
  friendlyName?: string;
  status?: string;
};

export type CertificateProfileSubjectFields = {
  slug: string;
};

export type CertificateTemplateV2SubjectFields = {
  name: string;
};

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type PamAccountSubjectFields = {
  resourceName: string;
  accountName: string;
  accountPath: string;
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
      ProjectPermissionSecretSyncActions,
      ProjectPermissionSub.SecretSyncs | (ForcedSubject<ProjectPermissionSub.SecretSyncs> & SecretSyncSubjectFields)
    ]
  | [
      ProjectPermissionPkiSyncActions,
      ProjectPermissionSub.PkiSyncs | (ForcedSubject<ProjectPermissionSub.PkiSyncs> & PkiSyncSubjectFields)
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
  | [ProjectPermissionMemberActions, ProjectPermissionSub.Member]
  | [ProjectPermissionGroupActions, ProjectPermissionSub.Groups]
  | [ProjectPermissionActions, ProjectPermissionSub.Integrations]
  | [ProjectPermissionActions, ProjectPermissionSub.Webhooks]
  | [ProjectPermissionAuditLogsActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretApproval]
  | [
      ProjectPermissionSecretRotationActions,
      (
        | ProjectPermissionSub.SecretRotation
        | (ForcedSubject<ProjectPermissionSub.SecretRotation> & SecretRotationsSubjectFields)
      )
    ]
  | [
      ProjectPermissionIdentityActions,
      ProjectPermissionSub.Identity | (ForcedSubject<ProjectPermissionSub.Identity> & IdentityManagementSubjectFields)
    ]
  | [
      ProjectPermissionCertificateAuthorityActions,
      (
        | ProjectPermissionSub.CertificateAuthorities
        | (ForcedSubject<ProjectPermissionSub.CertificateAuthorities> & CertificateAuthoritySubjectFields)
      )
    ]
  | [
      ProjectPermissionCertificateActions,
      ProjectPermissionSub.Certificates | (ForcedSubject<ProjectPermissionSub.Certificates> & CertificateSubjectFields)
    ]
  | [
      ProjectPermissionPkiTemplateActions,
      (
        | ProjectPermissionSub.CertificateTemplates
        | (ForcedSubject<ProjectPermissionSub.CertificateTemplates> & PkiTemplateSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificateAuthorities]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificates]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificateTemplates]
  | [
      ProjectPermissionSshHostActions,
      ProjectPermissionSub.SshHosts | (ForcedSubject<ProjectPermissionSub.SshHosts> & SshHostSubjectFields)
    ]
  | [
      ProjectPermissionPkiSubscriberActions,
      (
        | ProjectPermissionSub.PkiSubscribers
        | (ForcedSubject<ProjectPermissionSub.PkiSubscribers> & PkiSubscriberSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.SshHostGroups]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiAlerts]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiCollections]
  | [ProjectPermissionKmipActions, ProjectPermissionSub.Kmip]
  | [ProjectPermissionCmekActions, ProjectPermissionSub.Cmek]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Kms]
  | [ProjectPermissionCommitsActions, ProjectPermissionSub.Commits]
  | [ProjectPermissionSecretScanningDataSourceActions, ProjectPermissionSub.SecretScanningDataSources]
  | [ProjectPermissionSecretScanningFindingActions, ProjectPermissionSub.SecretScanningFindings]
  | [ProjectPermissionSecretScanningConfigActions, ProjectPermissionSub.SecretScanningConfigs]
  | [
      ProjectPermissionSecretEventActions,
      ProjectPermissionSub.SecretEvents | (ForcedSubject<ProjectPermissionSub.SecretEvents> & SecretEventSubjectFields)
    ]
  | [
      ProjectPermissionAppConnectionActions,
      (
        | ProjectPermissionSub.AppConnections
        | (ForcedSubject<ProjectPermissionSub.AppConnections> & AppConnectionSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.PamFolders]
  | [ProjectPermissionActions, ProjectPermissionSub.PamResources]
  | [
      ProjectPermissionPamAccountActions,
      ProjectPermissionSub.PamAccounts | (ForcedSubject<ProjectPermissionSub.PamAccounts> & PamAccountSubjectFields)
    ]
  | [ProjectPermissionPamSessionActions, ProjectPermissionSub.PamSessions]
  | [
      ProjectPermissionCertificateProfileActions,
      (
        | ProjectPermissionSub.CertificateProfiles
        | (ForcedSubject<ProjectPermissionSub.CertificateProfiles> & CertificateProfileSubjectFields)
      )
    ]
  | [ProjectPermissionApprovalRequestActions, ProjectPermissionSub.ApprovalRequests];

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
const PAM_ACCOUNT_PATH_MISSING_SLASH_ERR_MSG = "Invalid Secret Path; it must start with a '/'";
const PAM_ACCOUNT_PATH_PERMISSION_OPERATOR_SCHEMA = z.union([
  z.string().refine((val) => val.startsWith("/"), SECRET_PATH_MISSING_SLASH_ERR_MSG),
  z
    .object({
      [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ].refine(
        (val) => val.startsWith("/"),
        PAM_ACCOUNT_PATH_MISSING_SLASH_ERR_MSG
      ),
      [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ].refine(
        (val) => val.startsWith("/"),
        PAM_ACCOUNT_PATH_MISSING_SLASH_ERR_MSG
      ),
      [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN].refine(
        (val) => val.every((el) => el.startsWith("/")),
        PAM_ACCOUNT_PATH_MISSING_SLASH_ERR_MSG
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

const DynamicSecretConditionV2Schema = z
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
    metadata: z.object({
      [PermissionConditionOperators.$ELEMENTMATCH]: z
        .object({
          key: z
            .object({
              [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
              [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
              [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
            })
            .partial(),
          value: z
            .object({
              [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
              [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
              [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
            })
            .partial()
        })
        .partial()
    })
  })
  .partial();

const SecretSyncConditionV2Schema = z
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
    secretPath: SECRET_PATH_PERMISSION_OPERATOR_SCHEMA
  })
  .partial();

const PkiSyncConditionSchema = z
  .object({
    name: z.union([
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
    subscriberName: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
        })
        .partial()
    ])
  })
  .partial();

const SecretImportConditionSchema = z
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
      .partial(),
    eventType: z.union([
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

const SshHostConditionSchema = z
  .object({
    hostname: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ])
  })
  .partial();

const PkiSubscriberConditionSchema = z
  .object({
    name: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ])
  })
  .partial();

const PkiTemplateConditionSchema = z
  .object({
    name: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ])
  })
  .partial();

const AppConnectionConditionSchema = z
  .object({
    connectionId: z.union([
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

const PamAccountConditionSchema = z
  .object({
    resourceName: z.union([
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
    accountName: z.union([
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
    accountPath: PAM_ACCOUNT_PATH_PERMISSION_OPERATOR_SCHEMA
  })
  .partial();

const CertificateAuthorityConditionSchema = z
  .object({
    name: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
        })
        .partial()
    ])
  })
  .partial();

const CertificateConditionSchema = z
  .object({
    commonName: z.union([
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
    altNames: z.union([
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
    serialNumber: z.union([
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
    friendlyName: z.union([
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
    status: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
        })
        .partial()
    ])
  })
  .partial();

const CertificateProfileConditionSchema = z
  .object({
    slug: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN],
          [PermissionConditionOperators.$GLOB]: PermissionConditionSchema[PermissionConditionOperators.$GLOB]
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
    subject: z.literal(ProjectPermissionSub.SecretRollback).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([ProjectPermissionActions.Read, ProjectPermissionActions.Create]).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Member).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionMemberActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Groups).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionGroupActions).describe(
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
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionAuditLogsActions).describe(
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
    subject: z.literal(ProjectPermissionSub.SshHostGroups).describe("The entity this permission pertains to."),
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
    subject: z.literal(ProjectPermissionSub.Kmip).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionKmipActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Commits).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionCommitsActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z
      .literal(ProjectPermissionSub.SecretScanningDataSources)
      .describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretScanningDataSourceActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretScanningFindings).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretScanningFindingActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretScanningConfigs).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretScanningConfigActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.AppConnections).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionAppConnectionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: AppConnectionConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PamFolders).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PamResources).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PamAccounts).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionPamAccountActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: PamAccountConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PamSessions).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionPamSessionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.ApprovalRequests).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionApprovalRequestActions).describe(
      "Describe what action an entity can take."
    )
  })
];

// Do not update this schema anymore, as it's kept purely for backwards compatibility. Update V2 schema only.
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
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretRotation).describe("The entity this permission pertains to."),
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
    conditions: SecretImportConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.DynamicSecrets).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionDynamicSecretActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: DynamicSecretConditionV2Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Identity).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionIdentityActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: IdentityManagementConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SshHosts).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSshHostActions).describe(
      "Describe what action an entity can take."
    ),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    conditions: SshHostConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PkiSubscribers).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionPkiSubscriberActions).describe(
      "Describe what action an entity can take."
    ),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    conditions: PkiSubscriberConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.CertificateTemplates).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionPkiTemplateActions).describe(
      "Describe what action an entity can take."
    ),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    conditions: PkiTemplateConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretRotation).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretRotationActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretConditionV1Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretSyncs).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretSyncActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretSyncConditionV2Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.PkiSyncs).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionPkiSyncActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: PkiSyncConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.SecretEvents).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionSecretEventActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: SecretSyncConditionV2Schema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.CertificateProfiles).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionCertificateProfileActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: CertificateProfileConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.CertificateAuthorities).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionCertificateAuthorityActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: CertificateAuthorityConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(ProjectPermissionSub.Certificates).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(ProjectPermissionCertificateActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: CertificateConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  ...GeneralPermissionSchema
]);

export type TProjectPermissionV2Schema = z.infer<typeof ProjectPermissionV2Schema>;

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
