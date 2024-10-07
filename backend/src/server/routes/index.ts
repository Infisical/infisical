import { CronJob } from "cron";
// import { Redis } from "ioredis";
import { Knex } from "knex";
import { z } from "zod";

import { registerCertificateEstRouter } from "@app/ee/routes/est/certificate-est-router";
import { registerV1EERoutes } from "@app/ee/routes/v1";
import { accessApprovalPolicyApproverDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-approver-dal";
import { accessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { accessApprovalPolicyServiceFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-service";
import { accessApprovalRequestDALFactory } from "@app/ee/services/access-approval-request/access-approval-request-dal";
import { accessApprovalRequestReviewerDALFactory } from "@app/ee/services/access-approval-request/access-approval-request-reviewer-dal";
import { accessApprovalRequestServiceFactory } from "@app/ee/services/access-approval-request/access-approval-request-service";
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
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { groupServiceFactory } from "@app/ee/services/group/group-service";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { identityProjectAdditionalPrivilegeDALFactory } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-dal";
import { identityProjectAdditionalPrivilegeServiceFactory } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-service";
import { ldapConfigDALFactory } from "@app/ee/services/ldap-config/ldap-config-dal";
import { ldapConfigServiceFactory } from "@app/ee/services/ldap-config/ldap-config-service";
import { ldapGroupMapDALFactory } from "@app/ee/services/ldap-config/ldap-group-map-dal";
import { licenseDALFactory } from "@app/ee/services/license/license-dal";
import { licenseServiceFactory } from "@app/ee/services/license/license-service";
import { oidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { oidcConfigServiceFactory } from "@app/ee/services/oidc/oidc-config-service";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
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
import { trustedIpDALFactory } from "@app/ee/services/trusted-ip/trusted-ip-dal";
import { trustedIpServiceFactory } from "@app/ee/services/trusted-ip/trusted-ip-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { TQueueServiceFactory } from "@app/queue";
import { readLimit } from "@app/server/config/rateLimiter";
import { accessTokenQueueServiceFactory } from "@app/services/access-token-queue/access-token-queue";
import { apiKeyDALFactory } from "@app/services/api-key/api-key-dal";
import { apiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { authDALFactory } from "@app/services/auth/auth-dal";
import { authLoginServiceFactory } from "@app/services/auth/auth-login-service";
import { authPaswordServiceFactory } from "@app/services/auth/auth-password-service";
import { authSignupServiceFactory } from "@app/services/auth/auth-signup-service";
import { tokenDALFactory } from "@app/services/auth-token/auth-token-dal";
import { tokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { certificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { certificateDALFactory } from "@app/services/certificate/certificate-dal";
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
import { identityKubernetesAuthDALFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-dal";
import { identityKubernetesAuthServiceFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-service";
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
import { projectDALFactory } from "@app/services/project/project-dal";
import { projectQueueFactory } from "@app/services/project/project-queue";
import { projectServiceFactory } from "@app/services/project/project-service";
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
import { secretSharingDALFactory } from "@app/services/secret-sharing/secret-sharing-dal";
import { secretSharingServiceFactory } from "@app/services/secret-sharing/secret-sharing-service";
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
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { getServerCfg, superAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { telemetryDALFactory } from "@app/services/telemetry/telemetry-dal";
import { telemetryQueueServiceFactory } from "@app/services/telemetry/telemetry-queue";
import { telemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { userDALFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";
import { userAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { userEngagementServiceFactory } from "@app/services/user-engagement/user-engagement-service";
import { webhookDALFactory } from "@app/services/webhook/webhook-dal";
import { webhookServiceFactory } from "@app/services/webhook/webhook-service";
import { workflowIntegrationDALFactory } from "@app/services/workflow-integration/workflow-integration-dal";
import { workflowIntegrationServiceFactory } from "@app/services/workflow-integration/workflow-integration-service";

import { injectAuditLogInfo } from "../plugins/audit-log";
import { injectIdentity } from "../plugins/auth/inject-identity";
import { injectPermission } from "../plugins/auth/inject-permission";
import { injectRateLimits } from "../plugins/inject-rate-limits";
import { registerSecretScannerGhApp } from "../plugins/secret-scanner";
import { registerV1Routes } from "./v1";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";

export const registerRoutes = async (
  server: FastifyZodProvider,
  {
    db,
    smtp: smtpService,
    queue: queueService,
    keyStore
  }: { db: Knex; smtp: TSmtpService; queue: TQueueServiceFactory; keyStore: TKeyStoreFactory }
) => {
  const appCfg = getConfig();
  if (!appCfg.DISABLE_SECRET_SCANNING) {
    await server.register(registerSecretScannerGhApp, { prefix: "/ss-webhook" });
  }

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

  const secretV2BridgeDAL = secretV2BridgeDALFactory(db);
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
  const identityOidcAuthDAL = identityOidcAuthDALFactory(db);
  const identityAzureAuthDAL = identityAzureAuthDALFactory(db);

  const auditLogDAL = auditLogDALFactory(db);
  const auditLogStreamDAL = auditLogStreamDALFactory(db);
  const trustedIpDAL = trustedIpDALFactory(db);
  const telemetryDAL = telemetryDALFactory(db);

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

  const kmsDAL = kmskeyDALFactory(db);
  const internalKmsDAL = internalKmsDALFactory(db);
  const externalKmsDAL = externalKmsDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);

  const slackIntegrationDAL = slackIntegrationDALFactory(db);
  const projectSlackConfigDAL = projectSlackConfigDALFactory(db);
  const workflowIntegrationDAL = workflowIntegrationDALFactory(db);

  const permissionService = permissionServiceFactory({
    permissionDAL,
    orgRoleDAL,
    projectRoleDAL,
    serviceTokenDAL,
    projectDAL
  });
  const licenseService = licenseServiceFactory({ permissionService, orgDAL, licenseDAL, keyStore });
  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    keyStore,
    kmsDAL,
    internalKmsDAL,
    orgDAL,
    projectDAL
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

  const auditLogQueue = auditLogQueueServiceFactory({
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
    userDAL
  });
  const tokenService = tokenServiceFactory({ tokenDAL: authTokenDAL, userDAL, orgMembershipDAL });

  const samlService = samlConfigServiceFactory({
    identityMetadataDAL,
    permissionService,
    orgBotDAL,
    orgDAL,
    orgMembershipDAL,
    userDAL,
    userAliasDAL,
    samlConfigDAL,
    licenseService,
    tokenService,
    smtpService
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
    licenseService
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
    smtpService
  });

  const ldapService = ldapConfigServiceFactory({
    ldapConfigDAL,
    ldapGroupMapDAL,
    orgDAL,
    orgMembershipDAL,
    orgBotDAL,
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
    smtpService
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

  const userService = userServiceFactory({
    userDAL,
    userAliasDAL,
    orgMembershipDAL,
    tokenService,
    permissionService,
    groupProjectDAL,
    smtpService,
    projectMembershipDAL
  });

  const loginService = authLoginServiceFactory({ userDAL, smtpService, tokenService, orgDAL });
  const passwordService = authPaswordServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL
  });
  const orgService = orgServiceFactory({
    userAliasDAL,
    identityMetadataDAL,
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
    oidcConfigDAL
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
  const orgRoleService = orgRoleServiceFactory({ permissionService, orgRoleDAL, orgDAL });
  const superAdminService = superAdminServiceFactory({
    userDAL,
    authService: loginService,
    serverCfgDAL: superAdminDAL,
    orgService,
    keyStore,
    licenseService,
    kmsService
  });

  const orgAdminService = orgAdminServiceFactory({
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
  const projectBotService = projectBotServiceFactory({ permissionService, projectBotDAL, projectDAL });

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

  const pkiAlertDAL = pkiAlertDALFactory(db);
  const pkiCollectionDAL = pkiCollectionDALFactory(db);
  const pkiCollectionItemDAL = pkiCollectionItemDALFactory(db);

  const certificateService = certificateServiceFactory({
    certificateDAL,
    certificateBodyDAL,
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

  const certificateAuthorityService = certificateAuthorityServiceFactory({
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthoritySecretDAL,
    certificateAuthorityCrlDAL,
    certificateTemplateDAL,
    certificateAuthorityQueue,
    certificateDAL,
    certificateBodyDAL,
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
    smtpService
  });

  const pkiCollectionService = pkiCollectionServiceFactory({
    pkiCollectionDAL,
    pkiCollectionItemDAL,
    certificateAuthorityDAL,
    certificateDAL,
    permissionService
  });

  const projectService = projectServiceFactory({
    permissionService,
    projectDAL,
    projectQueue: projectQueueService,
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
    certificateAuthorityDAL,
    certificateDAL,
    pkiAlertDAL,
    pkiCollectionDAL,
    projectUserMembershipRoleDAL,
    identityProjectMembershipRoleDAL,
    keyStore,
    kmsService,
    projectBotDAL,
    certificateTemplateDAL,
    projectSlackConfigDAL,
    slackIntegrationDAL
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
    projectDAL
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
    projectDAL
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

  const integrationAuthService = integrationAuthServiceFactory({
    integrationAuthDAL,
    integrationDAL,
    permissionService,
    projectBotService,
    kmsService
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
    secretApprovalRequestDAL
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
    snapshotService
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
    projectSlackConfigDAL
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
    secretApprovalRequestService
  });

  const secretSharingService = secretSharingServiceFactory({
    permissionService,
    secretSharingDAL,
    orgDAL,
    kmsService
  });

  const accessApprovalPolicyService = accessApprovalPolicyServiceFactory({
    accessApprovalPolicyDAL,
    accessApprovalPolicyApproverDAL,
    groupDAL,
    permissionService,
    projectEnvDAL,
    projectMembershipDAL,
    projectDAL,
    userDAL
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
    groupDAL
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
    secretVersionV2BridgeDAL
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
    secretV2BridgeDAL
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
    accessTokenQueue
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
  const identityTokenAuthService = identityTokenAuthServiceFactory({
    identityTokenAuthDAL,
    identityDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService
  });
  const identityUaService = identityUaServiceFactory({
    identityOrgMembershipDAL,
    permissionService,
    identityDAL,
    identityAccessTokenDAL,
    identityUaClientSecretDAL,
    identityUaDAL,
    licenseService
  });
  const identityKubernetesAuthService = identityKubernetesAuthServiceFactory({
    identityKubernetesAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    identityDAL,
    orgBotDAL,
    permissionService,
    licenseService
  });
  const identityGcpAuthService = identityGcpAuthServiceFactory({
    identityGcpAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    identityDAL,
    permissionService,
    licenseService
  });

  const identityAwsAuthService = identityAwsAuthServiceFactory({
    identityAccessTokenDAL,
    identityAwsAuthDAL,
    identityOrgMembershipDAL,
    identityDAL,
    licenseService,
    permissionService
  });

  const identityAzureAuthService = identityAzureAuthServiceFactory({
    identityAzureAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    identityDAL,
    permissionService,
    licenseService
  });

  const identityOidcAuthService = identityOidcAuthServiceFactory({
    identityOidcAuthDAL,
    identityOrgMembershipDAL,
    identityAccessTokenDAL,
    identityDAL,
    permissionService,
    licenseService,
    orgBotDAL
  });

  const dynamicSecretProviders = buildDynamicSecretProviders();
  const dynamicSecretQueueService = dynamicSecretLeaseQueueServiceFactory({
    queueService,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    dynamicSecretDAL
  });
  const dynamicSecretService = dynamicSecretServiceFactory({
    projectDAL,
    dynamicSecretQueueService,
    dynamicSecretDAL,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    folderDAL,
    permissionService,
    licenseService
  });
  const dynamicSecretLeaseService = dynamicSecretLeaseServiceFactory({
    projectDAL,
    permissionService,
    dynamicSecretQueueService,
    dynamicSecretDAL,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    folderDAL,
    licenseService
  });
  const dailyResourceCleanUp = dailyResourceCleanUpQueueServiceFactory({
    auditLogDAL,
    queueService,
    secretVersionDAL,
    secretFolderVersionDAL: folderVersionDAL,
    snapshotDAL,
    identityAccessTokenDAL,
    secretSharingDAL,
    secretVersionV2DAL: secretVersionV2BridgeDAL,
    identityUniversalAuthClientSecretDAL: identityUaClientSecretDAL
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
    orgBotDAL,
    permissionService,
    oidcConfigDAL
  });

  const userEngagementService = userEngagementServiceFactory({
    userDAL
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
    permissionService
  });

  const migrationService = externalMigrationServiceFactory({
    projectService,
    orgService,
    projectEnvService,
    permissionService,
    secretService
  });

  await superAdminService.initServerCfg();
  //
  // setup the communication with license key server
  await licenseService.init();

  await telemetryQueue.startTelemetryCheck();
  await dailyResourceCleanUp.startCleanUp();
  await dailyExpiringPkiItemAlert.startSendingAlerts();
  await kmsService.startService();

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
    identityOidcAuth: identityOidcAuthService,
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
    certificateAuthority: certificateAuthorityService,
    certificateTemplate: certificateTemplateService,
    certificateAuthorityCrl: certificateAuthorityCrlService,
    certificateEst: certificateEstService,
    pkiAlert: pkiAlertService,
    pkiCollection: pkiCollectionService,
    secretScanning: secretScanningService,
    license: licenseService,
    trustedIp: trustedIpService,
    scim: scimService,
    secretBlindIndex: secretBlindIndexService,
    telemetry: telemetryService,
    projectUserAdditionalPrivilege: projectUserAdditionalPrivilegeService,
    identityProjectAdditionalPrivilege: identityProjectAdditionalPrivilegeService,
    secretSharing: secretSharingService,
    userEngagement: userEngagementService,
    externalKms: externalKmsService,
    cmek: cmekService,
    orgAdmin: orgAdminService,
    slack: slackService,
    workflowIntegration: workflowIntegrationService,
    migration: migrationService
  });

  const cronJobs: CronJob[] = [];
  if (appCfg.isProductionMode) {
    const rateLimitSyncJob = await rateLimitService.initializeBackgroundSync();
    if (rateLimitSyncJob) {
      cronJobs.push(rateLimitSyncJob);
    }
  }

  server.decorate<FastifyZodProvider["store"]>("store", {
    user: userDAL
  });

  await server.register(injectIdentity, { userDAL, serviceTokenDAL });
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

      // try {
      //   await db.raw("SELECT NOW()");
      // } catch (err) {
      //   logger.error("Health check: database connection failed", err);
      //   return reply.code(503).send({
      //     date: new Date(),
      //     message: "Service unavailable"
      //   });
      // }

      // if (cfg.isRedisConfigured) {
      //   const redis = new Redis(cfg.REDIS_URL);
      //   try {
      //     await redis.ping();
      //     redis.disconnect();
      //   } catch (err) {
      //     logger.error("Health check: redis connection failed", err);
      //     return reply.code(503).send({
      //       date: new Date(),
      //       message: "Service unavailable"
      //     });
      //   }
      // }

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
  await server.register(registerV2Routes, { prefix: "/api/v2" });
  await server.register(registerV3Routes, { prefix: "/api/v3" });

  server.addHook("onClose", async () => {
    cronJobs.forEach((job) => job.stop());
    await telemetryService.flushAll();
  });
};
