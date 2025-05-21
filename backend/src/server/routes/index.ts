import { CronJob } from "cron";
import { Knex } from "knex";
import { monitorEventLoopDelay } from "perf_hooks";
import { z } from "zod";

import { registerCertificateEstRouter } from "@app/ee/routes/est/certificate-est-router";
import { registerV1EERoutes } from "@app/ee/routes/v1";
import { registerV2EERoutes } from "@app/ee/routes/v2";
import { accessApprovalPolicyApproverDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-approver-dal";
import { accessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { accessApprovalPolicyServiceFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-service";
import { accessApprovalRequestDALFactory } from "@app/ee/services/access-approval-request/access-approval-request-dal";
import { accessApprovalRequestReviewerDALFactory } from "@app/ee/services/access-approval-request/access-approval-request-reviewer-dal";
import { accessApprovalRequestServiceFactory } from "@app/ee/services/access-approval-request/access-approval-request-service";
import { assumePrivilegeServiceFactory } from "@app/ee/services/assume-privilege/assume-privilege-service";
import { auditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { auditLogQueueServiceFactory } from "@app/ee/services/audit-log/audit-log-queue";
import { auditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-service";
import { auditLogStreamDALFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-dal";
import { auditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
import { certificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { certificateAuthorityCrlServiceFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-service";
import { certificateEstServiceFactory } from "@app/ee/services/certificate-est/certificate-est-service";
import { dynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { dynamicSecretServiceFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-service";
import { buildDynamicSecretProviders } from "@app/ee/services/dynamic-secret/providers";
import { dynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { dynamicSecretLeaseQueueServiceFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-queue";
import { dynamicSecretLeaseServiceFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-service";
import { externalKmsDALFactory } from "@app/ee/services/external-kms/external-kms-dal";
import { externalKmsServiceFactory } from "@app/ee/services/external-kms/external-kms-service";
import { gatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { gatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { orgGatewayConfigDALFactory } from "@app/ee/services/gateway/org-gateway-config-dal";
import { githubOrgSyncDALFactory } from "@app/ee/services/github-org-sync/github-org-sync-dal";
import { githubOrgSyncServiceFactory } from "@app/ee/services/github-org-sync/github-org-sync-service";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { groupServiceFactory } from "@app/ee/services/group/group-service";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { HsmModule } from "@app/ee/services/hsm/hsm-types";
import { identityProjectAdditionalPrivilegeDALFactory } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-dal";
import { identityProjectAdditionalPrivilegeServiceFactory } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-service";
import { identityProjectAdditionalPrivilegeV2ServiceFactory } from "@app/ee/services/identity-project-additional-privilege-v2/identity-project-additional-privilege-v2-service";
import { kmipClientCertificateDALFactory } from "@app/ee/services/kmip/kmip-client-certificate-dal";
import { kmipClientDALFactory } from "@app/ee/services/kmip/kmip-client-dal";
import { kmipOperationServiceFactory } from "@app/ee/services/kmip/kmip-operation-service";
import { kmipOrgConfigDALFactory } from "@app/ee/services/kmip/kmip-org-config-dal";
import { kmipOrgServerCertificateDALFactory } from "@app/ee/services/kmip/kmip-org-server-certificate-dal";
import { kmipServiceFactory } from "@app/ee/services/kmip/kmip-service";
import { ldapConfigDALFactory } from "@app/ee/services/ldap-config/ldap-config-dal";
import { ldapConfigServiceFactory } from "@app/ee/services/ldap-config/ldap-config-service";
import { ldapGroupMapDALFactory } from "@app/ee/services/ldap-config/ldap-group-map-dal";
import { licenseDALFactory } from "@app/ee/services/license/license-dal";
import { licenseServiceFactory } from "@app/ee/services/license/license-service";
import { oidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { oidcConfigServiceFactory } from "@app/ee/services/oidc/oidc-config-service";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { projectTemplateDALFactory } from "@app/ee/services/project-template/project-template-dal";
import { projectTemplateServiceFactory } from "@app/ee/services/project-template/project-template-service";
import { projectUserAdditionalPrivilegeDALFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-dal";
import { projectUserAdditionalPrivilegeServiceFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-service";
import { rateLimitDALFactory } from "@app/ee/services/rate-limit/rate-limit-dal";
import { rateLimitServiceFactory } from "@app/ee/services/rate-limit/rate-limit-service";
import { samlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { samlConfigServiceFactory } from "@app/ee/services/saml-config/saml-config-service";
import { scimDALFactory } from "@app/ee/services/scim/scim-dal";
import { scimServiceFactory } from "@app/ee/services/scim/scim-service";
import { secretApprovalPolicyApproverDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-approver-dal";
import { secretApprovalPolicyDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-dal";
import { secretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { secretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { secretApprovalRequestReviewerDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-reviewer-dal";
import { secretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { secretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { secretReplicationServiceFactory } from "@app/ee/services/secret-replication/secret-replication-service";
import { secretRotationDALFactory } from "@app/ee/services/secret-rotation/secret-rotation-dal";
import { secretRotationQueueFactory } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { secretRotationServiceFactory } from "@app/ee/services/secret-rotation/secret-rotation-service";
import { secretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { secretRotationV2QueueServiceFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-queue";
import { secretRotationV2ServiceFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-service";
import { gitAppDALFactory } from "@app/ee/services/secret-scanning/git-app-dal";
import { gitAppInstallSessionDALFactory } from "@app/ee/services/secret-scanning/git-app-install-session-dal";
import { secretScanningDALFactory } from "@app/ee/services/secret-scanning/secret-scanning-dal";
import { secretScanningQueueFactory } from "@app/ee/services/secret-scanning/secret-scanning-queue";
import { secretScanningServiceFactory } from "@app/ee/services/secret-scanning/secret-scanning-service";
import { secretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { snapshotDALFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { snapshotFolderDALFactory } from "@app/ee/services/secret-snapshot/snapshot-folder-dal";
import { snapshotSecretDALFactory } from "@app/ee/services/secret-snapshot/snapshot-secret-dal";
import { snapshotSecretV2DALFactory } from "@app/ee/services/secret-snapshot/snapshot-secret-v2-dal";
import { sshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { sshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { sshCertificateAuthorityServiceFactory } from "@app/ee/services/ssh/ssh-certificate-authority-service";
import { sshCertificateBodyDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-body-dal";
import { sshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { sshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { sshCertificateTemplateServiceFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-service";
import { sshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { sshHostLoginUserMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-user-mapping-dal";
import { sshHostServiceFactory } from "@app/ee/services/ssh-host/ssh-host-service";
import { sshHostLoginUserDALFactory } from "@app/ee/services/ssh-host/ssh-login-user-dal";
import { sshHostGroupDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-dal";
import { sshHostGroupMembershipDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-membership-dal";
import { sshHostGroupServiceFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-service";
import { trustedIpDALFactory } from "@app/ee/services/trusted-ip/trusted-ip-dal";
import { trustedIpServiceFactory } from "@app/ee/services/trusted-ip/trusted-ip-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { TQueueServiceFactory } from "@app/queue";
import { readLimit } from "@app/server/config/rateLimiter";
import { accessTokenQueueServiceFactory } from "@app/services/access-token-queue/access-token-queue";
import { apiKeyDALFactory } from "@app/services/api-key/api-key-dal";
import { apiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { appConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { appConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { authDALFactory } from "@app/services/auth/auth-dal";
import { authLoginServiceFactory } from "@app/services/auth/auth-login-service";
import { authPaswordServiceFactory } from "@app/services/auth/auth-password-service";
import { authSignupServiceFactory } from "@app/services/auth/auth-signup-service";
import { tokenDALFactory } from "@app/services/auth-token/auth-token-dal";
import { tokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { certificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { certificateDALFactory } from "@app/services/certificate/certificate-dal";
import { certificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { certificateServiceFactory } from "@app/services/certificate/certificate-service";
import { certificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { certificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { certificateAuthorityQueueFactory } from "@app/services/certificate-authority/certificate-authority-queue";
import { certificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { certificateAuthorityServiceFactory } from "@app/services/certificate-authority/certificate-authority-service";
import { certificateTemplateDALFactory } from "@app/services/certificate-template/certificate-template-dal";
import { certificateTemplateEstConfigDALFactory } from "@app/services/certificate-template/certificate-template-est-config-dal";
import { certificateTemplateServiceFactory } from "@app/services/certificate-template/certificate-template-service";
import { cmekServiceFactory } from "@app/services/cmek/cmek-service";
import { externalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { externalGroupOrgRoleMappingServiceFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-service";
import { externalMigrationQueueFactory } from "@app/services/external-migration/external-migration-queue";
import { externalMigrationServiceFactory } from "@app/services/external-migration/external-migration-service";
import { groupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { groupProjectMembershipRoleDALFactory } from "@app/services/group-project/group-project-membership-role-dal";
import { groupProjectServiceFactory } from "@app/services/group-project/group-project-service";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { identityMetadataDALFactory } from "@app/services/identity/identity-metadata-dal";
import { identityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { identityServiceFactory } from "@app/services/identity/identity-service";
import { identityAccessTokenDALFactory } from "@app/services/identity-access-token/identity-access-token-dal";
import { identityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { identityAwsAuthDALFactory } from "@app/services/identity-aws-auth/identity-aws-auth-dal";
import { identityAwsAuthServiceFactory } from "@app/services/identity-aws-auth/identity-aws-auth-service";
import { identityAzureAuthDALFactory } from "@app/services/identity-azure-auth/identity-azure-auth-dal";
import { identityAzureAuthServiceFactory } from "@app/services/identity-azure-auth/identity-azure-auth-service";
import { identityGcpAuthDALFactory } from "@app/services/identity-gcp-auth/identity-gcp-auth-dal";
import { identityGcpAuthServiceFactory } from "@app/services/identity-gcp-auth/identity-gcp-auth-service";
import { identityJwtAuthDALFactory } from "@app/services/identity-jwt-auth/identity-jwt-auth-dal";
import { identityJwtAuthServiceFactory } from "@app/services/identity-jwt-auth/identity-jwt-auth-service";
import { identityKubernetesAuthDALFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-dal";
import { identityKubernetesAuthServiceFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-service";
import { identityLdapAuthDALFactory } from "@app/services/identity-ldap-auth/identity-ldap-auth-dal";
import { identityLdapAuthServiceFactory } from "@app/services/identity-ldap-auth/identity-ldap-auth-service";
import { identityOciAuthDALFactory } from "@app/services/identity-oci-auth/identity-oci-auth-dal";
import { identityOciAuthServiceFactory } from "@app/services/identity-oci-auth/identity-oci-auth-service";
import { identityOidcAuthDALFactory } from "@app/services/identity-oidc-auth/identity-oidc-auth-dal";
import { identityOidcAuthServiceFactory } from "@app/services/identity-oidc-auth/identity-oidc-auth-service";
import { identityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";
import { identityProjectMembershipRoleDALFactory } from "@app/services/identity-project/identity-project-membership-role-dal";
import { identityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { identityTokenAuthDALFactory } from "@app/services/identity-token-auth/identity-token-auth-dal";
import { identityTokenAuthServiceFactory } from "@app/services/identity-token-auth/identity-token-auth-service";
import { identityUaClientSecretDALFactory } from "@app/services/identity-ua/identity-ua-client-secret-dal";
import { identityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";
import { identityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { integrationDALFactory } from "@app/services/integration/integration-dal";
import { integrationServiceFactory } from "@app/services/integration/integration-service";
import { integrationAuthDALFactory } from "@app/services/integration-auth/integration-auth-dal";
import { integrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { microsoftTeamsIntegrationDALFactory } from "@app/services/microsoft-teams/microsoft-teams-integration-dal";
import { microsoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { projectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { incidentContactDALFactory } from "@app/services/org/incident-contacts-dal";
import { orgBotDALFactory } from "@app/services/org/org-bot-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { orgRoleDALFactory } from "@app/services/org/org-role-dal";
import { orgRoleServiceFactory } from "@app/services/org/org-role-service";
import { orgServiceFactory } from "@app/services/org/org-service";
import { orgAdminServiceFactory } from "@app/services/org-admin/org-admin-service";
import { orgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { dailyExpiringPkiItemAlertQueueServiceFactory } from "@app/services/pki-alert/expiring-pki-item-alert-queue";
import { pkiAlertDALFactory } from "@app/services/pki-alert/pki-alert-dal";
import { pkiAlertServiceFactory } from "@app/services/pki-alert/pki-alert-service";
import { pkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { pkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { pkiCollectionServiceFactory } from "@app/services/pki-collection/pki-collection-service";
import { pkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { pkiSubscriberServiceFactory } from "@app/services/pki-subscriber/pki-subscriber-service";
import { projectDALFactory } from "@app/services/project/project-dal";
import { projectQueueFactory } from "@app/services/project/project-queue";
import { projectServiceFactory } from "@app/services/project/project-service";
import { projectSshConfigDALFactory } from "@app/services/project/project-ssh-config-dal";
import { projectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { projectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { projectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { projectEnvServiceFactory } from "@app/services/project-env/project-env-service";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { projectKeyServiceFactory } from "@app/services/project-key/project-key-service";
import { projectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { projectMembershipServiceFactory } from "@app/services/project-membership/project-membership-service";
import { projectUserMembershipRoleDALFactory } from "@app/services/project-membership/project-user-membership-role-dal";
import { projectRoleDALFactory } from "@app/services/project-role/project-role-dal";
import { projectRoleServiceFactory } from "@app/services/project-role/project-role-service";
import { dailyResourceCleanUpQueueServiceFactory } from "@app/services/resource-cleanup/resource-cleanup-queue";
import { resourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { secretDALFactory } from "@app/services/secret/secret-dal";
import { secretQueueFactory } from "@app/services/secret/secret-queue";
import { secretServiceFactory } from "@app/services/secret/secret-service";
import { secretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { secretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { secretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { secretBlindIndexServiceFactory } from "@app/services/secret-blind-index/secret-blind-index-service";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { secretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { secretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { secretImportServiceFactory } from "@app/services/secret-import/secret-import-service";
import { secretReminderRecipientsDALFactory } from "@app/services/secret-reminder-recipients/secret-reminder-recipients-dal";
import { secretSharingDALFactory } from "@app/services/secret-sharing/secret-sharing-dal";
import { secretSharingServiceFactory } from "@app/services/secret-sharing/secret-sharing-service";
import { secretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";
import { secretSyncQueueFactory } from "@app/services/secret-sync/secret-sync-queue";
import { secretSyncServiceFactory } from "@app/services/secret-sync/secret-sync-service";
import { secretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { secretTagServiceFactory } from "@app/services/secret-tag/secret-tag-service";
import { secretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { secretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";
import { secretVersionV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { secretVersionV2TagBridgeDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { serviceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import { projectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { slackIntegrationDALFactory } from "@app/services/slack/slack-integration-dal";
import { slackServiceFactory } from "@app/services/slack/slack-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { invalidateCacheQueueFactory } from "@app/services/super-admin/invalidate-cache-queue";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { getServerCfg, superAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { telemetryDALFactory } from "@app/services/telemetry/telemetry-dal";
import { telemetryQueueServiceFactory } from "@app/services/telemetry/telemetry-queue";
import { telemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { totpConfigDALFactory } from "@app/services/totp/totp-config-dal";
import { totpServiceFactory } from "@app/services/totp/totp-service";
import { userDALFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";
import { userAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { userEngagementServiceFactory } from "@app/services/user-engagement/user-engagement-service";
import { webhookDALFactory } from "@app/services/webhook/webhook-dal";
import { webhookServiceFactory } from "@app/services/webhook/webhook-service";
import { workflowIntegrationDALFactory } from "@app/services/workflow-integration/workflow-integration-dal";
import { workflowIntegrationServiceFactory } from "@app/services/workflow-integration/workflow-integration-service";

import { injectAuditLogInfo } from "../plugins/audit-log";
import { injectAssumePrivilege } from "../plugins/auth/inject-assume-privilege";
import { injectIdentity } from "../plugins/auth/inject-identity";
import { injectPermission } from "../plugins/auth/inject-permission";
import { injectRateLimits } from "../plugins/inject-rate-limits";
import { registerSecretScannerGhApp } from "../plugins/secret-scanner";
import { registerV1Routes } from "./v1";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

export const registerRoutes = async (
  server: FastifyZodProvider,
  {
    auditLogDb,
    db,
    hsmModule,
    smtp: smtpService,
    queue: queueService,
    keyStore,
    envConfig
  }: {
    auditLogDb?: Knex;
    db: Knex;
    hsmModule: HsmModule;
    smtp: TSmtpService;
    queue: TQueueServiceFactory;
    keyStore: TKeyStoreFactory;
    envConfig: TEnvConfig;
  }
) => {
  const appCfg = getConfig();
  await server.register(registerSecretScannerGhApp, { prefix: "/ss-webhook" });

  // db layers
  const userDAL = userDALFactory(db);
  const userAliasDAL = userAliasDALFactory(db);
  const authDAL = authDALFactory(db);
  const authTokenDAL = tokenDALFactory(db);
  const orgDAL = orgDALFactory(db);
  const orgMembershipDAL = orgMembershipDALFactory(db);
  const orgBotDAL = orgBotDALFactory(db);
  const incidentContactDAL = incidentContactDALFactory(db);
  const orgRoleDAL = orgRoleDALFactory(db);
  const superAdminDAL = superAdminDALFactory(db);
  const rateLimitDAL = rateLimitDALFactory(db);
  const apiKeyDAL = apiKeyDALFactory(db);

  const projectDAL = projectDALFactory(db);
  const projectSshConfigDAL = projectSshConfigDALFactory(db);
  const projectMembershipDAL = projectMembershipDALFactory(db);
  const projectUserAdditionalPrivilegeDAL = projectUserAdditionalPrivilegeDALFactory(db);
  const projectUserMembershipRoleDAL = projectUserMembershipRoleDALFactory(db);
  const projectRoleDAL = projectRoleDALFactory(db);
  const projectEnvDAL = projectEnvDALFactory(db);
  const projectKeyDAL = projectKeyDALFactory(db);
  const projectBotDAL = projectBotDALFactory(db);

  const secretDAL = secretDALFactory(db);
  const secretTagDAL = secretTagDALFactory(db);
  const folderDAL = secretFolderDALFactory(db);
  const folderVersionDAL = secretFolderVersionDALFactory(db);
  const secretImportDAL = secretImportDALFactory(db);
  const secretVersionDAL = secretVersionDALFactory(db);
  const secretVersionTagDAL = secretVersionTagDALFactory(db);
  const secretBlindIndexDAL = secretBlindIndexDALFactory(db);

  const secretV2BridgeDAL = secretV2BridgeDALFactory({ db, keyStore });
  const secretVersionV2BridgeDAL = secretVersionV2BridgeDALFactory(db);
  const secretVersionTagV2BridgeDAL = secretVersionV2TagBridgeDALFactory(db);

  const integrationDAL = integrationDALFactory(db);
  const integrationAuthDAL = integrationAuthDALFactory(db);
  const webhookDAL = webhookDALFactory(db);
  const serviceTokenDAL = serviceTokenDALFactory(db);

  const identityDAL = identityDALFactory(db);
  const identityMetadataDAL = identityMetadataDALFactory(db);
  const identityAccessTokenDAL = identityAccessTokenDALFactory(db);
  const identityOrgMembershipDAL = identityOrgDALFactory(db);
  const identityProjectDAL = identityProjectDALFactory(db);
  const identityProjectMembershipRoleDAL = identityProjectMembershipRoleDALFactory(db);
  const identityProjectAdditionalPrivilegeDAL = identityProjectAdditionalPrivilegeDALFactory(db);

  const identityTokenAuthDAL = identityTokenAuthDALFactory(db);
  const identityUaDAL = identityUaDALFactory(db);
  const identityKubernetesAuthDAL = identityKubernetesAuthDALFactory(db);
  const identityUaClientSecretDAL = identityUaClientSecretDALFactory(db);
  const identityAwsAuthDAL = identityAwsAuthDALFactory(db);
  const identityGcpAuthDAL = identityGcpAuthDALFactory(db);
  const identityOciAuthDAL = identityOciAuthDALFactory(db);
  const identityOidcAuthDAL = identityOidcAuthDALFactory(db);
  const identityJwtAuthDAL = identityJwtAuthDALFactory(db);
  const identityAzureAuthDAL = identityAzureAuthDALFactory(db);
  const identityLdapAuthDAL = identityLdapAuthDALFactory(db);

  const auditLogDAL = auditLogDALFactory(auditLogDb ?? db);
  const auditLogStreamDAL = auditLogStreamDALFactory(db);
  const trustedIpDAL = trustedIpDALFactory(db);
  const telemetryDAL = telemetryDALFactory(db);
  const appConnectionDAL = appConnectionDALFactory(db);
  const secretSyncDAL = secretSyncDALFactory(db, folderDAL);

  // ee db layer ops
  const permissionDAL = permissionDALFactory(db);
  const samlConfigDAL = samlConfigDALFactory(db);
  const scimDAL = scimDALFactory(db);
  const ldapConfigDAL = ldapConfigDALFactory(db);
  const ldapGroupMapDAL = ldapGroupMapDALFactory(db);

  const oidcConfigDAL = oidcConfigDALFactory(db);
  const accessApprovalPolicyDAL = accessApprovalPolicyDALFactory(db);
  const accessApprovalRequestDAL = accessApprovalRequestDALFactory(db);
  const accessApprovalPolicyApproverDAL = accessApprovalPolicyApproverDALFactory(db);
  const accessApprovalRequestReviewerDAL = accessApprovalRequestReviewerDALFactory(db);

  const sapApproverDAL = secretApprovalPolicyApproverDALFactory(db);
  const secretApprovalPolicyDAL = secretApprovalPolicyDALFactory(db);
  const secretApprovalRequestDAL = secretApprovalRequestDALFactory(db);
  const secretApprovalRequestReviewerDAL = secretApprovalRequestReviewerDALFactory(db);
  const secretApprovalRequestSecretDAL = secretApprovalRequestSecretDALFactory(db);

  const secretRotationDAL = secretRotationDALFactory(db);
  const snapshotDAL = snapshotDALFactory(db);
  const snapshotSecretDAL = snapshotSecretDALFactory(db);
  const snapshotSecretV2BridgeDAL = snapshotSecretV2DALFactory(db);
  const snapshotFolderDAL = snapshotFolderDALFactory(db);

  const gitAppInstallSessionDAL = gitAppInstallSessionDALFactory(db);
  const gitAppOrgDAL = gitAppDALFactory(db);
  const groupDAL = groupDALFactory(db);
  const groupProjectDAL = groupProjectDALFactory(db);
  const groupProjectMembershipRoleDAL = groupProjectMembershipRoleDALFactory(db);
  const userGroupMembershipDAL = userGroupMembershipDALFactory(db);
  const secretScanningDAL = secretScanningDALFactory(db);
  const secretSharingDAL = secretSharingDALFactory(db);
  const licenseDAL = licenseDALFactory(db);
  const dynamicSecretDAL = dynamicSecretDALFactory(db);
  const dynamicSecretLeaseDAL = dynamicSecretLeaseDALFactory(db);

  const sshCertificateDAL = sshCertificateDALFactory(db);
  const sshCertificateBodyDAL = sshCertificateBodyDALFactory(db);
  const sshCertificateAuthorityDAL = sshCertificateAuthorityDALFactory(db);
  const sshCertificateAuthoritySecretDAL = sshCertificateAuthoritySecretDALFactory(db);
  const sshCertificateTemplateDAL = sshCertificateTemplateDALFactory(db);
  const sshHostDAL = sshHostDALFactory(db);
  const sshHostLoginUserDAL = sshHostLoginUserDALFactory(db);
  const sshHostLoginUserMappingDAL = sshHostLoginUserMappingDALFactory(db);
  const sshHostGroupDAL = sshHostGroupDALFactory(db);
  const sshHostGroupMembershipDAL = sshHostGroupMembershipDALFactory(db);

  const kmsDAL = kmskeyDALFactory(db);
  const internalKmsDAL = internalKmsDALFactory(db);
  const externalKmsDAL = externalKmsDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);

  const slackIntegrationDAL = slackIntegrationDALFactory(db);
  const projectSlackConfigDAL = projectSlackConfigDALFactory(db);
  const workflowIntegrationDAL = workflowIntegrationDALFactory(db);
  const totpConfigDAL = totpConfigDALFactory(db);

  const externalGroupOrgRoleMappingDAL = externalGroupOrgRoleMappingDALFactory(db);

  const projectTemplateDAL = projectTemplateDALFactory(db);
  const resourceMetadataDAL = resourceMetadataDALFactory(db);
  const kmipClientDAL = kmipClientDALFactory(db);
  const kmipClientCertificateDAL = kmipClientCertificateDALFactory(db);
  const kmipOrgConfigDAL = kmipOrgConfigDALFactory(db);
  const kmipOrgServerCertificateDAL = kmipOrgServerCertificateDALFactory(db);

  const orgGatewayConfigDAL = orgGatewayConfigDALFactory(db);
  const gatewayDAL = gatewayDALFactory(db);
  const secretReminderRecipientsDAL = secretReminderRecipientsDALFactory(db);
  const githubOrgSyncDAL = githubOrgSyncDALFactory(db);

  const secretRotationV2DAL = secretRotationV2DALFactory(db, folderDAL);
  const microsoftTeamsIntegrationDAL = microsoftTeamsIntegrationDALFactory(db);
  const projectMicrosoftTeamsConfigDAL = projectMicrosoftTeamsConfigDALFactory(db);

  const permissionService = permissionServiceFactory({
    permissionDAL,
    orgRoleDAL,
    projectRoleDAL,
    serviceTokenDAL,
    projectDAL
  });
  const assumePrivilegeService = assumePrivilegeServiceFactory({
    projectDAL,
    permissionService
  });

  const licenseService = licenseServiceFactory({
    permissionService,
    orgDAL,
    licenseDAL,
    keyStore,
    identityOrgMembershipDAL,
    projectDAL
  });

  const hsmService = hsmServiceFactory({
    hsmModule,
    envConfig
  });

  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    keyStore,
    kmsDAL,
    internalKmsDAL,
    orgDAL,
    projectDAL,
    hsmService,
    envConfig
  });

  const externalKmsService = externalKmsServiceFactory({
    kmsDAL,
    kmsService,
    permissionService,
    externalKmsDAL,
    licenseService
  });

  const trustedIpService = trustedIpServiceFactory({
    licenseService,
    projectDAL,
    trustedIpDAL,
    permissionService
  });

  const auditLogQueue = await auditLogQueueServiceFactory({
    auditLogDAL,
    queueService,
    projectDAL,
    licenseService,
    auditLogStreamDAL
  });

  const auditLogService = auditLogServiceFactory({ auditLogDAL, permissionService, auditLogQueue });
  const auditLogStreamService = auditLogStreamServiceFactory({
    licenseService,
    permissionService,
    auditLogStreamDAL
  });
  const secretApprovalPolicyService = secretApprovalPolicyServiceFactory({
    projectEnvDAL,
    secretApprovalPolicyApproverDAL: sapApproverDAL,
    permissionService,
    secretApprovalPolicyDAL,
    licenseService,
    userDAL,
    secretApprovalRequestDAL
  });
  const tokenService = tokenServiceFactory({ tokenDAL: authTokenDAL, userDAL, orgMembershipDAL });

  const samlService = samlConfigServiceFactory({
    identityMetadataDAL,
    permissionService,
    orgDAL,
    orgMembershipDAL,
    userDAL,
    userAliasDAL,
    samlConfigDAL,
    licenseService,
    tokenService,
    smtpService,
    kmsService
  });
  const groupService = groupServiceFactory({
    userDAL,
    groupDAL,
    groupProjectDAL,
    orgDAL,
    userGroupMembershipDAL,
    projectDAL,
    projectBotDAL,
    projectKeyDAL,
    permissionService,
    licenseService,
    oidcConfigDAL
  });
  const groupProjectService = groupProjectServiceFactory({
    groupDAL,
    groupProjectDAL,
    groupProjectMembershipRoleDAL,
    userGroupMembershipDAL,
    projectDAL,
    projectKeyDAL,
    projectBotDAL,
    projectRoleDAL,
    permissionService
  });
  const scimService = scimServiceFactory({
    licenseService,
    scimDAL,
    userDAL,
    userAliasDAL,
    orgDAL,
    orgMembershipDAL,
    projectDAL,
    projectUserAdditionalPrivilegeDAL,
    projectMembershipDAL,
    groupDAL,
    groupProjectDAL,
    userGroupMembershipDAL,
    projectKeyDAL,
    projectBotDAL,
    permissionService,
    smtpService,
    externalGroupOrgRoleMappingDAL
  });

  const githubOrgSyncConfigService = githubOrgSyncServiceFactory({
    licenseService,
    githubOrgSyncDAL,
    kmsService,
    permissionService,
    groupDAL,
    userGroupMembershipDAL
  });

  const ldapService = ldapConfigServiceFactory({
    ldapConfigDAL,
    ldapGroupMapDAL,
    orgDAL,
    orgMembershipDAL,
    groupDAL,
    groupProjectDAL,
    projectKeyDAL,
    projectDAL,
    projectBotDAL,
    userGroupMembershipDAL,
    userDAL,
    userAliasDAL,
    permissionService,
    licenseService,
    tokenService,
    smtpService,
    kmsService
  });

  const telemetryService = telemetryServiceFactory({
    keyStore,
    licenseService
  });
  const telemetryQueue = telemetryQueueServiceFactory({
    keyStore,
    telemetryDAL,
    queueService
  });

  const invalidateCacheQueue = invalidateCacheQueueFactory({
    keyStore,
    queueService
  });

  const userService = userServiceFactory({
    userDAL,
    orgMembershipDAL,
    tokenService,
    permissionService,
    groupProjectDAL,
    smtpService,
    projectMembershipDAL
  });

  const totpService = totpServiceFactory({
    totpConfigDAL,
    userDAL,
    kmsService
  });

  const loginService = authLoginServiceFactory({
    userDAL,
    smtpService,
    tokenService,
    orgDAL,
    totpService,
    orgMembershipDAL,
    auditLogService
  });
  const passwordService = authPaswordServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL,
    totpConfigDAL
  });

  const projectBotService = projectBotServiceFactory({ permissionService, projectBotDAL, projectDAL });

  const orgService = orgServiceFactory({
    userAliasDAL,
    queueService,
    identityMetadataDAL,
    secretDAL,
    secretV2BridgeDAL,
    folderDAL,
    licenseService,
    samlConfigDAL,
    orgRoleDAL,
    permissionService,
    orgDAL,
    projectBotDAL,
    incidentContactDAL,
    tokenService,
    projectUserAdditionalPrivilegeDAL,
    projectUserMembershipRoleDAL,
    projectRoleDAL,
    projectDAL,
    projectMembershipDAL,
    orgMembershipDAL,
    projectKeyDAL,
    smtpService,
    userDAL,
    groupDAL,
    orgBotDAL,
    oidcConfigDAL,
    loginService,
    projectBotService
  });
  const signupService = authSignupServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL,
    userGroupMembershipDAL,
    projectKeyDAL,
    projectDAL,
    projectBotDAL,
    groupProjectDAL,
    projectMembershipDAL,
    projectUserMembershipRoleDAL,
    orgDAL,
    orgService,
    licenseService
  });
  const orgRoleService = orgRoleServiceFactory({
    permissionService,
    orgRoleDAL,
    orgDAL,
    externalGroupOrgRoleMappingDAL
  });

  const microsoftTeamsService = microsoftTeamsServiceFactory({
    microsoftTeamsIntegrationDAL,
    permissionService,
    workflowIntegrationDAL,
    kmsService,
    serverCfgDAL: superAdminDAL
  });

  const superAdminService = superAdminServiceFactory({
    userDAL,
    identityDAL,
    userAliasDAL,
    identityTokenAuthDAL,
    identityAccessTokenDAL,
    identityOrgMembershipDAL,
    authService: loginService,
    serverCfgDAL: superAdminDAL,
    kmsRootConfigDAL,
    orgService,
    keyStore,
    licenseService,
    kmsService,
    microsoftTeamsService,
    invalidateCacheQueue
  });

  const orgAdminService = orgAdminServiceFactory({
    smtpService,
    projectDAL,
    permissionService,
    projectUserMembershipRoleDAL,
    userDAL,
    projectBotDAL,
    projectKeyDAL,
    projectMembershipDAL
  });

  const rateLimitService = rateLimitServiceFactory({
    rateLimitDAL,
    licenseService
  });
  const apiKeyService = apiKeyServiceFactory({ apiKeyDAL, userDAL });

  const secretScanningQueue = secretScanningQueueFactory({
    telemetryService,
    smtpService,
    secretScanningDAL,
    queueService,
    orgMembershipDAL: orgDAL
  });
  const secretScanningService = secretScanningServiceFactory({
    permissionService,
    gitAppOrgDAL,
    gitAppInstallSessionDAL,
    secretScanningDAL,
    secretScanningQueue
  });

  const projectMembershipService = projectMembershipServiceFactory({
    projectMembershipDAL,
    projectUserMembershipRoleDAL,
    projectDAL,
    permissionService,
    projectBotDAL,
    orgDAL,
    userDAL,
    projectUserAdditionalPrivilegeDAL,
    userGroupMembershipDAL,
    smtpService,
    projectKeyDAL,
    projectRoleDAL,
    groupProjectDAL,
    secretReminderRecipientsDAL,
    licenseService
  });
  const projectUserAdditionalPrivilegeService = projectUserAdditionalPrivilegeServiceFactory({
    permissionService,
    projectMembershipDAL,
    projectUserAdditionalPrivilegeDAL
  });
  const projectKeyService = projectKeyServiceFactory({
    permissionService,
    projectKeyDAL,
    projectMembershipDAL
  });

  const projectQueueService = projectQueueFactory({
    queueService,
    secretDAL,
    folderDAL,
    projectDAL,
    orgDAL,
    integrationAuthDAL,
    orgService,
    projectEnvDAL,
    userDAL,
    secretVersionDAL,
    projectKeyDAL,
    projectBotDAL,
    projectMembershipDAL,
    secretApprovalRequestDAL,
    secretApprovalSecretDAL: secretApprovalRequestSecretDAL,
    projectUserMembershipRoleDAL
  });

  const certificateAuthorityDAL = certificateAuthorityDALFactory(db);
  const certificateAuthorityCertDAL = certificateAuthorityCertDALFactory(db);
  const certificateAuthoritySecretDAL = certificateAuthoritySecretDALFactory(db);
  const certificateAuthorityCrlDAL = certificateAuthorityCrlDALFactory(db);
  const certificateTemplateDAL = certificateTemplateDALFactory(db);
  const certificateTemplateEstConfigDAL = certificateTemplateEstConfigDALFactory(db);

  const certificateDAL = certificateDALFactory(db);
  const certificateBodyDAL = certificateBodyDALFactory(db);
  const certificateSecretDAL = certificateSecretDALFactory(db);

  const pkiAlertDAL = pkiAlertDALFactory(db);
  const pkiCollectionDAL = pkiCollectionDALFactory(db);
  const pkiCollectionItemDAL = pkiCollectionItemDALFactory(db);
  const pkiSubscriberDAL = pkiSubscriberDALFactory(db);

  const certificateService = certificateServiceFactory({
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthorityCrlDAL,
    certificateAuthoritySecretDAL,
    projectDAL,
    kmsService,
    permissionService
  });

  const certificateAuthorityQueue = certificateAuthorityQueueFactory({
    certificateAuthorityCrlDAL,
    certificateAuthorityDAL,
    certificateAuthoritySecretDAL,
    certificateDAL,
    projectDAL,
    kmsService,
    queueService
  });

  const sshCertificateAuthorityService = sshCertificateAuthorityServiceFactory({
    sshCertificateAuthorityDAL,
    sshCertificateAuthoritySecretDAL,
    sshCertificateTemplateDAL,
    sshCertificateDAL,
    sshCertificateBodyDAL,
    kmsService,
    permissionService
  });

  const sshCertificateTemplateService = sshCertificateTemplateServiceFactory({
    sshCertificateTemplateDAL,
    sshCertificateAuthorityDAL,
    permissionService
  });

  const sshHostService = sshHostServiceFactory({
    userDAL,
    groupDAL,
    userGroupMembershipDAL,
    projectDAL,
    projectSshConfigDAL,
    sshCertificateAuthorityDAL,
    sshCertificateAuthoritySecretDAL,
    sshCertificateDAL,
    sshCertificateBodyDAL,
    sshHostDAL,
    sshHostLoginUserDAL,
    sshHostLoginUserMappingDAL,
    permissionService,
    kmsService
  });

  const sshHostGroupService = sshHostGroupServiceFactory({
    projectDAL,
    sshHostDAL,
    sshHostGroupDAL,
    sshHostGroupMembershipDAL,
    sshHostLoginUserDAL,
    sshHostLoginUserMappingDAL,
    userDAL,
    permissionService,
    licenseService,
    groupDAL
  });

  const certificateAuthorityService = certificateAuthorityServiceFactory({
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthoritySecretDAL,
    certificateAuthorityCrlDAL,
    certificateTemplateDAL,
    certificateAuthorityQueue,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    pkiCollectionDAL,
    pkiCollectionItemDAL,
    projectDAL,
    kmsService,
    permissionService
  });

  const certificateAuthorityCrlService = certificateAuthorityCrlServiceFactory({
    certificateAuthorityDAL,
    certificateAuthorityCrlDAL,
    projectDAL,
    kmsService,
    permissionService
    // licenseService
  });

  const certificateTemplateService = certificateTemplateServiceFactory({
    certificateTemplateDAL,
    certificateTemplateEstConfigDAL,
    certificateAuthorityDAL,
    permissionService,
    kmsService,
    projectDAL,
    licenseService
  });

  const certificateEstService = certificateEstServiceFactory({
    certificateAuthorityService,
    certificateTemplateService,
    certificateTemplateDAL,
    certificateAuthorityCertDAL,
    certificateAuthorityDAL,
    projectDAL,
    kmsService,
    licenseService
  });

  const pkiAlertService = pkiAlertServiceFactory({
    pkiAlertDAL,
    pkiCollectionDAL,
    permissionService,
    smtpService,
    projectDAL
  });

  const pkiCollectionService = pkiCollectionServiceFactory({
    pkiCollectionDAL,
    pkiCollectionItemDAL,
    certificateAuthorityDAL,
    certificateDAL,
    permissionService,
    projectDAL
  });

  const pkiSubscriberService = pkiSubscriberServiceFactory({
    pkiSubscriberDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthoritySecretDAL,
    certificateAuthorityCrlDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService,
    permissionService
  });

  const projectTemplateService = projectTemplateServiceFactory({
    licenseService,
    permissionService,
    projectTemplateDAL
  });

  const integrationAuthService = integrationAuthServiceFactory({
    integrationAuthDAL,
    integrationDAL,
    permissionService,
    projectBotService,
    kmsService
  });

  const secretSyncQueue = secretSyncQueueFactory({
    queueService,
    secretSyncDAL,
    folderDAL,
    secretImportDAL,
    secretV2BridgeDAL,
    kmsService,
    keyStore,
    auditLogService,
    smtpService,
    projectDAL,
    projectMembershipDAL,
    projectBotDAL,
    secretDAL,
    secretBlindIndexDAL,
    secretVersionDAL,
    secretTagDAL,
    secretVersionTagDAL,
    secretVersionV2BridgeDAL,
    secretVersionTagV2BridgeDAL,
    resourceMetadataDAL,
    appConnectionDAL
  });

  const secretQueueService = secretQueueFactory({
    keyStore,
    queueService,
    secretDAL,
    folderDAL,
    integrationAuthService,
    projectBotService,
    integrationDAL,
    secretImportDAL,
    projectEnvDAL,
    webhookDAL,
    orgDAL,
    auditLogService,
    userDAL,
    projectMembershipDAL,
    smtpService,
    projectDAL,
    projectBotDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    kmsService,
    secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    secretVersionTagV2BridgeDAL,
    secretRotationDAL,
    integrationAuthDAL,
    snapshotDAL,
    snapshotSecretV2BridgeDAL,
    secretApprovalRequestDAL,
    projectKeyDAL,
    projectUserMembershipRoleDAL,
    secretReminderRecipientsDAL,
    orgService,
    resourceMetadataDAL,
    secretSyncQueue
  });

  const projectService = projectServiceFactory({
    permissionService,
    projectDAL,
    projectSshConfigDAL,
    secretDAL,
    secretV2BridgeDAL,
    queueService,
    projectQueue: projectQueueService,
    projectBotService,
    identityProjectDAL,
    identityOrgMembershipDAL,
    projectKeyDAL,
    userDAL,
    projectEnvDAL,
    orgDAL,
    orgService,
    projectMembershipDAL,
    projectRoleDAL,
    folderDAL,
    licenseService,
    pkiSubscriberDAL,
    certificateAuthorityDAL,
    certificateDAL,
    pkiAlertDAL,
    pkiCollectionDAL,
    sshCertificateAuthorityDAL,
    sshCertificateAuthoritySecretDAL,
    sshCertificateDAL,
    sshCertificateTemplateDAL,
    sshHostDAL,
    sshHostGroupDAL,
    projectUserMembershipRoleDAL,
    identityProjectMembershipRoleDAL,
    keyStore,
    kmsService,
    projectBotDAL,
    certificateTemplateDAL,
    projectSlackConfigDAL,
    slackIntegrationDAL,
    projectMicrosoftTeamsConfigDAL,
    microsoftTeamsIntegrationDAL,
    projectTemplateService,
    groupProjectDAL,
    smtpService
  });

  const projectEnvService = projectEnvServiceFactory({
    permissionService,
    projectEnvDAL,
    keyStore,
    licenseService,
    projectDAL,
    folderDAL
  });

  const projectRoleService = projectRoleServiceFactory({
    permissionService,
    projectRoleDAL,
    projectUserMembershipRoleDAL,
    identityProjectMembershipRoleDAL,
    projectDAL,
    identityDAL,
    userDAL
  });

  const snapshotService = secretSnapshotServiceFactory({
    permissionService,
    licenseService,
    folderDAL,
    secretDAL,
    snapshotDAL,
    snapshotFolderDAL,
    snapshotSecretDAL,
    secretVersionDAL,
    folderVersionDAL,
    secretTagDAL,
    secretVersionTagDAL,
    projectBotService,
    kmsService,
    secretV2BridgeDAL,
    secretVersionV2BridgeDAL,
    snapshotSecretV2BridgeDAL,
    secretVersionV2TagBridgeDAL: secretVersionTagV2BridgeDAL
  });
  const webhookService = webhookServiceFactory({
    permissionService,
    webhookDAL,
    projectEnvDAL,
    projectDAL,
    kmsService
  });

  const secretTagService = secretTagServiceFactory({ secretTagDAL, permissionService });
  const folderService = secretFolderServiceFactory({
    permissionService,
    folderDAL,
    folderVersionDAL,
    projectEnvDAL,
    snapshotService,
    projectDAL
  });

  const secretImportService = secretImportServiceFactory({
    licenseService,
    projectBotService,
    projectEnvDAL,
    folderDAL,
    permissionService,
    secretImportDAL,
    projectDAL,
    secretDAL,
    secretQueueService,
    secretV2BridgeDAL,
    kmsService
  });
  const secretBlindIndexService = secretBlindIndexServiceFactory({
    permissionService,
    secretDAL,
    secretBlindIndexDAL
  });

  const secretV2BridgeService = secretV2BridgeServiceFactory({
    folderDAL,
    secretVersionDAL: secretVersionV2BridgeDAL,
    secretQueueService,
    secretDAL: secretV2BridgeDAL,
    permissionService,
    secretVersionTagDAL: secretVersionTagV2BridgeDAL,
    secretTagDAL,
    projectEnvDAL,
    secretImportDAL,
    secretApprovalRequestDAL,
    secretApprovalPolicyService,
    secretApprovalRequestSecretDAL,
    kmsService,
    snapshotService,
    resourceMetadataDAL,
    keyStore
  });

  const secretApprovalRequestService = secretApprovalRequestServiceFactory({
    permissionService,
    projectBotService,
    folderDAL,
    secretDAL,
    secretTagDAL,
    secretApprovalRequestSecretDAL,
    secretApprovalRequestReviewerDAL,
    projectDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretApprovalRequestDAL,
    snapshotService,
    secretVersionTagDAL,
    secretQueueService,
    kmsService,
    secretV2BridgeDAL,
    secretApprovalPolicyDAL,
    secretVersionV2BridgeDAL,
    secretVersionTagV2BridgeDAL,
    smtpService,
    projectEnvDAL,
    userDAL,
    licenseService,
    projectSlackConfigDAL,
    resourceMetadataDAL,
    projectMicrosoftTeamsConfigDAL,
    microsoftTeamsService
  });

  const secretService = secretServiceFactory({
    folderDAL,
    secretVersionDAL,
    secretVersionTagDAL,
    secretBlindIndexDAL,
    permissionService,
    projectDAL,
    secretDAL,
    secretTagDAL,
    snapshotService,
    secretQueueService,
    secretImportDAL,
    projectEnvDAL,
    projectBotService,
    secretApprovalPolicyService,
    secretApprovalRequestDAL,
    secretApprovalRequestSecretDAL,
    secretV2BridgeService,
    secretApprovalRequestService,
    licenseService
  });

  const secretSharingService = secretSharingServiceFactory({
    permissionService,
    secretSharingDAL,
    orgDAL,
    kmsService,
    smtpService,
    userDAL
  });

  const accessApprovalPolicyService = accessApprovalPolicyServiceFactory({
    accessApprovalPolicyDAL,
    accessApprovalPolicyApproverDAL,
    groupDAL,
    permissionService,
    projectEnvDAL,
    projectMembershipDAL,
    projectDAL,
    userDAL,
    accessApprovalRequestDAL,
    additionalPrivilegeDAL: projectUserAdditionalPrivilegeDAL,
    accessApprovalRequestReviewerDAL
  });

  const accessApprovalRequestService = accessApprovalRequestServiceFactory({
    projectDAL,
    permissionService,
    accessApprovalRequestReviewerDAL,
    additionalPrivilegeDAL: projectUserAdditionalPrivilegeDAL,
    projectMembershipDAL,
    accessApprovalPolicyDAL,
    accessApprovalRequestDAL,
    projectEnvDAL,
    userDAL,
    smtpService,
    accessApprovalPolicyApproverDAL,
    projectSlackConfigDAL,
    kmsService,
    groupDAL,
    microsoftTeamsService,
    projectMicrosoftTeamsConfigDAL
  });

  const secretReplicationService = secretReplicationServiceFactory({
    secretTagDAL,
    secretVersionTagDAL,
    secretDAL,
    secretVersionDAL,
    secretImportDAL,
    keyStore,
    queueService,
    folderDAL,
    secretApprovalPolicyService,
    secretApprovalRequestDAL,
    secretApprovalRequestSecretDAL,
    secretQueueService,
    projectBotService,
    kmsService,
    secretV2BridgeDAL,
    secretVersionV2TagBridgeDAL: secretVersionTagV2BridgeDAL,
    secretVersionV2BridgeDAL,
    resourceMetadataDAL
  });

  const secretRotationQueue = secretRotationQueueFactory({
    telemetryService,
    secretRotationDAL,
    queue: queueService,
    secretDAL,
    secretVersionDAL,
    projectBotService,
    secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    kmsService
  });

  const secretRotationService = secretRotationServiceFactory({
    permissionService,
    secretRotationDAL,
    secretRotationQueue,
    projectDAL,
    licenseService,
    secretDAL,
    folderDAL,
    projectBotService,
    secretV2BridgeDAL,
    kmsService
  });

  const integrationService = integrationServiceFactory({
    permissionService,
    folderDAL,
    integrationDAL,
    integrationAuthDAL,
    secretQueueService,
    integrationAuthService,
    projectBotService,
    secretV2BridgeDAL,
    secretImportDAL,
    secretDAL,
    kmsService
  });

  const accessTokenQueue = accessTokenQueueServiceFactory({
    keyStore,
    identityAccessTokenDAL,
    queueService,
    serviceTokenDAL
  });

  const serviceTokenService = serviceTokenServiceFactory({
    projectEnvDAL,
    serviceTokenDAL,
    userDAL,
    permissionService,
    projectDAL,
    accessTokenQueue,
    smtpService
  });

  const identityService = identityServiceFactory({
    permissionService,
    identityDAL,
    identityOrgMembershipDAL,
    identityProjectDAL,
    licenseService,
    identityMetadataDAL
  });

  const identityAccessTokenService = identityAccessTokenServiceFactory({
    identityAccessTokenDAL,
    identityOrgMembershipDAL,
    accessTokenQueue
  });

  const identityProjectService = identityProjectServiceFactory({
    permissionService,
    projectDAL,
    identityProjectDAL,
    identityOrgMembershipDAL,
    identityProjectMembershipRoleDAL,
    projectRoleDAL
  });
  const identityProjectAdditionalPrivilegeService = identityProjectAdditionalPrivilegeServiceFactory({
    projectDAL,
    identityProjectAdditionalPrivilegeDAL,
    permissionService,
    identityProjectDAL
  });

  const identityProjectAdditionalPrivilegeV2Service = identityProjectAdditionalPrivilegeV2ServiceFactory({
    projectDAL,
    identityProjectAdditionalPrivilegeDAL,
    permissionService,
    identityProjectDAL
  });

  const identityTokenAuthService = identityTokenAuthServiceFactory({
    identityTokenAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService
  });
  const identityUaService = identityUaServiceFactory({
    identityOrgMembershipDAL,
    permissionService,
    identityAccessTokenDAL,
    identityUaClientSecretDAL,
    identityUaDAL,
    licenseService
  });

  const gatewayService = gatewayServiceFactory({
    permissionService,
    gatewayDAL,
    kmsService,
    licenseService,
    orgGatewayConfigDAL,
    keyStore
  });

  const identityKubernetesAuthService = identityKubernetesAuthServiceFactory({
    identityKubernetesAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    gatewayService,
    gatewayDAL,
    kmsService
  });
  const identityGcpAuthService = identityGcpAuthServiceFactory({
    identityGcpAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService
  });

  const identityAwsAuthService = identityAwsAuthServiceFactory({
    identityAccessTokenDAL,
    identityAwsAuthDAL,
    identityOrgMembershipDAL,
    licenseService,
    permissionService
  });

  const identityAzureAuthService = identityAzureAuthServiceFactory({
    identityAzureAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService
  });

  const identityOciAuthService = identityOciAuthServiceFactory({
    identityAccessTokenDAL,
    identityOciAuthDAL,
    identityOrgMembershipDAL,
    licenseService,
    permissionService
  });

  const identityOidcAuthService = identityOidcAuthServiceFactory({
    identityOidcAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    kmsService
  });

  const identityJwtAuthService = identityJwtAuthServiceFactory({
    identityJwtAuthDAL,
    permissionService,
    identityAccessTokenDAL,
    identityOrgMembershipDAL,
    licenseService,
    kmsService
  });

  const identityLdapAuthService = identityLdapAuthServiceFactory({
    identityLdapAuthDAL,
    permissionService,
    kmsService,
    identityAccessTokenDAL,
    identityOrgMembershipDAL,
    licenseService,
    identityDAL
  });

  const dynamicSecretProviders = buildDynamicSecretProviders({
    gatewayService
  });
  const dynamicSecretQueueService = dynamicSecretLeaseQueueServiceFactory({
    queueService,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    dynamicSecretDAL,
    folderDAL,
    kmsService
  });
  const dynamicSecretService = dynamicSecretServiceFactory({
    projectDAL,
    dynamicSecretQueueService,
    dynamicSecretDAL,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    folderDAL,
    permissionService,
    licenseService,
    kmsService,
    gatewayDAL,
    resourceMetadataDAL
  });

  const dynamicSecretLeaseService = dynamicSecretLeaseServiceFactory({
    projectDAL,
    permissionService,
    dynamicSecretQueueService,
    dynamicSecretDAL,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    folderDAL,
    licenseService,
    kmsService
  });
  const dailyResourceCleanUp = dailyResourceCleanUpQueueServiceFactory({
    auditLogDAL,
    queueService,
    secretVersionDAL,
    secretDAL,
    secretFolderVersionDAL: folderVersionDAL,
    snapshotDAL,
    identityAccessTokenDAL,
    secretSharingDAL,
    secretVersionV2DAL: secretVersionV2BridgeDAL,
    identityUniversalAuthClientSecretDAL: identityUaClientSecretDAL,
    serviceTokenService
  });

  const dailyExpiringPkiItemAlert = dailyExpiringPkiItemAlertQueueServiceFactory({
    queueService,
    pkiAlertService
  });

  const oidcService = oidcConfigServiceFactory({
    orgDAL,
    orgMembershipDAL,
    userDAL,
    userAliasDAL,
    licenseService,
    tokenService,
    smtpService,
    kmsService,
    permissionService,
    oidcConfigDAL,
    projectBotDAL,
    projectKeyDAL,
    projectDAL,
    userGroupMembershipDAL,
    groupProjectDAL,
    groupDAL,
    auditLogService
  });

  const userEngagementService = userEngagementServiceFactory({
    userDAL,
    orgDAL
  });

  const slackService = slackServiceFactory({
    permissionService,
    kmsService,
    slackIntegrationDAL,
    workflowIntegrationDAL
  });

  const workflowIntegrationService = workflowIntegrationServiceFactory({
    permissionService,
    workflowIntegrationDAL
  });

  const cmekService = cmekServiceFactory({
    kmsDAL,
    kmsService,
    permissionService,
    projectDAL
  });

  const externalMigrationQueue = externalMigrationQueueFactory({
    projectEnvService,
    projectDAL,
    projectService,
    smtpService,
    kmsService,
    projectEnvDAL,
    secretVersionDAL: secretVersionV2BridgeDAL,
    secretTagDAL,
    secretVersionTagDAL: secretVersionTagV2BridgeDAL,
    folderDAL,
    secretDAL: secretV2BridgeDAL,
    queueService,
    secretV2BridgeService,
    resourceMetadataDAL
  });

  const migrationService = externalMigrationServiceFactory({
    externalMigrationQueue,
    userDAL,
    permissionService
  });

  const externalGroupOrgRoleMappingService = externalGroupOrgRoleMappingServiceFactory({
    permissionService,
    licenseService,
    orgRoleDAL,
    externalGroupOrgRoleMappingDAL
  });

  const appConnectionService = appConnectionServiceFactory({
    appConnectionDAL,
    permissionService,
    kmsService
  });

  const secretSyncService = secretSyncServiceFactory({
    secretSyncDAL,
    secretImportDAL,
    permissionService,
    appConnectionService,
    folderDAL,
    secretSyncQueue,
    projectBotService,
    keyStore
  });

  const kmipService = kmipServiceFactory({
    kmipClientDAL,
    permissionService,
    kmipClientCertificateDAL,
    kmipOrgConfigDAL,
    kmsService,
    kmipOrgServerCertificateDAL,
    licenseService
  });

  const kmipOperationService = kmipOperationServiceFactory({
    kmsService,
    kmsDAL,
    projectDAL,
    kmipClientDAL,
    permissionService
  });

  const secretRotationV2Service = secretRotationV2ServiceFactory({
    secretRotationV2DAL,
    permissionService,
    appConnectionService,
    folderDAL,
    projectBotService,
    licenseService,
    kmsService,
    auditLogService,
    secretV2BridgeDAL,
    secretTagDAL,
    secretVersionTagV2BridgeDAL,
    secretVersionV2BridgeDAL,
    keyStore,
    resourceMetadataDAL,
    snapshotService,
    secretQueueService,
    queueService,
    appConnectionDAL
  });

  await secretRotationV2QueueServiceFactory({
    secretRotationV2Service,
    secretRotationV2DAL,
    queueService,
    projectDAL,
    projectMembershipDAL,
    smtpService
  });

  await superAdminService.initServerCfg();

  // setup the communication with license key server
  await licenseService.init();

  // Start HSM service if it's configured/enabled.
  await hsmService.startService();

  await telemetryQueue.startTelemetryCheck();
  await dailyResourceCleanUp.startCleanUp();
  await dailyExpiringPkiItemAlert.startSendingAlerts();
  await kmsService.startService();
  await microsoftTeamsService.start();

  // inject all services
  server.decorate<FastifyZodProvider["services"]>("services", {
    login: loginService,
    password: passwordService,
    signup: signupService,
    user: userService,
    group: groupService,
    groupProject: groupProjectService,
    permission: permissionService,
    org: orgService,
    orgRole: orgRoleService,
    oidc: oidcService,
    apiKey: apiKeyService,
    authToken: tokenService,
    superAdmin: superAdminService,
    project: projectService,
    projectMembership: projectMembershipService,
    projectKey: projectKeyService,
    projectEnv: projectEnvService,
    projectRole: projectRoleService,
    secret: secretService,
    secretReplication: secretReplicationService,
    secretTag: secretTagService,
    rateLimit: rateLimitService,
    folder: folderService,
    secretImport: secretImportService,
    projectBot: projectBotService,
    integration: integrationService,
    integrationAuth: integrationAuthService,
    webhook: webhookService,
    serviceToken: serviceTokenService,
    identity: identityService,
    identityAccessToken: identityAccessTokenService,
    identityProject: identityProjectService,
    identityTokenAuth: identityTokenAuthService,
    identityUa: identityUaService,
    identityKubernetesAuth: identityKubernetesAuthService,
    identityGcpAuth: identityGcpAuthService,
    identityAwsAuth: identityAwsAuthService,
    identityAzureAuth: identityAzureAuthService,
    identityOciAuth: identityOciAuthService,
    identityOidcAuth: identityOidcAuthService,
    identityJwtAuth: identityJwtAuthService,
    identityLdapAuth: identityLdapAuthService,
    accessApprovalPolicy: accessApprovalPolicyService,
    accessApprovalRequest: accessApprovalRequestService,
    secretApprovalPolicy: secretApprovalPolicyService,
    secretApprovalRequest: secretApprovalRequestService,
    secretRotation: secretRotationService,
    dynamicSecret: dynamicSecretService,
    dynamicSecretLease: dynamicSecretLeaseService,
    snapshot: snapshotService,
    saml: samlService,
    ldap: ldapService,
    auditLog: auditLogService,
    auditLogStream: auditLogStreamService,
    certificate: certificateService,
    sshCertificateAuthority: sshCertificateAuthorityService,
    sshCertificateTemplate: sshCertificateTemplateService,
    sshHost: sshHostService,
    sshHostGroup: sshHostGroupService,
    certificateAuthority: certificateAuthorityService,
    certificateTemplate: certificateTemplateService,
    certificateAuthorityCrl: certificateAuthorityCrlService,
    certificateEst: certificateEstService,
    pkiAlert: pkiAlertService,
    pkiCollection: pkiCollectionService,
    pkiSubscriber: pkiSubscriberService,
    secretScanning: secretScanningService,
    license: licenseService,
    trustedIp: trustedIpService,
    scim: scimService,
    secretBlindIndex: secretBlindIndexService,
    telemetry: telemetryService,
    projectUserAdditionalPrivilege: projectUserAdditionalPrivilegeService,
    identityProjectAdditionalPrivilege: identityProjectAdditionalPrivilegeService,
    identityProjectAdditionalPrivilegeV2: identityProjectAdditionalPrivilegeV2Service,
    secretSharing: secretSharingService,
    userEngagement: userEngagementService,
    externalKms: externalKmsService,
    hsm: hsmService,
    cmek: cmekService,
    orgAdmin: orgAdminService,
    slack: slackService,
    workflowIntegration: workflowIntegrationService,
    migration: migrationService,
    externalGroupOrgRoleMapping: externalGroupOrgRoleMappingService,
    projectTemplate: projectTemplateService,
    totp: totpService,
    appConnection: appConnectionService,
    secretSync: secretSyncService,
    kmip: kmipService,
    kmipOperation: kmipOperationService,
    gateway: gatewayService,
    secretRotationV2: secretRotationV2Service,
    microsoftTeams: microsoftTeamsService,
    assumePrivileges: assumePrivilegeService,
    githubOrgSync: githubOrgSyncConfigService
  });

  const cronJobs: CronJob[] = [];
  if (appCfg.isProductionMode) {
    const rateLimitSyncJob = await rateLimitService.initializeBackgroundSync();
    if (rateLimitSyncJob) {
      cronJobs.push(rateLimitSyncJob);
    }
    const licenseSyncJob = await licenseService.initializeBackgroundSync();
    if (licenseSyncJob) {
      cronJobs.push(licenseSyncJob);
    }
    const microsoftTeamsSyncJob = await microsoftTeamsService.initializeBackgroundSync();
    if (microsoftTeamsSyncJob) {
      cronJobs.push(microsoftTeamsSyncJob);
    }
  }

  server.decorate<FastifyZodProvider["store"]>("store", {
    user: userDAL,
    kmipClient: kmipClientDAL
  });

  await server.register(injectIdentity, { userDAL, serviceTokenDAL });
  await server.register(injectAssumePrivilege);
  await server.register(injectPermission);
  await server.register(injectRateLimits);
  await server.register(injectAuditLogInfo);

  server.route({
    method: "GET",
    url: "/api/status",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          date: z.date(),
          message: z.string().optional(),
          emailConfigured: z.boolean().optional(),
          inviteOnlySignup: z.boolean().optional(),
          redisConfigured: z.boolean().optional(),
          secretScanningConfigured: z.boolean().optional(),
          samlDefaultOrgSlug: z.string().optional()
        })
      }
    },
    handler: async () => {
      const cfg = getConfig();
      const serverCfg = await getServerCfg();

      const meanLagMs = histogram.mean / 1e6;
      const maxLagMs = histogram.max / 1e6;
      const p99LagMs = histogram.percentile(99) / 1e6;

      logger.info(
        `Event loop stats - Mean: ${meanLagMs.toFixed(2)}ms, Max: ${maxLagMs.toFixed(2)}ms, p99: ${p99LagMs.toFixed(
          2
        )}ms`
      );

      logger.info(`Raw event loop stats: ${JSON.stringify(histogram, null, 2)}`);

      return {
        date: new Date(),
        message: "Ok",
        emailConfigured: cfg.isSmtpConfigured,
        inviteOnlySignup: Boolean(serverCfg.allowSignUp),
        redisConfigured: cfg.isRedisConfigured,
        secretScanningConfigured: cfg.isSecretScanningConfigured,
        samlDefaultOrgSlug: cfg.samlDefaultOrgSlug
      };
    }
  });

  // register special routes
  await server.register(registerCertificateEstRouter, { prefix: "/.well-known/est" });

  // register routes for v1
  await server.register(
    async (v1Server) => {
      await v1Server.register(registerV1EERoutes);
      await v1Server.register(registerV1Routes);
    },
    { prefix: "/api/v1" }
  );
  await server.register(
    async (v2Server) => {
      await v2Server.register(registerV2EERoutes);
      await v2Server.register(registerV2Routes);
    },
    { prefix: "/api/v2" }
  );
  await server.register(registerV3Routes, { prefix: "/api/v3" });

  server.addHook("onClose", async () => {
    cronJobs.forEach((job) => job.stop());
    await telemetryService.flushAll();
  });
};
