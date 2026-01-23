import { z } from "zod";
export declare enum TableName {
    Users = "users",
    SshHostGroup = "ssh_host_groups",
    SshHostGroupMembership = "ssh_host_group_memberships",
    SshHost = "ssh_hosts",
    SshHostLoginUser = "ssh_host_login_users",
    SshHostLoginUserMapping = "ssh_host_login_user_mappings",
    SshCertificateAuthority = "ssh_certificate_authorities",
    SshCertificateAuthoritySecret = "ssh_certificate_authority_secrets",
    SshCertificateTemplate = "ssh_certificate_templates",
    SshCertificate = "ssh_certificates",
    SshCertificateBody = "ssh_certificate_bodies",
    CertificateAuthority = "certificate_authorities",
    ExternalCertificateAuthority = "external_certificate_authorities",
    InternalCertificateAuthority = "internal_certificate_authorities",
    CertificateTemplateEstConfig = "certificate_template_est_configs",
    CertificateAuthorityCert = "certificate_authority_certs",
    CertificateAuthoritySecret = "certificate_authority_secret",
    CertificateAuthorityCrl = "certificate_authority_crl",
    Certificate = "certificates",
    CertificateBody = "certificate_bodies",
    CertificateRequests = "certificate_requests",
    CertificateSecret = "certificate_secrets",
    CertificateTemplate = "certificate_templates",
    PkiCertificateTemplateV2 = "pki_certificate_templates_v2",
    PkiCertificatePolicy = "pki_certificate_policies",
    PkiCertificateProfile = "pki_certificate_profiles",
    PkiEstEnrollmentConfig = "pki_est_enrollment_configs",
    PkiApiEnrollmentConfig = "pki_api_enrollment_configs",
    PkiAcmeEnrollmentConfig = "pki_acme_enrollment_configs",
    PkiSubscriber = "pki_subscribers",
    PkiAlert = "pki_alerts",
    PkiAlertsV2 = "pki_alerts_v2",
    PkiAlertChannels = "pki_alert_channels",
    PkiAlertHistory = "pki_alert_history",
    PkiAlertHistoryCertificate = "pki_alert_history_certificate",
    PkiCollection = "pki_collections",
    PkiCollectionItem = "pki_collection_items",
    Groups = "groups",
    GroupProjectMembership = "group_project_memberships",
    GroupProjectMembershipRole = "group_project_membership_roles",
    ExternalGroupOrgRoleMapping = "external_group_org_role_mappings",
    UserGroupMembership = "user_group_membership",
    IdentityGroupMembership = "identity_group_membership",
    UserAliases = "user_aliases",
    UserEncryptionKey = "user_encryption_keys",
    AuthTokens = "auth_tokens",
    AuthTokenSession = "auth_token_sessions",
    BackupPrivateKey = "backup_private_key",
    Organization = "organizations",
    OrgMembership = "org_memberships",
    OrgRoles = "org_roles",
    OrgBot = "org_bots",
    IncidentContact = "incident_contacts",
    UserAction = "user_actions",
    SuperAdmin = "super_admin",
    RateLimit = "rate_limit",
    ApiKey = "api_keys",
    ProjectSshConfig = "project_ssh_configs",
    Project = "projects",
    ProjectBot = "project_bots",
    Environment = "project_environments",
    ProjectMembership = "project_memberships",
    ProjectRoles = "project_roles",
    ProjectUserAdditionalPrivilege = "project_user_additional_privilege",
    ProjectUserMembershipRole = "project_user_membership_roles",
    ProjectKeys = "project_keys",
    ProjectTemplates = "project_templates",
    ProjectTemplateUserMembership = "project_template_user_memberships",
    ProjectTemplateGroupMembership = "project_template_group_memberships",
    Secret = "secrets",
    SecretReference = "secret_references",
    SecretSharing = "secret_sharing",
    OrganizationAsset = "organization_assets",
    SecretBlindIndex = "secret_blind_indexes",
    SecretVersion = "secret_versions",
    SecretFolder = "secret_folders",
    SecretFolderVersion = "secret_folder_versions",
    SecretImport = "secret_imports",
    Snapshot = "secret_snapshots",
    SnapshotSecret = "secret_snapshot_secrets",
    SnapshotFolder = "secret_snapshot_folders",
    SecretTag = "secret_tags",
    Integration = "integrations",
    IntegrationAuth = "integration_auths",
    ServiceToken = "service_tokens",
    Webhook = "webhooks",
    Identity = "identities",
    IdentityAccessToken = "identity_access_tokens",
    IdentityTokenAuth = "identity_token_auths",
    IdentityUniversalAuth = "identity_universal_auths",
    IdentityKubernetesAuth = "identity_kubernetes_auths",
    IdentityGcpAuth = "identity_gcp_auths",
    IdentityAzureAuth = "identity_azure_auths",
    IdentityUaClientSecret = "identity_ua_client_secrets",
    IdentityAliCloudAuth = "identity_alicloud_auths",
    IdentityAwsAuth = "identity_aws_auths",
    IdentityOciAuth = "identity_oci_auths",
    IdentityOidcAuth = "identity_oidc_auths",
    IdentityJwtAuth = "identity_jwt_auths",
    IdentityLdapAuth = "identity_ldap_auths",
    IdentityTlsCertAuth = "identity_tls_cert_auths",
    IdentityOrgMembership = "identity_org_memberships",
    IdentityProjectMembership = "identity_project_memberships",
    IdentityProjectMembershipRole = "identity_project_membership_role",
    IdentityProjectAdditionalPrivilege = "identity_project_additional_privilege",
    IdentityAuthTemplate = "identity_auth_templates",
    IdentityMetadata = "identity_metadata",
    ResourceMetadata = "resource_metadata",
    ScimToken = "scim_tokens",
    AccessApprovalPolicy = "access_approval_policies",
    AccessApprovalPolicyApprover = "access_approval_policies_approvers",
    AccessApprovalPolicyBypasser = "access_approval_policies_bypassers",
    AccessApprovalRequest = "access_approval_requests",
    AccessApprovalRequestReviewer = "access_approval_requests_reviewers",
    AccessApprovalPolicyEnvironment = "access_approval_policies_environments",
    SecretApprovalPolicy = "secret_approval_policies",
    SecretApprovalPolicyApprover = "secret_approval_policies_approvers",
    SecretApprovalPolicyBypasser = "secret_approval_policies_bypassers",
    SecretApprovalRequest = "secret_approval_requests",
    SecretApprovalRequestReviewer = "secret_approval_requests_reviewers",
    SecretApprovalRequestSecret = "secret_approval_requests_secrets",
    SecretApprovalRequestSecretTag = "secret_approval_request_secret_tags",
    SecretApprovalPolicyEnvironment = "secret_approval_policies_environments",
    SecretRotation = "secret_rotations",
    SecretRotationOutput = "secret_rotation_outputs",
    SamlConfig = "saml_configs",
    LdapConfig = "ldap_configs",
    OidcConfig = "oidc_configs",
    LdapGroupMap = "ldap_group_maps",
    AuditLog = "audit_logs",
    AuditLogStream = "audit_log_streams",
    GitAppInstallSession = "git_app_install_sessions",
    GitAppOrg = "git_app_org",
    SecretScanningGitRisk = "secret_scanning_git_risks",
    TrustedIps = "trusted_ips",
    DynamicSecret = "dynamic_secrets",
    DynamicSecretLease = "dynamic_secret_leases",
    SecretV2 = "secrets_v2",
    SecretReferenceV2 = "secret_references_v2",
    SecretVersionV2 = "secret_versions_v2",
    SecretApprovalRequestSecretV2 = "secret_approval_requests_secrets_v2",
    SecretApprovalRequestSecretTagV2 = "secret_approval_request_secret_tags_v2",
    SnapshotSecretV2 = "secret_snapshot_secrets_v2",
    ProjectSplitBackfillIds = "project_split_backfill_ids",
    UserNotifications = "user_notifications",
    ScimEvents = "scim_events",
    OrgGatewayConfig = "org_gateway_config",
    Gateway = "gateways",
    ProjectGateway = "project_gateways",
    SecretV2JnTag = "secret_v2_tag_junction",
    JnSecretTag = "secret_tag_junction",
    SecretVersionTag = "secret_version_tag_junction",
    SecretVersionV2Tag = "secret_version_v2_tag_junction",
    SecretRotationOutputV2 = "secret_rotation_output_v2",
    KmsServerRootConfig = "kms_root_config",
    KmsKey = "kms_keys",
    ExternalKms = "external_kms",
    InternalKms = "internal_kms",
    InternalKmsKeyVersion = "internal_kms_key_version",
    TotpConfig = "totp_configs",
    WebAuthnCredential = "webauthn_credentials",
    KmsKeyVersion = "kms_key_versions",
    WorkflowIntegrations = "workflow_integrations",
    SlackIntegrations = "slack_integrations",
    ProjectSlackConfigs = "project_slack_configs",
    AppConnection = "app_connections",
    SecretSync = "secret_syncs",
    PkiSync = "pki_syncs",
    CertificateSync = "certificate_syncs",
    KmipClient = "kmip_clients",
    KmipOrgConfig = "kmip_org_configs",
    KmipOrgServerCertificates = "kmip_org_server_certificates",
    KmipClientCertificates = "kmip_client_certificates",
    SecretRotationV2 = "secret_rotations_v2",
    SecretRotationV2SecretMapping = "secret_rotation_v2_secret_mappings",
    MicrosoftTeamsIntegrations = "microsoft_teams_integrations",
    ProjectMicrosoftTeamsConfigs = "project_microsoft_teams_configs",
    SecretReminderRecipients = "secret_reminder_recipients",// TODO(Carlos): Remove this in the future after migrating to the new reminder recipients table
    GithubOrgSyncConfig = "github_org_sync_configs",
    FolderCommit = "folder_commits",
    FolderCommitChanges = "folder_commit_changes",
    FolderCheckpoint = "folder_checkpoints",
    FolderCheckpointResources = "folder_checkpoint_resources",
    FolderTreeCheckpoint = "folder_tree_checkpoints",
    FolderTreeCheckpointResources = "folder_tree_checkpoint_resources",
    SecretScanningDataSource = "secret_scanning_data_sources",
    SecretScanningResource = "secret_scanning_resources",
    SecretScanningScan = "secret_scanning_scans",
    SecretScanningFinding = "secret_scanning_findings",
    SecretScanningConfig = "secret_scanning_configs",
    Membership = "memberships",
    MembershipRole = "membership_roles",
    Role = "roles",
    AdditionalPrivilege = "additional_privileges",
    Namespace = "namespaces",
    Reminder = "reminders",
    ReminderRecipient = "reminders_recipients",
    InstanceRelayConfig = "instance_relay_config",
    OrgRelayConfig = "org_relay_config",
    OrgGatewayConfigV2 = "org_gateway_config_v2",
    Relay = "relays",
    GatewayV2 = "gateways_v2",
    KeyValueStore = "key_value_store",
    PamFolder = "pam_folders",
    PamResource = "pam_resources",
    PamAccount = "pam_accounts",
    PamSession = "pam_sessions",
    VaultExternalMigrationConfig = "vault_external_migration_configs",
    PkiAcmeAccount = "pki_acme_accounts",
    PkiAcmeOrder = "pki_acme_orders",
    PkiAcmeOrderAuth = "pki_acme_order_auths",
    PkiAcmeAuth = "pki_acme_auths",
    PkiAcmeChallenge = "pki_acme_challenges",
    AiMcpServer = "ai_mcp_servers",
    AiMcpServerTool = "ai_mcp_server_tools",
    AiMcpServerUserCredential = "ai_mcp_server_user_credentials",
    AiMcpEndpoint = "ai_mcp_endpoints",
    AiMcpEndpointServer = "ai_mcp_endpoint_servers",
    AiMcpEndpointServerTool = "ai_mcp_endpoint_server_tools",
    AiMcpActivityLog = "ai_mcp_activity_logs",
    ApprovalPolicies = "approval_policies",
    ApprovalPolicySteps = "approval_policy_steps",
    ApprovalPolicyStepApprovers = "approval_policy_step_approvers",
    ApprovalRequests = "approval_requests",
    ApprovalRequestSteps = "approval_request_steps",
    ApprovalRequestStepEligibleApprovers = "approval_request_step_eligible_approvers",
    ApprovalRequestApprovals = "approval_request_approvals",
    ApprovalRequestGrants = "approval_request_grants"
}
export type TImmutableDBKeys = "id" | "createdAt" | "updatedAt" | "commitId";
export declare const UserDeviceSchema: z.ZodDefault<z.ZodArray<z.ZodObject<{
    ip: z.ZodString;
    userAgent: z.ZodString;
}, "strip", z.ZodTypeAny, {
    ip: string;
    userAgent: string;
}, {
    ip: string;
    userAgent: string;
}>, "many">>;
export declare const ServiceTokenScopes: z.ZodArray<z.ZodObject<{
    environment: z.ZodString;
    secretPath: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    environment: string;
    secretPath: string;
}, {
    environment: string;
    secretPath?: string | undefined;
}>, "many">;
export declare enum OrgMembershipRole {
    Admin = "admin",
    Member = "member",
    NoAccess = "no-access",
    Custom = "custom"
}
export declare enum OrgMembershipStatus {
    Invited = "invited",
    Accepted = "accepted"
}
export declare enum ProjectMembershipRole {
    Admin = "admin",
    Member = "member",
    Custom = "custom",
    Viewer = "viewer",
    NoAccess = "no-access",
    SshHostBootstrapper = "ssh-host-bootstrapper",
    KmsCryptographicOperator = "cryptographic-operator"
}
export declare enum SecretEncryptionAlgo {
    AES_256_GCM = "aes-256-gcm"
}
export declare enum SecretKeyEncoding {
    UTF8 = "utf8",
    BASE64 = "base64",
    HEX = "hex"
}
export declare enum SecretType {
    Shared = "shared",
    Personal = "personal"
}
export declare enum ProjectVersion {
    V1 = 1,
    V2 = 2,
    V3 = 3
}
export declare enum ProjectUpgradeStatus {
    InProgress = "IN_PROGRESS",
    Failed = "FAILED"
}
export declare enum IdentityAuthMethod {
    TOKEN_AUTH = "token-auth",
    UNIVERSAL_AUTH = "universal-auth",
    KUBERNETES_AUTH = "kubernetes-auth",
    GCP_AUTH = "gcp-auth",
    ALICLOUD_AUTH = "alicloud-auth",
    AWS_AUTH = "aws-auth",
    AZURE_AUTH = "azure-auth",
    TLS_CERT_AUTH = "tls-cert-auth",
    OCI_AUTH = "oci-auth",
    OIDC_AUTH = "oidc-auth",
    JWT_AUTH = "jwt-auth",
    LDAP_AUTH = "ldap-auth"
}
export declare enum ProjectType {
    SecretManager = "secret-manager",
    CertificateManager = "cert-manager",
    KMS = "kms",
    SSH = "ssh",
    SecretScanning = "secret-scanning",
    PAM = "pam",
    AI = "ai"
}
export declare enum ActionProjectType {
    SecretManager = "secret-manager",
    CertificateManager = "cert-manager",
    KMS = "kms",
    SSH = "ssh",
    SecretScanning = "secret-scanning",
    PAM = "pam",
    AI = "ai",
    Any = "any"
}
export declare enum OrganizationActionScope {
    ChildOrganization = "child-organization-only",
    ParentOrganization = "parent-organization-only",
    Any = "any"
}
export declare enum TemporaryPermissionMode {
    Relative = "relative"
}
export declare enum MembershipActors {
    Group = "group",
    User = "user",
    Identity = "identity"
}
export declare enum SortDirection {
    ASC = "asc",
    DESC = "desc"
}
export declare enum AccessScope {
    Organization = "organization",
    Namespace = "namespace",
    Project = "project"
}
export type AccessScopeData = {
    scope: AccessScope.Organization;
    orgId: string;
} | {
    scope: AccessScope.Namespace;
    orgId: string;
    namespaceId: string;
} | {
    scope: AccessScope.Project;
    orgId: string;
    projectId: string;
};
//# sourceMappingURL=models.d.ts.map