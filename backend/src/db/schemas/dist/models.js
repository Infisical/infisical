"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessScope = exports.SortDirection = exports.MembershipActors = exports.TemporaryPermissionMode = exports.OrganizationActionScope = exports.ActionProjectType = exports.ProjectType = exports.IdentityAuthMethod = exports.ProjectUpgradeStatus = exports.ProjectVersion = exports.SecretType = exports.SecretKeyEncoding = exports.SecretEncryptionAlgo = exports.ProjectMembershipRole = exports.OrgMembershipStatus = exports.OrgMembershipRole = exports.ServiceTokenScopes = exports.UserDeviceSchema = exports.TableName = void 0;
const zod_1 = require("zod");
var TableName;
(function (TableName) {
    TableName["Users"] = "users";
    TableName["SshHostGroup"] = "ssh_host_groups";
    TableName["SshHostGroupMembership"] = "ssh_host_group_memberships";
    TableName["SshHost"] = "ssh_hosts";
    TableName["SshHostLoginUser"] = "ssh_host_login_users";
    TableName["SshHostLoginUserMapping"] = "ssh_host_login_user_mappings";
    TableName["SshCertificateAuthority"] = "ssh_certificate_authorities";
    TableName["SshCertificateAuthoritySecret"] = "ssh_certificate_authority_secrets";
    TableName["SshCertificateTemplate"] = "ssh_certificate_templates";
    TableName["SshCertificate"] = "ssh_certificates";
    TableName["SshCertificateBody"] = "ssh_certificate_bodies";
    TableName["CertificateAuthority"] = "certificate_authorities";
    TableName["ExternalCertificateAuthority"] = "external_certificate_authorities";
    TableName["InternalCertificateAuthority"] = "internal_certificate_authorities";
    TableName["CertificateTemplateEstConfig"] = "certificate_template_est_configs";
    TableName["CertificateAuthorityCert"] = "certificate_authority_certs";
    TableName["CertificateAuthoritySecret"] = "certificate_authority_secret";
    TableName["CertificateAuthorityCrl"] = "certificate_authority_crl";
    TableName["Certificate"] = "certificates";
    TableName["CertificateBody"] = "certificate_bodies";
    TableName["CertificateRequests"] = "certificate_requests";
    TableName["CertificateSecret"] = "certificate_secrets";
    TableName["CertificateTemplate"] = "certificate_templates";
    TableName["PkiCertificateTemplateV2"] = "pki_certificate_templates_v2";
    TableName["PkiCertificatePolicy"] = "pki_certificate_policies";
    TableName["PkiCertificateProfile"] = "pki_certificate_profiles";
    TableName["PkiEstEnrollmentConfig"] = "pki_est_enrollment_configs";
    TableName["PkiApiEnrollmentConfig"] = "pki_api_enrollment_configs";
    TableName["PkiAcmeEnrollmentConfig"] = "pki_acme_enrollment_configs";
    TableName["PkiSubscriber"] = "pki_subscribers";
    TableName["PkiAlert"] = "pki_alerts";
    TableName["PkiAlertsV2"] = "pki_alerts_v2";
    TableName["PkiAlertChannels"] = "pki_alert_channels";
    TableName["PkiAlertHistory"] = "pki_alert_history";
    TableName["PkiAlertHistoryCertificate"] = "pki_alert_history_certificate";
    TableName["PkiCollection"] = "pki_collections";
    TableName["PkiCollectionItem"] = "pki_collection_items";
    TableName["Groups"] = "groups";
    TableName["GroupProjectMembership"] = "group_project_memberships";
    TableName["GroupProjectMembershipRole"] = "group_project_membership_roles";
    TableName["ExternalGroupOrgRoleMapping"] = "external_group_org_role_mappings";
    TableName["UserGroupMembership"] = "user_group_membership";
    TableName["IdentityGroupMembership"] = "identity_group_membership";
    TableName["UserAliases"] = "user_aliases";
    TableName["UserEncryptionKey"] = "user_encryption_keys";
    TableName["AuthTokens"] = "auth_tokens";
    TableName["AuthTokenSession"] = "auth_token_sessions";
    TableName["BackupPrivateKey"] = "backup_private_key";
    TableName["Organization"] = "organizations";
    TableName["OrgMembership"] = "org_memberships";
    TableName["OrgRoles"] = "org_roles";
    TableName["OrgBot"] = "org_bots";
    TableName["IncidentContact"] = "incident_contacts";
    TableName["UserAction"] = "user_actions";
    TableName["SuperAdmin"] = "super_admin";
    TableName["RateLimit"] = "rate_limit";
    TableName["ApiKey"] = "api_keys";
    TableName["ProjectSshConfig"] = "project_ssh_configs";
    TableName["Project"] = "projects";
    TableName["ProjectBot"] = "project_bots";
    TableName["Environment"] = "project_environments";
    TableName["ProjectMembership"] = "project_memberships";
    TableName["ProjectRoles"] = "project_roles";
    TableName["ProjectUserAdditionalPrivilege"] = "project_user_additional_privilege";
    TableName["ProjectUserMembershipRole"] = "project_user_membership_roles";
    TableName["ProjectKeys"] = "project_keys";
    TableName["ProjectTemplates"] = "project_templates";
    TableName["ProjectTemplateUserMembership"] = "project_template_user_memberships";
    TableName["ProjectTemplateGroupMembership"] = "project_template_group_memberships";
    TableName["Secret"] = "secrets";
    TableName["SecretReference"] = "secret_references";
    TableName["SecretSharing"] = "secret_sharing";
    TableName["OrganizationAsset"] = "organization_assets";
    TableName["SecretBlindIndex"] = "secret_blind_indexes";
    TableName["SecretVersion"] = "secret_versions";
    TableName["SecretFolder"] = "secret_folders";
    TableName["SecretFolderVersion"] = "secret_folder_versions";
    TableName["SecretImport"] = "secret_imports";
    TableName["Snapshot"] = "secret_snapshots";
    TableName["SnapshotSecret"] = "secret_snapshot_secrets";
    TableName["SnapshotFolder"] = "secret_snapshot_folders";
    TableName["SecretTag"] = "secret_tags";
    TableName["Integration"] = "integrations";
    TableName["IntegrationAuth"] = "integration_auths";
    TableName["ServiceToken"] = "service_tokens";
    TableName["Webhook"] = "webhooks";
    TableName["Identity"] = "identities";
    TableName["IdentityAccessToken"] = "identity_access_tokens";
    TableName["IdentityTokenAuth"] = "identity_token_auths";
    TableName["IdentityUniversalAuth"] = "identity_universal_auths";
    TableName["IdentityKubernetesAuth"] = "identity_kubernetes_auths";
    TableName["IdentityGcpAuth"] = "identity_gcp_auths";
    TableName["IdentityAzureAuth"] = "identity_azure_auths";
    TableName["IdentityUaClientSecret"] = "identity_ua_client_secrets";
    TableName["IdentityAliCloudAuth"] = "identity_alicloud_auths";
    TableName["IdentityAwsAuth"] = "identity_aws_auths";
    TableName["IdentityOciAuth"] = "identity_oci_auths";
    TableName["IdentityOidcAuth"] = "identity_oidc_auths";
    TableName["IdentityJwtAuth"] = "identity_jwt_auths";
    TableName["IdentityLdapAuth"] = "identity_ldap_auths";
    TableName["IdentityTlsCertAuth"] = "identity_tls_cert_auths";
    TableName["IdentityOrgMembership"] = "identity_org_memberships";
    TableName["IdentityProjectMembership"] = "identity_project_memberships";
    TableName["IdentityProjectMembershipRole"] = "identity_project_membership_role";
    TableName["IdentityProjectAdditionalPrivilege"] = "identity_project_additional_privilege";
    TableName["IdentityAuthTemplate"] = "identity_auth_templates";
    // used by both identity and users
    TableName["IdentityMetadata"] = "identity_metadata";
    TableName["ResourceMetadata"] = "resource_metadata";
    TableName["ScimToken"] = "scim_tokens";
    TableName["AccessApprovalPolicy"] = "access_approval_policies";
    TableName["AccessApprovalPolicyApprover"] = "access_approval_policies_approvers";
    TableName["AccessApprovalPolicyBypasser"] = "access_approval_policies_bypassers";
    TableName["AccessApprovalRequest"] = "access_approval_requests";
    TableName["AccessApprovalRequestReviewer"] = "access_approval_requests_reviewers";
    TableName["AccessApprovalPolicyEnvironment"] = "access_approval_policies_environments";
    TableName["SecretApprovalPolicy"] = "secret_approval_policies";
    TableName["SecretApprovalPolicyApprover"] = "secret_approval_policies_approvers";
    TableName["SecretApprovalPolicyBypasser"] = "secret_approval_policies_bypassers";
    TableName["SecretApprovalRequest"] = "secret_approval_requests";
    TableName["SecretApprovalRequestReviewer"] = "secret_approval_requests_reviewers";
    TableName["SecretApprovalRequestSecret"] = "secret_approval_requests_secrets";
    TableName["SecretApprovalRequestSecretTag"] = "secret_approval_request_secret_tags";
    TableName["SecretApprovalPolicyEnvironment"] = "secret_approval_policies_environments";
    TableName["SecretRotation"] = "secret_rotations";
    TableName["SecretRotationOutput"] = "secret_rotation_outputs";
    TableName["SamlConfig"] = "saml_configs";
    TableName["LdapConfig"] = "ldap_configs";
    TableName["OidcConfig"] = "oidc_configs";
    TableName["LdapGroupMap"] = "ldap_group_maps";
    TableName["AuditLog"] = "audit_logs";
    TableName["AuditLogStream"] = "audit_log_streams";
    TableName["GitAppInstallSession"] = "git_app_install_sessions";
    TableName["GitAppOrg"] = "git_app_org";
    TableName["SecretScanningGitRisk"] = "secret_scanning_git_risks";
    TableName["TrustedIps"] = "trusted_ips";
    TableName["DynamicSecret"] = "dynamic_secrets";
    TableName["DynamicSecretLease"] = "dynamic_secret_leases";
    TableName["SecretV2"] = "secrets_v2";
    TableName["SecretReferenceV2"] = "secret_references_v2";
    TableName["SecretVersionV2"] = "secret_versions_v2";
    TableName["SecretApprovalRequestSecretV2"] = "secret_approval_requests_secrets_v2";
    TableName["SecretApprovalRequestSecretTagV2"] = "secret_approval_request_secret_tags_v2";
    TableName["SnapshotSecretV2"] = "secret_snapshot_secrets_v2";
    TableName["ProjectSplitBackfillIds"] = "project_split_backfill_ids";
    TableName["UserNotifications"] = "user_notifications";
    TableName["ScimEvents"] = "scim_events";
    // Gateway
    TableName["OrgGatewayConfig"] = "org_gateway_config";
    TableName["Gateway"] = "gateways";
    TableName["ProjectGateway"] = "project_gateways";
    // junction tables with tags
    TableName["SecretV2JnTag"] = "secret_v2_tag_junction";
    TableName["JnSecretTag"] = "secret_tag_junction";
    TableName["SecretVersionTag"] = "secret_version_tag_junction";
    TableName["SecretVersionV2Tag"] = "secret_version_v2_tag_junction";
    TableName["SecretRotationOutputV2"] = "secret_rotation_output_v2";
    // KMS Service
    TableName["KmsServerRootConfig"] = "kms_root_config";
    TableName["KmsKey"] = "kms_keys";
    TableName["ExternalKms"] = "external_kms";
    TableName["InternalKms"] = "internal_kms";
    TableName["InternalKmsKeyVersion"] = "internal_kms_key_version";
    TableName["TotpConfig"] = "totp_configs";
    TableName["WebAuthnCredential"] = "webauthn_credentials";
    // @depreciated
    TableName["KmsKeyVersion"] = "kms_key_versions";
    TableName["WorkflowIntegrations"] = "workflow_integrations";
    TableName["SlackIntegrations"] = "slack_integrations";
    TableName["ProjectSlackConfigs"] = "project_slack_configs";
    TableName["AppConnection"] = "app_connections";
    TableName["SecretSync"] = "secret_syncs";
    TableName["PkiSync"] = "pki_syncs";
    TableName["CertificateSync"] = "certificate_syncs";
    TableName["KmipClient"] = "kmip_clients";
    TableName["KmipOrgConfig"] = "kmip_org_configs";
    TableName["KmipOrgServerCertificates"] = "kmip_org_server_certificates";
    TableName["KmipClientCertificates"] = "kmip_client_certificates";
    TableName["SecretRotationV2"] = "secret_rotations_v2";
    TableName["SecretRotationV2SecretMapping"] = "secret_rotation_v2_secret_mappings";
    TableName["MicrosoftTeamsIntegrations"] = "microsoft_teams_integrations";
    TableName["ProjectMicrosoftTeamsConfigs"] = "project_microsoft_teams_configs";
    TableName["SecretReminderRecipients"] = "secret_reminder_recipients";
    TableName["GithubOrgSyncConfig"] = "github_org_sync_configs";
    TableName["FolderCommit"] = "folder_commits";
    TableName["FolderCommitChanges"] = "folder_commit_changes";
    TableName["FolderCheckpoint"] = "folder_checkpoints";
    TableName["FolderCheckpointResources"] = "folder_checkpoint_resources";
    TableName["FolderTreeCheckpoint"] = "folder_tree_checkpoints";
    TableName["FolderTreeCheckpointResources"] = "folder_tree_checkpoint_resources";
    TableName["SecretScanningDataSource"] = "secret_scanning_data_sources";
    TableName["SecretScanningResource"] = "secret_scanning_resources";
    TableName["SecretScanningScan"] = "secret_scanning_scans";
    TableName["SecretScanningFinding"] = "secret_scanning_findings";
    TableName["SecretScanningConfig"] = "secret_scanning_configs";
    TableName["Membership"] = "memberships";
    TableName["MembershipRole"] = "membership_roles";
    TableName["Role"] = "roles";
    TableName["AdditionalPrivilege"] = "additional_privileges";
    TableName["Namespace"] = "namespaces";
    // reminders
    TableName["Reminder"] = "reminders";
    TableName["ReminderRecipient"] = "reminders_recipients";
    // gateway v2
    TableName["InstanceRelayConfig"] = "instance_relay_config";
    TableName["OrgRelayConfig"] = "org_relay_config";
    TableName["OrgGatewayConfigV2"] = "org_gateway_config_v2";
    TableName["Relay"] = "relays";
    TableName["GatewayV2"] = "gateways_v2";
    TableName["KeyValueStore"] = "key_value_store";
    // PAM
    TableName["PamFolder"] = "pam_folders";
    TableName["PamResource"] = "pam_resources";
    TableName["PamAccount"] = "pam_accounts";
    TableName["PamSession"] = "pam_sessions";
    TableName["VaultExternalMigrationConfig"] = "vault_external_migration_configs";
    // PKI ACME
    TableName["PkiAcmeAccount"] = "pki_acme_accounts";
    TableName["PkiAcmeOrder"] = "pki_acme_orders";
    TableName["PkiAcmeOrderAuth"] = "pki_acme_order_auths";
    TableName["PkiAcmeAuth"] = "pki_acme_auths";
    TableName["PkiAcmeChallenge"] = "pki_acme_challenges";
    // AI
    TableName["AiMcpServer"] = "ai_mcp_servers";
    TableName["AiMcpServerTool"] = "ai_mcp_server_tools";
    TableName["AiMcpServerUserCredential"] = "ai_mcp_server_user_credentials";
    TableName["AiMcpEndpoint"] = "ai_mcp_endpoints";
    TableName["AiMcpEndpointServer"] = "ai_mcp_endpoint_servers";
    TableName["AiMcpEndpointServerTool"] = "ai_mcp_endpoint_server_tools";
    TableName["AiMcpActivityLog"] = "ai_mcp_activity_logs";
    // Approval Policies
    TableName["ApprovalPolicies"] = "approval_policies";
    TableName["ApprovalPolicySteps"] = "approval_policy_steps";
    TableName["ApprovalPolicyStepApprovers"] = "approval_policy_step_approvers";
    TableName["ApprovalRequests"] = "approval_requests";
    TableName["ApprovalRequestSteps"] = "approval_request_steps";
    TableName["ApprovalRequestStepEligibleApprovers"] = "approval_request_step_eligible_approvers";
    TableName["ApprovalRequestApprovals"] = "approval_request_approvals";
    TableName["ApprovalRequestGrants"] = "approval_request_grants";
})(TableName || (exports.TableName = TableName = {}));
exports.UserDeviceSchema = zod_1.z
    .object({
    ip: zod_1.z.string(),
    userAgent: zod_1.z.string()
})
    .array()
    .default([]);
