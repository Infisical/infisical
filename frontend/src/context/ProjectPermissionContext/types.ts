import { ForcedSubject, MongoAbility } from "@casl/ability";

export enum ProjectPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionCertificateActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  ReadPrivateKey = "read-private-key"
}

export enum ProjectPermissionSecretActions {
  DescribeAndReadValue = "read",
  DescribeSecret = "describeSecret",
  ReadValue = "readValue",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionApprovalActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  AllowChangeBypass = "allow-change-bypass"
}

export enum ProjectPermissionDynamicSecretActions {
  ReadRootCredential = "read-root-credential",
  CreateRootCredential = "create-root-credential",
  EditRootCredential = "edit-root-credential",
  DeleteRootCredential = "delete-root-credential",
  Lease = "lease"
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

export enum ProjectPermissionKmipActions {
  CreateClients = "create-clients",
  UpdateClients = "update-clients",
  DeleteClients = "delete-clients",
  ReadClients = "read-clients",
  GenerateClientCertificates = "generate-client-certificates"
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

export enum ProjectPermissionIdentityActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AssumePrivileges = "assume-privileges"
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

export enum ProjectPermissionPkiSubscriberActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  ListCerts = "list-certs"
}

export enum ProjectPermissionSecretRotationActions {
  Read = "read",
  ReadGeneratedCredentials = "read-generated-credentials",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  RotateSecrets = "rotate-secrets"
}

export enum PermissionConditionOperators {
  $IN = "$in",
  $ALL = "$all",
  $REGEX = "$regex",
  $EQ = "$eq",
  $NEQ = "$ne",
  $GLOB = "$glob",
  $ELEMENTMATCH = "$elemMatch"
}

export type IdentityManagementSubjectFields = {
  identityId: string;
};

export const formatedConditionsOperatorNames: { [K in PermissionConditionOperators]: string } = {
  [PermissionConditionOperators.$EQ]: "equal to",
  [PermissionConditionOperators.$IN]: "contains",
  [PermissionConditionOperators.$ALL]: "contains all",
  [PermissionConditionOperators.$NEQ]: "not equal to",
  [PermissionConditionOperators.$GLOB]: "matches glob pattern",
  [PermissionConditionOperators.$REGEX]: "matches regex pattern",
  [PermissionConditionOperators.$ELEMENTMATCH]: "element matches"
};

export type TPermissionConditionOperators = {
  [PermissionConditionOperators.$IN]: string[];
  [PermissionConditionOperators.$ALL]: string[];
  [PermissionConditionOperators.$EQ]: string;
  [PermissionConditionOperators.$NEQ]: string;
  [PermissionConditionOperators.$REGEX]: string;
  [PermissionConditionOperators.$GLOB]: string;
  [PermissionConditionOperators.$ELEMENTMATCH]: Record<
    string,
    Partial<TPermissionConditionOperators>
  >;
};

export type TPermissionCondition = Record<
  string,
  | string
  | {
      $in: string[];
      $all: string[];
      $regex: string;
      $eq: string;
      $ne: string;
      $glob: string;
      $elemMatch: Partial<TPermissionCondition>;
    }
>;

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
  SshCertificateTemplates = "ssh-certificate-templates",
  SshCertificates = "ssh-certificates",
  SshHosts = "ssh-hosts",
  SshHostGroups = "ssh-host-groups",
  PkiAlerts = "pki-alerts",
  PkiCollections = "pki-collections",
  PkiSubscribers = "pki-subscribers",
  Kms = "kms",
  Cmek = "cmek",
  SecretSyncs = "secret-syncs",
  Kmip = "kmip"
}

export type SecretSubjectFields = {
  environment: string;
  secretPath: string;
  secretName: string;
  secretTags: string[];
};

export type SecretFolderSubjectFields = {
  environment: string;
  secretPath: string;
};

export type DynamicSecretSubjectFields = {
  environment: string;
  secretPath: string;
  metadata?: (string | { key: string; value: string })[];
};

export type SecretImportSubjectFields = {
  environment: string;
  secretPath: string;
};

export type SecretRotationSubjectFields = {
  environment: string;
  secretPath: string;
};

export type SshHostSubjectFields = {
  hostname: string;
};

export type PkiSubscriberSubjectFields = {
  name: string;
};

export type ProjectPermissionSet =
  | [
      ProjectPermissionSecretActions,
      (
        | ProjectPermissionSub.Secrets
        | (ForcedSubject<ProjectPermissionSub.Secrets> & SecretSubjectFields)
      )
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
  | [
      ProjectPermissionSecretRotationActions,
      (
        | ProjectPermissionSub.SecretRotation
        | (ForcedSubject<ProjectPermissionSub.SecretRotation> & SecretRotationSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.Role]
  | [ProjectPermissionActions, ProjectPermissionSub.Tags]
  | [ProjectPermissionMemberActions, ProjectPermissionSub.Member]
  | [ProjectPermissionActions, ProjectPermissionSub.Groups]
  | [ProjectPermissionActions, ProjectPermissionSub.Integrations]
  | [ProjectPermissionActions, ProjectPermissionSub.Webhooks]
  | [ProjectPermissionActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionApprovalActions, ProjectPermissionSub.SecretApproval]
  | [
      ProjectPermissionIdentityActions,
      (
        | ProjectPermissionSub.Identity
        | (ForcedSubject<ProjectPermissionSub.Identity> & IdentityManagementSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.CertificateAuthorities]
  | [ProjectPermissionCertificateActions, ProjectPermissionSub.Certificates]
  | [ProjectPermissionActions, ProjectPermissionSub.CertificateTemplates]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificateAuthorities]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificateTemplates]
  | [ProjectPermissionActions, ProjectPermissionSub.SshCertificates]
  | [ProjectPermissionActions, ProjectPermissionSub.SshHostGroups]
  | [
      ProjectPermissionSshHostActions,
      (
        | ProjectPermissionSub.SshHosts
        | (ForcedSubject<ProjectPermissionSub.SshHosts> & SshHostSubjectFields)
      )
    ]
  | [
      ProjectPermissionPkiSubscriberActions,
      (
        | ProjectPermissionSub.PkiSubscribers
        | (ForcedSubject<ProjectPermissionSub.PkiSubscribers> & PkiSubscriberSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiAlerts]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiCollections]
  | [ProjectPermissionSecretSyncActions, ProjectPermissionSub.SecretSyncs]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionCmekActions, ProjectPermissionSub.Cmek]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Kms]
  | [ProjectPermissionKmipActions, ProjectPermissionSub.Kmip];

export type TProjectPermission = MongoAbility<ProjectPermissionSet>;
