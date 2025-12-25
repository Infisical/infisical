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
  List = "list",
  ReadPrivateKey = "read-private-key",
  Import = "import"
}

export enum ProjectPermissionSecretActions {
  DescribeAndReadValue = "read",
  DescribeSecret = "describeSecret",
  ReadValue = "readValue",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Subscribe = "subscribe"
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

export enum ProjectPermissionPkiSyncActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  List = "list",
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
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

export enum ProjectPermissionPkiSubscriberActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  ListCerts = "list-certs"
}

export enum ProjectPermissionPkiTemplateActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  ListCerts = "list-certs"
}

export enum ProjectPermissionCertificateAuthorityActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  List = "list",
  IssueCACertificate = "issue-ca-certificate",
  SignIntermediate = "sign-intermediate"
}

export enum ProjectPermissionCertificateProfileActions {
  Read = "read",
  List = "list",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  IssueCert = "issue-cert",
  RevealAcmeEabSecret = "reveal-acme-eab-secret",
  RotateAcmeEabSecret = "rotate-acme-eab-secret"
}

export enum ProjectPermissionSecretRotationActions {
  Read = "read",
  ReadGeneratedCredentials = "read-generated-credentials",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  RotateSecrets = "rotate-secrets"
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

export enum ProjectPermissionAppConnectionActions {
  Read = "read-app-connections",
  Create = "create-app-connections",
  Edit = "edit-app-connections",
  Delete = "delete-app-connections",
  Connect = "connect-app-connections"
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

export enum ProjectPermissionCommitsActions {
  Read = "read",
  PerformRollback = "perform-rollback"
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

export enum ProjectPermissionMcpEndpointActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Connect = "connect"
}

export enum ProjectPermissionApprovalRequestActions {
  Read = "read",
  Create = "create"
}

export enum ProjectPermissionApprovalRequestGrantActions {
  Read = "read",
  Revoke = "revoke"
}

export type IdentityManagementSubjectFields = {
  identityId: string;
};

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type ConditionalProjectPermissionSubject =
  | ProjectPermissionSub.SecretSyncs
  | ProjectPermissionSub.PkiSyncs
  | ProjectPermissionSub.Secrets
  | ProjectPermissionSub.DynamicSecrets
  | ProjectPermissionSub.Identity
  | ProjectPermissionSub.SshHosts
  | ProjectPermissionSub.PkiSubscribers
  | ProjectPermissionSub.CertificateTemplates
  | ProjectPermissionSub.CertificateAuthorities
  | ProjectPermissionSub.Certificates
  | ProjectPermissionSub.CertificateProfiles
  | ProjectPermissionSub.SecretFolders
  | ProjectPermissionSub.SecretImports
  | ProjectPermissionSub.SecretRotation
  | ProjectPermissionSub.SecretEvents
  | ProjectPermissionSub.AppConnections
  | ProjectPermissionSub.PamAccounts;

export const formatedConditionsOperatorNames: { [K in PermissionConditionOperators]: string } = {
  [PermissionConditionOperators.$EQ]: "equal to",
  [PermissionConditionOperators.$IN]: "in",
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
  CertificateProfiles = "certificate-profiles",
  Kms = "kms",
  Cmek = "cmek",
  SecretSyncs = "secret-syncs",
  PkiSyncs = "pki-syncs",
  Kmip = "kmip",
  Commits = "commits",
  SecretScanningDataSources = "secret-scanning-data-sources",
  SecretScanningFindings = "secret-scanning-findings",
  SecretScanningConfigs = "secret-scanning-configs",
  SecretEvents = "secret-events",
  AppConnections = "app-connections",
  PamFolders = "pam-folders",
  PamResources = "pam-resources",
  PamAccounts = "pam-accounts",
  PamSessions = "pam-sessions",
  McpEndpoints = "mcp-endpoints",
  McpServers = "mcp-servers",
  McpActivityLogs = "mcp-activity-logs",
  ApprovalRequests = "approval-requests",
  ApprovalRequestGrants = "approval-request-grants"
}

export type SecretSubjectFields = {
  environment: string;
  secretPath: string;
  secretName: string;
  secretTags: string[];
};

export type SecretEventSubjectFields = {
  environment: string;
  secretPath: string;
  secretName: string;
  secretTags: string[];
  action: string;
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

export type SecretSyncSubjectFields = {
  environment: string;
  secretPath: string;
};

export type PkiSyncSubjectFields = {
  subscriberName: string;
  name: string;
};

export type CertificateAuthoritySubjectFields = {
  name: string;
};

export type CertificateSubjectFields = {
  commonName?: string;
  altNames?: string;
  serialNumber?: string;
};

export type CertificateProfileSubjectFields = {
  slug: string;
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

export type PkiTemplateSubjectFields = {
  name: string;
  // (dangtony98): consider adding [commonName] as a subject field in the future
};

export type PamAccountSubjectFields = {
  resourceName: string;
  accountName: string;
  accountPath: string;
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
      ProjectPermissionSecretSyncActions,
      (
        | ProjectPermissionSub.SecretSyncs
        | (ForcedSubject<ProjectPermissionSub.SecretSyncs> & SecretSyncSubjectFields)
      )
    ]
  | [
      ProjectPermissionPkiSyncActions,
      (
        | ProjectPermissionSub.PkiSyncs
        | (ForcedSubject<ProjectPermissionSub.PkiSyncs> & PkiSyncSubjectFields)
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
  | [ProjectPermissionAuditLogsActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretApproval]
  | [
      ProjectPermissionIdentityActions,
      (
        | ProjectPermissionSub.Identity
        | (ForcedSubject<ProjectPermissionSub.Identity> & IdentityManagementSubjectFields)
      )
    ]
  | [
      ProjectPermissionCertificateAuthorityActions,
      (
        | ProjectPermissionSub.CertificateAuthorities
        | (ForcedSubject<ProjectPermissionSub.CertificateAuthorities> &
            CertificateAuthoritySubjectFields)
      )
    ]
  | [
      ProjectPermissionCertificateActions,
      (
        | ProjectPermissionSub.Certificates
        | (ForcedSubject<ProjectPermissionSub.Certificates> & CertificateSubjectFields)
      )
    ]
  | [
      ProjectPermissionPkiTemplateActions,
      (
        | ProjectPermissionSub.CertificateTemplates
        | (ForcedSubject<ProjectPermissionSub.CertificateTemplates> & PkiTemplateSubjectFields)
      )
    ]
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
  | [
      ProjectPermissionCertificateProfileActions,
      (
        | ProjectPermissionSub.CertificateProfiles
        | (ForcedSubject<ProjectPermissionSub.CertificateProfiles> &
            CertificateProfileSubjectFields)
      )
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiAlerts]
  | [ProjectPermissionActions, ProjectPermissionSub.PkiCollections]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Project]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionCmekActions, ProjectPermissionSub.Cmek]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Kms]
  | [ProjectPermissionKmipActions, ProjectPermissionSub.Kmip]
  | [ProjectPermissionCommitsActions, ProjectPermissionSub.Commits]
  | [
      ProjectPermissionSecretScanningDataSourceActions,
      ProjectPermissionSub.SecretScanningDataSources
    ]
  | [ProjectPermissionSecretScanningFindingActions, ProjectPermissionSub.SecretScanningFindings]
  | [ProjectPermissionSecretScanningConfigActions, ProjectPermissionSub.SecretScanningConfigs]
  | [
      ProjectPermissionSecretEventActions,
      (
        | ProjectPermissionSub.SecretEvents
        | (ForcedSubject<ProjectPermissionSub.SecretEvents> & SecretEventSubjectFields)
      )
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
      (
        | ProjectPermissionSub.PamAccounts
        | (ForcedSubject<ProjectPermissionSub.PamAccounts> & PamAccountSubjectFields)
      )
    ]
  | [ProjectPermissionPamSessionActions, ProjectPermissionSub.PamSessions]
  | [ProjectPermissionApprovalRequestActions, ProjectPermissionSub.ApprovalRequests]
  | [ProjectPermissionApprovalRequestGrantActions, ProjectPermissionSub.ApprovalRequestGrants]
  | [ProjectPermissionMcpEndpointActions, ProjectPermissionSub.McpEndpoints]
  | [ProjectPermissionActions, ProjectPermissionSub.McpServers]
  | [ProjectPermissionActions, ProjectPermissionSub.McpActivityLogs];

export type TProjectPermission = MongoAbility<ProjectPermissionSet>;