exports.ServiceTokenScopes = zod_1.z
    .object({
    environment: zod_1.z.string(),
    secretPath: zod_1.z.string().default("/")
})
    .array();
var OrgMembershipRole;
(function (OrgMembershipRole) {
    OrgMembershipRole["Admin"] = "admin";
    OrgMembershipRole["Member"] = "member";
    OrgMembershipRole["NoAccess"] = "no-access";
    OrgMembershipRole["Custom"] = "custom";
})(OrgMembershipRole || (exports.OrgMembershipRole = OrgMembershipRole = {}));
var OrgMembershipStatus;
(function (OrgMembershipStatus) {
    OrgMembershipStatus["Invited"] = "invited";
    OrgMembershipStatus["Accepted"] = "accepted";
})(OrgMembershipStatus || (exports.OrgMembershipStatus = OrgMembershipStatus = {}));
var ProjectMembershipRole;
(function (ProjectMembershipRole) {
    // general
    ProjectMembershipRole["Admin"] = "admin";
    ProjectMembershipRole["Member"] = "member";
    ProjectMembershipRole["Custom"] = "custom";
    ProjectMembershipRole["Viewer"] = "viewer";
    ProjectMembershipRole["NoAccess"] = "no-access";
    // ssh
    ProjectMembershipRole["SshHostBootstrapper"] = "ssh-host-bootstrapper";
    // kms
    ProjectMembershipRole["KmsCryptographicOperator"] = "cryptographic-operator";
})(ProjectMembershipRole || (exports.ProjectMembershipRole = ProjectMembershipRole = {}));
var SecretEncryptionAlgo;
(function (SecretEncryptionAlgo) {
    SecretEncryptionAlgo["AES_256_GCM"] = "aes-256-gcm";
})(SecretEncryptionAlgo || (exports.SecretEncryptionAlgo = SecretEncryptionAlgo = {}));
var SecretKeyEncoding;
(function (SecretKeyEncoding) {
    SecretKeyEncoding["UTF8"] = "utf8";
    SecretKeyEncoding["BASE64"] = "base64";
    SecretKeyEncoding["HEX"] = "hex";
})(SecretKeyEncoding || (exports.SecretKeyEncoding = SecretKeyEncoding = {}));
var SecretType;
(function (SecretType) {
    SecretType["Shared"] = "shared";
    SecretType["Personal"] = "personal";
})(SecretType || (exports.SecretType = SecretType = {}));
var ProjectVersion;
(function (ProjectVersion) {
    ProjectVersion[ProjectVersion["V1"] = 1] = "V1";
    ProjectVersion[ProjectVersion["V2"] = 2] = "V2";
    ProjectVersion[ProjectVersion["V3"] = 3] = "V3";
})(ProjectVersion || (exports.ProjectVersion = ProjectVersion = {}));
var ProjectUpgradeStatus;
(function (ProjectUpgradeStatus) {
    ProjectUpgradeStatus["InProgress"] = "IN_PROGRESS";
    // Completed -> Will be null if completed. So a completed status is not needed
    ProjectUpgradeStatus["Failed"] = "FAILED";
})(ProjectUpgradeStatus || (exports.ProjectUpgradeStatus = ProjectUpgradeStatus = {}));
var IdentityAuthMethod;
(function (IdentityAuthMethod) {
    IdentityAuthMethod["TOKEN_AUTH"] = "token-auth";
    IdentityAuthMethod["UNIVERSAL_AUTH"] = "universal-auth";
    IdentityAuthMethod["KUBERNETES_AUTH"] = "kubernetes-auth";
    IdentityAuthMethod["GCP_AUTH"] = "gcp-auth";
    IdentityAuthMethod["ALICLOUD_AUTH"] = "alicloud-auth";
    IdentityAuthMethod["AWS_AUTH"] = "aws-auth";
    IdentityAuthMethod["AZURE_AUTH"] = "azure-auth";
    IdentityAuthMethod["TLS_CERT_AUTH"] = "tls-cert-auth";
    IdentityAuthMethod["OCI_AUTH"] = "oci-auth";
    IdentityAuthMethod["OIDC_AUTH"] = "oidc-auth";
    IdentityAuthMethod["JWT_AUTH"] = "jwt-auth";
    IdentityAuthMethod["LDAP_AUTH"] = "ldap-auth";
})(IdentityAuthMethod || (exports.IdentityAuthMethod = IdentityAuthMethod = {}));
var ProjectType;
(function (ProjectType) {
    ProjectType["SecretManager"] = "secret-manager";
    ProjectType["CertificateManager"] = "cert-manager";
    ProjectType["KMS"] = "kms";
    ProjectType["SSH"] = "ssh";
    ProjectType["SecretScanning"] = "secret-scanning";
    ProjectType["PAM"] = "pam";
    ProjectType["AI"] = "ai";
})(ProjectType || (exports.ProjectType = ProjectType = {}));
var ActionProjectType;
(function (ActionProjectType) {
    ActionProjectType["SecretManager"] = "secret-manager";
    ActionProjectType["CertificateManager"] = "cert-manager";
    ActionProjectType["KMS"] = "kms";
    ActionProjectType["SSH"] = "ssh";
    ActionProjectType["SecretScanning"] = "secret-scanning";
    ActionProjectType["PAM"] = "pam";
    ActionProjectType["AI"] = "ai";
    // project operations that happen on all types
    ActionProjectType["Any"] = "any";
})(ActionProjectType || (exports.ActionProjectType = ActionProjectType = {}));
var OrganizationActionScope;
(function (OrganizationActionScope) {
    OrganizationActionScope["ChildOrganization"] = "child-organization-only";
    OrganizationActionScope["ParentOrganization"] = "parent-organization-only";
    OrganizationActionScope["Any"] = "any";
})(OrganizationActionScope || (exports.OrganizationActionScope = OrganizationActionScope = {}));
var TemporaryPermissionMode;
(function (TemporaryPermissionMode) {
    TemporaryPermissionMode["Relative"] = "relative";
})(TemporaryPermissionMode || (exports.TemporaryPermissionMode = TemporaryPermissionMode = {}));
var MembershipActors;
(function (MembershipActors) {
    MembershipActors["Group"] = "group";
    MembershipActors["User"] = "user";
    MembershipActors["Identity"] = "identity";
})(MembershipActors || (exports.MembershipActors = MembershipActors = {}));
var SortDirection;
(function (SortDirection) {
    SortDirection["ASC"] = "asc";
    SortDirection["DESC"] = "desc";
})(SortDirection || (exports.SortDirection = SortDirection = {}));
var AccessScope;
(function (AccessScope) {
    AccessScope["Organization"] = "organization";
    AccessScope["Namespace"] = "namespace";
    AccessScope["Project"] = "project";
})(AccessScope || (exports.AccessScope = AccessScope = {}));
//# sourceMappingURL=models.js.map