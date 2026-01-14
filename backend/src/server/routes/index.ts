import { registerBddNockRouter } from "@bdd_routes/bdd-nock-router";
import { CronJob } from "cron";
import { Knex } from "knex";
import { monitorEventLoopDelay } from "perf_hooks";
import { z } from "zod";

import {
  registerMcpEndpointAuthServerMetadataRouter,
  registerMcpEndpointMetadataRouter
} from "@app/ee/routes/ai/mcp-endpoint-metadata-router";
import { registerCertificateEstRouter } from "@app/ee/routes/est/certificate-est-router";
import { registerV1EERoutes } from "@app/ee/routes/v1";
import { registerV2EERoutes } from "@app/ee/routes/v2";
import {
  accessApprovalPolicyApproverDALFactory,
  accessApprovalPolicyBypasserDALFactory
} from "@app/ee/services/access-approval-policy/access-approval-policy-approver-dal";
import { accessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { accessApprovalPolicyEnvironmentDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-environment-dal";
import { accessApprovalPolicyServiceFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-service";
import { accessApprovalRequestDALFactory } from "@app/ee/services/access-approval-request/access-approval-request-dal";
import { accessApprovalRequestReviewerDALFactory } from "@app/ee/services/access-approval-request/access-approval-request-reviewer-dal";
import { accessApprovalRequestServiceFactory } from "@app/ee/services/access-approval-request/access-approval-request-service";
import { aiMcpActivityLogDALFactory } from "@app/ee/services/ai-mcp-activity-log/ai-mcp-activity-log-dal";
import { aiMcpActivityLogServiceFactory } from "@app/ee/services/ai-mcp-activity-log/ai-mcp-activity-log-service";
import { aiMcpEndpointDALFactory } from "@app/ee/services/ai-mcp-endpoint/ai-mcp-endpoint-dal";
import { aiMcpEndpointServerDALFactory } from "@app/ee/services/ai-mcp-endpoint/ai-mcp-endpoint-server-dal";
import { aiMcpEndpointServerToolDALFactory } from "@app/ee/services/ai-mcp-endpoint/ai-mcp-endpoint-server-tool-dal";
import { aiMcpEndpointServiceFactory } from "@app/ee/services/ai-mcp-endpoint/ai-mcp-endpoint-service";
import { aiMcpServerDALFactory } from "@app/ee/services/ai-mcp-server/ai-mcp-server-dal";
import { aiMcpServerServiceFactory } from "@app/ee/services/ai-mcp-server/ai-mcp-server-service";
import { aiMcpServerToolDALFactory } from "@app/ee/services/ai-mcp-server/ai-mcp-server-tool-dal";
import { aiMcpServerUserCredentialDALFactory } from "@app/ee/services/ai-mcp-server/ai-mcp-server-user-credential-dal";
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
import { eventBusFactory } from "@app/ee/services/event/event-bus-service";
import { sseServiceFactory } from "@app/ee/services/event/event-sse-service";
import { externalKmsDALFactory } from "@app/ee/services/external-kms/external-kms-dal";
import { externalKmsServiceFactory } from "@app/ee/services/external-kms/external-kms-service";
import { gatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { gatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { orgGatewayConfigDALFactory } from "@app/ee/services/gateway/org-gateway-config-dal";
import { gatewayV2DalFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { gatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { orgGatewayConfigV2DalFactory } from "@app/ee/services/gateway-v2/org-gateway-config-v2-dal";
import { githubOrgSyncDALFactory } from "@app/ee/services/github-org-sync/github-org-sync-dal";
import { githubOrgSyncServiceFactory } from "@app/ee/services/github-org-sync/github-org-sync-service";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { groupServiceFactory } from "@app/ee/services/group/group-service";
import { identityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { identityAuthTemplateDALFactory } from "@app/ee/services/identity-auth-template/identity-auth-template-dal";
import { identityAuthTemplateServiceFactory } from "@app/ee/services/identity-auth-template/identity-auth-template-service";
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
import { pamAccountDALFactory } from "@app/ee/services/pam-account/pam-account-dal";
import { pamAccountServiceFactory } from "@app/ee/services/pam-account/pam-account-service";
import { pamFolderDALFactory } from "@app/ee/services/pam-folder/pam-folder-dal";
import { pamFolderServiceFactory } from "@app/ee/services/pam-folder/pam-folder-service";
import { pamResourceDALFactory } from "@app/ee/services/pam-resource/pam-resource-dal";
import { pamResourceServiceFactory } from "@app/ee/services/pam-resource/pam-resource-service";
import { pamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { pamSessionServiceFactory } from "@app/ee/services/pam-session/pam-session-service";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { pitServiceFactory } from "@app/ee/services/pit/pit-service";
import { pkiAcmeAccountDALFactory } from "@app/ee/services/pki-acme/pki-acme-account-dal";
import { pkiAcmeAuthDALFactory } from "@app/ee/services/pki-acme/pki-acme-auth-dal";
import { pkiAcmeChallengeDALFactory } from "@app/ee/services/pki-acme/pki-acme-challenge-dal";
import { pkiAcmeChallengeServiceFactory } from "@app/ee/services/pki-acme/pki-acme-challenge-service";
import { pkiAcmeOrderAuthDALFactory } from "@app/ee/services/pki-acme/pki-acme-order-auth-dal";
import { pkiAcmeOrderDALFactory } from "@app/ee/services/pki-acme/pki-acme-order-dal";
import { pkiAcmeQueueServiceFactory } from "@app/ee/services/pki-acme/pki-acme-queue";
import { pkiAcmeServiceFactory } from "@app/ee/services/pki-acme/pki-acme-service";
import { projectTemplateDALFactory } from "@app/ee/services/project-template/project-template-dal";
import { projectTemplateServiceFactory } from "@app/ee/services/project-template/project-template-service";
import { rateLimitDALFactory } from "@app/ee/services/rate-limit/rate-limit-dal";
import { rateLimitServiceFactory } from "@app/ee/services/rate-limit/rate-limit-service";
import { instanceRelayConfigDalFactory } from "@app/ee/services/relay/instance-relay-config-dal";
import { orgRelayConfigDalFactory } from "@app/ee/services/relay/org-relay-config-dal";
import { relayDalFactory } from "@app/ee/services/relay/relay-dal";
import { relayServiceFactory } from "@app/ee/services/relay/relay-service";
import { samlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { samlConfigServiceFactory } from "@app/ee/services/saml-config/saml-config-service";
import { scimDALFactory } from "@app/ee/services/scim/scim-dal";
import { scimEventsDALFactory } from "@app/ee/services/scim/scim-events-dal";
import { scimServiceFactory } from "@app/ee/services/scim/scim-service";
import {
  secretApprovalPolicyApproverDALFactory,
  secretApprovalPolicyBypasserDALFactory
} from "@app/ee/services/secret-approval-policy/secret-approval-policy-approver-dal";
import { secretApprovalPolicyDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-dal";
import { secretApprovalPolicyEnvironmentDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-environment-dal";
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
import { secretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { secretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { secretScanningV2ServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-service";
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
import { subOrgServiceFactory } from "@app/ee/services/sub-org/sub-org-service";
import { trustedIpDALFactory } from "@app/ee/services/trusted-ip/trusted-ip-dal";
import { trustedIpServiceFactory } from "@app/ee/services/trusted-ip/trusted-ip-service";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, TEnvConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TQueueServiceFactory } from "@app/queue";
import { readLimit } from "@app/server/config/rateLimiter";
import { registerSecretScanningV2Webhooks } from "@app/server/plugins/secret-scanner-v2";
import { accessTokenQueueServiceFactory } from "@app/services/access-token-queue/access-token-queue";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { additionalPrivilegeServiceFactory } from "@app/services/additional-privilege/additional-privilege-service";
import { apiKeyDALFactory } from "@app/services/api-key/api-key-dal";
import { apiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { appConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { appConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import {
  approvalPolicyDALFactory,
  approvalPolicyStepApproversDALFactory,
  approvalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { approvalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import {
  approvalRequestApprovalsDALFactory,
  approvalRequestDALFactory,
  approvalRequestGrantsDALFactory,
  approvalRequestStepEligibleApproversDALFactory,
  approvalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
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
import { certificateIssuanceQueueFactory } from "@app/services/certificate-authority/certificate-issuance-queue";
import { externalCertificateAuthorityDALFactory } from "@app/services/certificate-authority/external-certificate-authority-dal";
import { internalCertificateAuthorityDALFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-dal";
import { InternalCertificateAuthorityFns } from "@app/services/certificate-authority/internal/internal-certificate-authority-fns";
import { internalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { certificateEstV3ServiceFactory } from "@app/services/certificate-est-v3/certificate-est-v3-service";
import { certificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { certificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
import { certificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { certificateProfileServiceFactory } from "@app/services/certificate-profile/certificate-profile-service";
import { certificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { certificateRequestServiceFactory } from "@app/services/certificate-request/certificate-request-service";
import { certificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { certificateTemplateDALFactory } from "@app/services/certificate-template/certificate-template-dal";
import { certificateTemplateEstConfigDALFactory } from "@app/services/certificate-template/certificate-template-est-config-dal";
import { certificateTemplateServiceFactory } from "@app/services/certificate-template/certificate-template-service";
import { certificateV3QueueServiceFactory } from "@app/services/certificate-v3/certificate-v3-queue";
import { certificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { cmekServiceFactory } from "@app/services/cmek/cmek-service";
import { convertorServiceFactory } from "@app/services/convertor/convertor-service";
import { acmeEnrollmentConfigDALFactory } from "@app/services/enrollment-config/acme-enrollment-config-dal";
import { apiEnrollmentConfigDALFactory } from "@app/services/enrollment-config/api-enrollment-config-dal";
import { estEnrollmentConfigDALFactory } from "@app/services/enrollment-config/est-enrollment-config-dal";
import { externalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { externalGroupOrgRoleMappingServiceFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-service";
import { externalMigrationQueueFactory } from "@app/services/external-migration/external-migration-queue";
import { externalMigrationServiceFactory } from "@app/services/external-migration/external-migration-service";
import { vaultExternalMigrationConfigDALFactory } from "@app/services/external-migration/vault-external-migration-config-dal";
import { folderCheckpointDALFactory } from "@app/services/folder-checkpoint/folder-checkpoint-dal";
import { folderCheckpointResourcesDALFactory } from "@app/services/folder-checkpoint-resources/folder-checkpoint-resources-dal";
import { folderCommitDALFactory } from "@app/services/folder-commit/folder-commit-dal";
import { folderCommitQueueServiceFactory } from "@app/services/folder-commit/folder-commit-queue";
import { folderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { folderCommitChangesDALFactory } from "@app/services/folder-commit-changes/folder-commit-changes-dal";
import { folderTreeCheckpointDALFactory } from "@app/services/folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { folderTreeCheckpointResourcesDALFactory } from "@app/services/folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { groupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { groupProjectServiceFactory } from "@app/services/group-project/group-project-service";
import { healthAlertServiceFactory } from "@app/services/health-alert/health-alert-queue";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { identityMetadataDALFactory } from "@app/services/identity/identity-metadata-dal";
import { identityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { identityServiceFactory } from "@app/services/identity/identity-service";
import { identityAccessTokenDALFactory } from "@app/services/identity-access-token/identity-access-token-dal";
import { identityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { identityAliCloudAuthDALFactory } from "@app/services/identity-alicloud-auth/identity-alicloud-auth-dal";
import { identityAliCloudAuthServiceFactory } from "@app/services/identity-alicloud-auth/identity-alicloud-auth-service";
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
import { identityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { identityTlsCertAuthDALFactory } from "@app/services/identity-tls-cert-auth/identity-tls-cert-auth-dal";
import { identityTlsCertAuthServiceFactory } from "@app/services/identity-tls-cert-auth/identity-tls-cert-auth-service";
import { identityTokenAuthDALFactory } from "@app/services/identity-token-auth/identity-token-auth-dal";
import { identityTokenAuthServiceFactory } from "@app/services/identity-token-auth/identity-token-auth-service";
import { identityUaClientSecretDALFactory } from "@app/services/identity-ua/identity-ua-client-secret-dal";
import { identityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";
import { identityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { identityV2DALFactory } from "@app/services/identity-v2/identity-dal";
import { identityV2ServiceFactory } from "@app/services/identity-v2/identity-service";
import { integrationDALFactory } from "@app/services/integration/integration-dal";
import { integrationServiceFactory } from "@app/services/integration/integration-service";
import { integrationAuthDALFactory } from "@app/services/integration-auth/integration-auth-dal";
import { integrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { membershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { membershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { membershipGroupServiceFactory } from "@app/services/membership-group/membership-group-service";
import { membershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { membershipIdentityServiceFactory } from "@app/services/membership-identity/membership-identity-service";
import { membershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { membershipUserServiceFactory } from "@app/services/membership-user/membership-user-service";
import { mfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { microsoftTeamsIntegrationDALFactory } from "@app/services/microsoft-teams/microsoft-teams-integration-dal";
import { microsoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { projectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { notificationQueueServiceFactory } from "@app/services/notification/notification-queue";
import { notificationServiceFactory } from "@app/services/notification/notification-service";
import { userNotificationDALFactory } from "@app/services/notification/user-notification-dal";
import { offlineUsageReportDALFactory } from "@app/services/offline-usage-report/offline-usage-report-dal";
import { offlineUsageReportServiceFactory } from "@app/services/offline-usage-report/offline-usage-report-service";
import { incidentContactDALFactory } from "@app/services/org/incident-contacts-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { orgServiceFactory } from "@app/services/org/org-service";
import { orgAdminServiceFactory } from "@app/services/org-admin/org-admin-service";
import { orgAssetDALFactory } from "@app/services/org-asset/org-asset-dal";
import { orgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { pamAccountRotationServiceFactory } from "@app/services/pam-account-rotation/pam-account-rotation-queue";
import { pamSessionExpirationServiceFactory } from "@app/services/pam-session-expiration/pam-session-expiration-queue";
import { dailyExpiringPkiItemAlertQueueServiceFactory } from "@app/services/pki-alert/expiring-pki-item-alert-queue";
import { pkiAlertDALFactory } from "@app/services/pki-alert/pki-alert-dal";
import { pkiAlertServiceFactory } from "@app/services/pki-alert/pki-alert-service";
import { pkiAlertChannelDALFactory } from "@app/services/pki-alert-v2/pki-alert-channel-dal";
import { pkiAlertHistoryDALFactory } from "@app/services/pki-alert-v2/pki-alert-history-dal";
import { pkiAlertV2DALFactory } from "@app/services/pki-alert-v2/pki-alert-v2-dal";
import { pkiAlertV2QueueServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-queue";
import { pkiAlertV2ServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-service";
import { pkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { pkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { pkiCollectionServiceFactory } from "@app/services/pki-collection/pki-collection-service";
import { pkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { pkiSubscriberQueueServiceFactory } from "@app/services/pki-subscriber/pki-subscriber-queue";
import { pkiSubscriberServiceFactory } from "@app/services/pki-subscriber/pki-subscriber-service";
import { pkiSyncCleanupQueueServiceFactory } from "@app/services/pki-sync/pki-sync-cleanup-queue";
import { pkiSyncDALFactory } from "@app/services/pki-sync/pki-sync-dal";
import { pkiSyncQueueFactory } from "@app/services/pki-sync/pki-sync-queue";
import { pkiSyncServiceFactory } from "@app/services/pki-sync/pki-sync-service";
import { pkiTemplatesDALFactory } from "@app/services/pki-templates/pki-templates-dal";
import { pkiTemplatesServiceFactory } from "@app/services/pki-templates/pki-templates-service";
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
import { reminderDALFactory } from "@app/services/reminder/reminder-dal";
import { dailyReminderQueueServiceFactory } from "@app/services/reminder/reminder-queue";
import { reminderServiceFactory } from "@app/services/reminder/reminder-service";
import { reminderRecipientDALFactory } from "@app/services/reminder-recipients/reminder-recipient-dal";
import { dailyResourceCleanUpQueueServiceFactory } from "@app/services/resource-cleanup/resource-cleanup-queue";
import { resourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { roleServiceFactory } from "@app/services/role/role-service";
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
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { getServerCfg, superAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { telemetryDALFactory } from "@app/services/telemetry/telemetry-dal";
import { telemetryQueueServiceFactory } from "@app/services/telemetry/telemetry-queue";
import { telemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { totpConfigDALFactory } from "@app/services/totp/totp-config-dal";
import { totpServiceFactory } from "@app/services/totp/totp-service";
import { upgradePathServiceFactory } from "@app/services/upgrade-path/upgrade-path-service";
import { userDALFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";
import { userAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { userEngagementServiceFactory } from "@app/services/user-engagement/user-engagement-service";
import { webAuthnCredentialDALFactory } from "@app/services/webauthn/webauthn-credential-dal";
import { webAuthnServiceFactory } from "@app/services/webauthn/webauthn-service";
import { webhookDALFactory } from "@app/services/webhook/webhook-dal";
import { webhookServiceFactory } from "@app/services/webhook/webhook-service";
import { workflowIntegrationDALFactory } from "@app/services/workflow-integration/workflow-integration-dal";
import { workflowIntegrationServiceFactory } from "@app/services/workflow-integration/workflow-integration-service";

import { injectAuditLogInfo } from "../plugins/audit-log";
import { injectAssumePrivilege } from "../plugins/auth/inject-assume-privilege";
import { injectIdentity } from "../plugins/auth/inject-identity";
import { injectPermission } from "../plugins/auth/inject-permission";
import { injectRateLimits } from "../plugins/inject-rate-limits";
import { forwardWritesToPrimary } from "../plugins/primary-forwarding-mode";
import { registerV1Routes } from "./v1";
import { initializeOauthConfigSync } from "./v1/sso-router";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";
import { registerV4Routes } from "./v4";

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

export const registerRoutes = async (
  server: FastifyZodProvider,
  {
    auditLogDb,
    superAdminDAL,
    db,
    smtp: smtpService,
    queue: queueService,
    keyStore,
    envConfig,
    hsmService,
    kmsRootConfigDAL
  }: {
    auditLogDb?: Knex;
    superAdminDAL: TSuperAdminDALFactory;
    db: Knex;
    smtp: TSmtpService;
    queue: TQueueServiceFactory;
    keyStore: TKeyStoreFactory;
    envConfig: TEnvConfig;
    hsmService: THsmServiceFactory;
    kmsRootConfigDAL: TKmsRootConfigDALFactory;
  }
) => {
  const appCfg = getConfig();
  await server.register(registerSecretScanningV2Webhooks, {
    prefix: "/secret-scanning/webhooks"
  });

  // db layers
  const userDAL = userDALFactory(db);
  const userAliasDAL = userAliasDALFactory(db);
  const authDAL = authDALFactory(db);
  const authTokenDAL = tokenDALFactory(db);
  const orgDAL = orgDALFactory(db);
  const orgMembershipDAL = orgMembershipDALFactory(db);
  const incidentContactDAL = incidentContactDALFactory(db);
  const rateLimitDAL = rateLimitDALFactory(db);
  const apiKeyDAL = apiKeyDALFactory(db);

  const projectDAL = projectDALFactory(db);
  const projectSshConfigDAL = projectSshConfigDALFactory(db);
  const projectMembershipDAL = projectMembershipDALFactory(db);
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

  const reminderDAL = reminderDALFactory(db);
  const reminderRecipientDAL = reminderRecipientDALFactory(db);

  const integrationDAL = integrationDALFactory(db);
  const offlineUsageReportDAL = offlineUsageReportDALFactory(db);
  const integrationAuthDAL = integrationAuthDALFactory(db);
  const webhookDAL = webhookDALFactory(db);
  const serviceTokenDAL = serviceTokenDALFactory(db);

  const identityDAL = identityDALFactory(db);
  const identityV2DAL = identityV2DALFactory(db);
  const identityMetadataDAL = identityMetadataDALFactory(db);
  const identityAccessTokenDAL = identityAccessTokenDALFactory(db);
  const identityOrgMembershipDAL = identityOrgDALFactory(db);
  const identityGroupMembershipDAL = identityGroupMembershipDALFactory(db);
  const identityProjectDAL = identityProjectDALFactory(db);
  const identityAuthTemplateDAL = identityAuthTemplateDALFactory(db);

  const identityTokenAuthDAL = identityTokenAuthDALFactory(db);
  const identityUaDAL = identityUaDALFactory(db);
  const identityKubernetesAuthDAL = identityKubernetesAuthDALFactory(db);
  const identityUaClientSecretDAL = identityUaClientSecretDALFactory(db);
  const identityAliCloudAuthDAL = identityAliCloudAuthDALFactory(db);
  const identityTlsCertAuthDAL = identityTlsCertAuthDALFactory(db);
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
  const userNotificationDAL = userNotificationDALFactory(db);

  // ee db layer ops
  const permissionDAL = permissionDALFactory(db);
  const samlConfigDAL = samlConfigDALFactory(db);
  const scimDAL = scimDALFactory(db);
  const scimEventsDAL = scimEventsDALFactory(db);
  const ldapConfigDAL = ldapConfigDALFactory(db);
  const ldapGroupMapDAL = ldapGroupMapDALFactory(db);

  const oidcConfigDAL = oidcConfigDALFactory(db);
  const accessApprovalPolicyDAL = accessApprovalPolicyDALFactory(db);
  const accessApprovalRequestDAL = accessApprovalRequestDALFactory(db);
  const accessApprovalPolicyApproverDAL = accessApprovalPolicyApproverDALFactory(db);
  const accessApprovalPolicyBypasserDAL = accessApprovalPolicyBypasserDALFactory(db);
  const accessApprovalRequestReviewerDAL = accessApprovalRequestReviewerDALFactory(db);
  const accessApprovalPolicyEnvironmentDAL = accessApprovalPolicyEnvironmentDALFactory(db);

  const sapApproverDAL = secretApprovalPolicyApproverDALFactory(db);
  const sapBypasserDAL = secretApprovalPolicyBypasserDALFactory(db);
  const sapEnvironmentDAL = secretApprovalPolicyEnvironmentDALFactory(db);
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
  const userGroupMembershipDAL = userGroupMembershipDALFactory(db);
  const secretScanningDAL = secretScanningDALFactory(db);
  const secretSharingDAL = secretSharingDALFactory(db);
  const orgAssetDAL = orgAssetDALFactory(db);
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

  const slackIntegrationDAL = slackIntegrationDALFactory(db);
  const projectSlackConfigDAL = projectSlackConfigDALFactory(db);
  const workflowIntegrationDAL = workflowIntegrationDALFactory(db);
  const totpConfigDAL = totpConfigDALFactory(db);
  const webAuthnCredentialDAL = webAuthnCredentialDALFactory(db);

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
  const secretScanningV2DAL = secretScanningV2DALFactory(db);
  const keyValueStoreDAL = keyValueStoreDALFactory(db);

  const membershipDAL = membershipDALFactory(db);
  const membershipUserDAL = membershipUserDALFactory(db);
  const membershipIdentityDAL = membershipIdentityDALFactory(db);
  const membershipGroupDAL = membershipGroupDALFactory(db);
  const additionalPrivilegeDAL = additionalPrivilegeDALFactory(db);
  const membershipRoleDAL = membershipRoleDALFactory(db);
  const roleDAL = roleDALFactory(db);
  const pkiAlertHistoryDAL = pkiAlertHistoryDALFactory(db);
  const pkiAlertChannelDAL = pkiAlertChannelDALFactory(db);
  const pkiAlertV2DAL = pkiAlertV2DALFactory(db);

  const vaultExternalMigrationConfigDAL = vaultExternalMigrationConfigDALFactory(db);

  const eventBusService = eventBusFactory(server.redis);
  const sseService = sseServiceFactory(eventBusService, server.redis);

  const permissionService = permissionServiceFactory({
    permissionDAL,
    serviceTokenDAL,
    projectDAL,
    keyStore,
    roleDAL,
    userDAL,
    identityDAL
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
    projectDAL,
    envConfig
  });

  const tokenService = tokenServiceFactory({ tokenDAL: authTokenDAL, userDAL, membershipUserDAL, orgDAL });

  const membershipUserService = membershipUserServiceFactory({
    licenseService,
    membershipRoleDAL,
    membershipUserDAL,
    orgDAL,
    permissionService,
    roleDAL,
    userDAL,
    projectDAL,
    projectKeyDAL,
    smtpService,
    tokenService,
    userAliasDAL,
    userGroupMembershipDAL,
    additionalPrivilegeDAL
  });

  const membershipIdentityService = membershipIdentityServiceFactory({
    identityDAL,
    membershipIdentityDAL,
    membershipRoleDAL,
    orgDAL,
    permissionService,
    roleDAL,
    additionalPrivilegeDAL
  });

  const membershipGroupService = membershipGroupServiceFactory({
    membershipGroupDAL,
    membershipRoleDAL,
    accessApprovalPolicyDAL,
    accessApprovalPolicyApproverDAL,
    secretApprovalPolicyDAL,
    secretApprovalPolicyApproverDAL: sapApproverDAL,
    roleDAL,
    permissionService,
    orgDAL
  });

  const roleService = roleServiceFactory({
    permissionService,
    roleDAL,
    projectDAL,
    identityDAL,
    userDAL,
    externalGroupOrgRoleMappingDAL,
    membershipRoleDAL
  });
  const additionalPrivilegeService = additionalPrivilegeServiceFactory({
    additionalPrivilegeDAL,
    membershipDAL,
    orgDAL,
    permissionService
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

  const auditLogStreamService = auditLogStreamServiceFactory({
    licenseService,
    permissionService,
    auditLogStreamDAL,
    kmsService
  });

  const auditLogQueue = await auditLogQueueServiceFactory({
    auditLogDAL,
    queueService,
    projectDAL,
    licenseService,
    auditLogStreamService
  });

  const notificationQueue = await notificationQueueServiceFactory({
    userNotificationDAL,
    queueService
  });

  const notificationService = notificationServiceFactory({ notificationQueue, userNotificationDAL });

  const auditLogService = auditLogServiceFactory({ auditLogDAL, permissionService, auditLogQueue });
  const secretApprovalPolicyService = secretApprovalPolicyServiceFactory({
    projectEnvDAL,
    secretApprovalPolicyApproverDAL: sapApproverDAL,
    secretApprovalPolicyBypasserDAL: sapBypasserDAL,
    secretApprovalPolicyEnvironmentDAL: sapEnvironmentDAL,
    permissionService,
    secretApprovalPolicyDAL,
    licenseService,
    userDAL,
    projectMembershipDAL,
    secretApprovalRequestDAL
  });

  const samlService = samlConfigServiceFactory({
    identityMetadataDAL,
    permissionService,
    orgDAL,
    userDAL,
    userAliasDAL,
    samlConfigDAL,
    groupDAL,
    userGroupMembershipDAL,
    projectDAL,
    projectBotDAL,
    projectKeyDAL,
    licenseService,
    tokenService,
    smtpService,
    kmsService,
    membershipRoleDAL,
    membershipGroupDAL
  });
  const groupService = groupServiceFactory({
    identityDAL,
    membershipDAL,
    identityGroupMembershipDAL,
    userDAL,
    groupDAL,
    orgDAL,
    userGroupMembershipDAL,
    projectDAL,
    projectBotDAL,
    projectKeyDAL,
    permissionService,
    licenseService,
    oidcConfigDAL,
    membershipGroupDAL,
    membershipRoleDAL
  });
  const groupProjectService = groupProjectServiceFactory({
    groupDAL,
    projectDAL,
    permissionService
  });

  const folderCommitChangesDAL = folderCommitChangesDALFactory(db);
  const folderCheckpointDAL = folderCheckpointDALFactory(db);
  const folderCheckpointResourcesDAL = folderCheckpointResourcesDALFactory(db);
  const folderTreeCheckpointDAL = folderTreeCheckpointDALFactory(db);
  const folderCommitDAL = folderCommitDALFactory(db);
  const folderTreeCheckpointResourcesDAL = folderTreeCheckpointResourcesDALFactory(db);

  const folderCommitQueueService = folderCommitQueueServiceFactory({
    queueService,
    folderTreeCheckpointDAL,
    keyStore,
    folderTreeCheckpointResourcesDAL,
    folderCommitDAL,
    folderDAL
  });
  const folderCommitService = folderCommitServiceFactory({
    folderCommitDAL,
    folderCommitChangesDAL,
    folderCheckpointDAL,
    folderTreeCheckpointDAL,
    userDAL,
    identityDAL,
    folderDAL,
    folderVersionDAL,
    secretVersionV2BridgeDAL,
    projectDAL,
    folderCheckpointResourcesDAL,
    secretV2BridgeDAL,
    folderTreeCheckpointResourcesDAL,
    folderCommitQueueService,
    permissionService,
    kmsService,
    secretTagDAL,
    resourceMetadataDAL
  });
  const scimService = scimServiceFactory({
    licenseService,
    scimDAL,
    scimEventsDAL,
    userDAL,
    userAliasDAL,
    orgDAL,
    projectDAL,
    userGroupMembershipDAL,
    projectKeyDAL,
    projectBotDAL,
    permissionService,
    smtpService,
    externalGroupOrgRoleMappingDAL,
    groupDAL,
    membershipGroupDAL,
    membershipRoleDAL,
    membershipUserDAL,
    additionalPrivilegeDAL
  });

  const githubOrgSyncConfigService = githubOrgSyncServiceFactory({
    licenseService,
    githubOrgSyncDAL,
    kmsService,
    permissionService,
    groupDAL,
    userGroupMembershipDAL,
    orgMembershipDAL,
    membershipRoleDAL,
    membershipGroupDAL
  });

  const ldapService = ldapConfigServiceFactory({
    ldapConfigDAL,
    ldapGroupMapDAL,
    orgDAL,
    groupDAL,
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
    kmsService,
    membershipGroupDAL,
    membershipRoleDAL
  });

  const telemetryService = telemetryServiceFactory({
    keyStore,
    licenseService
  });
  const telemetryQueue = telemetryQueueServiceFactory({
    keyStore,
    telemetryDAL,
    queueService,
    telemetryService
  });

  const invalidateCacheQueue = invalidateCacheQueueFactory({
    keyStore,
    queueService
  });

  const userService = userServiceFactory({
    userDAL,
    orgDAL,
    tokenService,
    permissionService,
    groupProjectDAL,
    smtpService,
    userAliasDAL,
    membershipUserDAL
  });

  const upgradePathService = upgradePathServiceFactory({ keyStore });

  const totpService = totpServiceFactory({
    totpConfigDAL,
    userDAL,
    kmsService
  });

  const webAuthnService = webAuthnServiceFactory({
    webAuthnCredentialDAL,
    userDAL,
    tokenService,
    keyStore
  });

  const loginService = authLoginServiceFactory({
    userDAL,
    smtpService,
    tokenService,
    orgDAL,
    totpService,
    auditLogService,
    notificationService,
    membershipRoleDAL,
    membershipUserDAL
  });
  const passwordService = authPaswordServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL,
    totpConfigDAL,
    membershipUserDAL
  });

  const projectBotService = projectBotServiceFactory({ permissionService, projectBotDAL, projectDAL });

  const reminderService = reminderServiceFactory({
    reminderDAL,
    reminderRecipientDAL,
    smtpService,
    projectMembershipDAL,
    permissionService,
    secretV2BridgeDAL
  });

  const orgService = orgServiceFactory({
    userAliasDAL,
    identityMetadataDAL,
    secretDAL,
    secretV2BridgeDAL,
    folderDAL,
    licenseService,
    samlConfigDAL,
    permissionService,
    orgDAL,
    incidentContactDAL,
    tokenService,
    projectDAL,
    projectMembershipDAL,
    orgMembershipDAL,
    projectKeyDAL,
    smtpService,
    userDAL,
    groupDAL,
    oidcConfigDAL,
    ldapConfigDAL,
    loginService,
    projectBotService,
    reminderService,
    membershipRoleDAL,
    membershipUserDAL,
    roleDAL,
    userGroupMembershipDAL,
    additionalPrivilegeDAL
  });

  const subOrgService = subOrgServiceFactory({
    licenseService,
    membershipDAL,
    membershipRoleDAL,
    orgDAL,
    permissionService
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
    orgDAL,
    orgService,
    licenseService,
    membershipGroupDAL
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
    authService: loginService,
    serverCfgDAL: superAdminDAL,
    kmsRootConfigDAL,
    orgService,
    keyStore,
    orgDAL,
    licenseService,
    kmsService,
    microsoftTeamsService,
    invalidateCacheQueue,
    smtpService,
    tokenService,
    membershipIdentityDAL,
    membershipRoleDAL,
    membershipUserDAL
  });

  const offlineUsageReportService = offlineUsageReportServiceFactory({
    offlineUsageReportDAL,
    licenseService
  });

  const orgAdminService = orgAdminServiceFactory({
    smtpService,
    projectDAL,
    permissionService,
    notificationService,
    membershipRoleDAL,
    membershipUserDAL,
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
    projectDAL,
    permissionService,
    userDAL,
    userGroupMembershipDAL,
    smtpService,
    projectKeyDAL,
    groupProjectDAL,
    secretReminderRecipientsDAL,
    licenseService,
    notificationService,
    membershipUserDAL,
    additionalPrivilegeDAL,
    membershipRoleDAL
  });

  const projectKeyService = projectKeyServiceFactory({
    permissionService,
    projectKeyDAL,
    membershipUserDAL
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
    secretApprovalRequestDAL,
    secretApprovalSecretDAL: secretApprovalRequestSecretDAL,
    membershipRoleDAL,
    membershipUserDAL
  });

  const certificateAuthorityDAL = certificateAuthorityDALFactory(db);
  const internalCertificateAuthorityDAL = internalCertificateAuthorityDALFactory(db);
  const externalCertificateAuthorityDAL = externalCertificateAuthorityDALFactory(db);
  const certificateAuthorityCertDAL = certificateAuthorityCertDALFactory(db);
  const certificateAuthoritySecretDAL = certificateAuthoritySecretDALFactory(db);
  const certificateAuthorityCrlDAL = certificateAuthorityCrlDALFactory(db);
  const certificateTemplateDAL = certificateTemplateDALFactory(db);
  const certificateTemplateEstConfigDAL = certificateTemplateEstConfigDALFactory(db);
  const certificatePolicyDAL = certificatePolicyDALFactory(db);
  const certificateProfileDAL = certificateProfileDALFactory(db);
  const apiEnrollmentConfigDAL = apiEnrollmentConfigDALFactory(db);
  const estEnrollmentConfigDAL = estEnrollmentConfigDALFactory(db);
  const acmeEnrollmentConfigDAL = acmeEnrollmentConfigDALFactory(db);
  const acmeAccountDAL = pkiAcmeAccountDALFactory(db);
  const acmeOrderDAL = pkiAcmeOrderDALFactory(db);
  const acmeAuthDAL = pkiAcmeAuthDALFactory(db);
  const acmeOrderAuthDAL = pkiAcmeOrderAuthDALFactory(db);
  const acmeChallengeDAL = pkiAcmeChallengeDALFactory(db);
  const certificateDAL = certificateDALFactory(db);
  const certificateBodyDAL = certificateBodyDALFactory(db);
  const certificateSecretDAL = certificateSecretDALFactory(db);
  const certificateRequestDAL = certificateRequestDALFactory(db);
  const certificateSyncDAL = certificateSyncDALFactory(db);

  const pkiAlertDAL = pkiAlertDALFactory(db);
  const pkiCollectionDAL = pkiCollectionDALFactory(db);
  const pkiCollectionItemDAL = pkiCollectionItemDALFactory(db);
  const pkiSubscriberDAL = pkiSubscriberDALFactory(db);
  const pkiSyncDAL = pkiSyncDALFactory(db);
  const pkiTemplatesDAL = pkiTemplatesDALFactory(db);

  const instanceRelayConfigDAL = instanceRelayConfigDalFactory(db);
  const orgRelayConfigDAL = orgRelayConfigDalFactory(db);
  const relayDAL = relayDalFactory(db);
  const gatewayV2DAL = gatewayV2DalFactory(db);

  const orgGatewayConfigV2DAL = orgGatewayConfigV2DalFactory(db);

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

  const certificatePolicyService = certificatePolicyServiceFactory({
    certificatePolicyDAL,
    permissionService
  });

  const certificateProfileService = certificateProfileServiceFactory({
    certificateProfileDAL,
    certificatePolicyDAL,
    apiEnrollmentConfigDAL,
    estEnrollmentConfigDAL,
    acmeEnrollmentConfigDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    permissionService,
    kmsService,
    projectDAL
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

  const gatewayService = gatewayServiceFactory({
    permissionService,
    gatewayDAL,
    kmsService,
    licenseService,
    orgGatewayConfigDAL,
    keyStore
  });

  const relayService = relayServiceFactory({
    instanceRelayConfigDAL,
    orgRelayConfigDAL,
    relayDAL,
    kmsService,
    permissionService,
    orgDAL,
    notificationService,
    smtpService,
    userDAL
  });

  const gatewayV2Service = gatewayV2ServiceFactory({
    kmsService,
    relayService,
    orgGatewayConfigV2DAL,
    gatewayV2DAL,
    relayDAL,
    permissionService,
    orgDAL,
    notificationService,
    smtpService
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
    folderCommitService,
    secretBlindIndexDAL,
    secretVersionDAL,
    secretTagDAL,
    secretVersionTagDAL,
    secretVersionV2BridgeDAL,
    secretVersionTagV2BridgeDAL,
    resourceMetadataDAL,
    appConnectionDAL,
    licenseService,
    gatewayService,
    gatewayV2Service,
    notificationService,
    projectSlackConfigDAL,
    projectMicrosoftTeamsConfigDAL,
    microsoftTeamsService
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
    orgService,
    resourceMetadataDAL,
    folderCommitService,
    secretSyncQueue,
    reminderService,
    eventBusService,
    licenseService,
    membershipRoleDAL,
    membershipUserDAL,
    telemetryService
  });

  const projectService = projectServiceFactory({
    permissionService,
    projectDAL,
    projectSshConfigDAL,
    projectQueue: projectQueueService,
    userDAL,
    projectEnvDAL,
    orgDAL,
    projectMembershipDAL,
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
    keyStore,
    kmsService,
    certificateTemplateDAL,
    projectSlackConfigDAL,
    slackIntegrationDAL,
    projectMicrosoftTeamsConfigDAL,
    microsoftTeamsIntegrationDAL,
    projectTemplateService,
    smtpService,
    notificationService,
    membershipGroupDAL,
    membershipIdentityDAL,
    membershipRoleDAL,
    membershipUserDAL,
    roleDAL
  });

  const projectEnvService = projectEnvServiceFactory({
    permissionService,
    projectEnvDAL,
    keyStore,
    licenseService,
    projectDAL,
    folderDAL,
    accessApprovalPolicyEnvironmentDAL,
    secretApprovalPolicyEnvironmentDAL: sapEnvironmentDAL
  });

  const snapshotService = secretSnapshotServiceFactory({
    permissionService,
    licenseService,
    folderDAL,
    secretDAL,
    snapshotDAL,
    snapshotFolderDAL,
    snapshotSecretDAL,
    folderCommitService,
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
    projectDAL,
    folderCommitService,
    secretApprovalPolicyService,
    secretV2BridgeDAL,
    dynamicSecretDAL
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
    projectDAL,
    secretVersionDAL: secretVersionV2BridgeDAL,
    folderCommitService,
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
    reminderService,
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
    microsoftTeamsService,
    folderCommitService,
    notificationService
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
    licenseService,
    reminderService
  });

  const secretSharingService = secretSharingServiceFactory({
    permissionService,
    secretSharingDAL,
    orgAssetDAL,
    orgDAL,
    kmsService,
    smtpService,
    userDAL,
    licenseService
  });

  const accessApprovalPolicyService = accessApprovalPolicyServiceFactory({
    accessApprovalPolicyDAL,
    accessApprovalPolicyApproverDAL,
    accessApprovalPolicyBypasserDAL,
    accessApprovalPolicyEnvironmentDAL,
    groupDAL,
    permissionService,
    projectEnvDAL,
    projectDAL,
    userDAL,
    accessApprovalRequestDAL,
    accessApprovalRequestReviewerDAL,
    additionalPrivilegeDAL,
    projectMembershipDAL
  });

  const accessApprovalRequestService = accessApprovalRequestServiceFactory({
    projectDAL,
    permissionService,
    accessApprovalRequestReviewerDAL,
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
    projectMicrosoftTeamsConfigDAL,
    notificationService,
    additionalPrivilegeDAL
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
    resourceMetadataDAL,
    folderCommitService
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
    folderCommitService,
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
    smtpService,
    orgDAL
  });

  const identityService = identityServiceFactory({
    additionalPrivilegeDAL,
    permissionService,
    identityDAL,
    identityOrgMembershipDAL,
    identityProjectDAL,
    licenseService,
    identityMetadataDAL,
    keyStore,
    orgDAL,
    membershipIdentityDAL,
    membershipRoleDAL
  });

  const identityV2Service = identityV2ServiceFactory({
    membershipIdentityDAL,
    membershipRoleDAL,
    identityMetadataDAL,
    licenseService,
    permissionService,
    identityDAL: identityV2DAL,
    keyStore
  });

  const identityProjectService = identityProjectServiceFactory({
    identityProjectDAL,
    membershipIdentityDAL,
    permissionService
  });

  const identityAuthTemplateService = identityAuthTemplateServiceFactory({
    identityAuthTemplateDAL,
    identityLdapAuthDAL,
    permissionService,
    kmsService,
    licenseService,
    auditLogService
  });

  const identityAccessTokenService = identityAccessTokenServiceFactory({
    identityAccessTokenDAL,
    accessTokenQueue,
    identityDAL,
    membershipIdentityDAL,
    orgDAL
  });

  const identityTokenAuthService = identityTokenAuthServiceFactory({
    identityDAL,
    identityTokenAuthDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    orgDAL,
    membershipIdentityDAL
  });

  const identityUaService = identityUaServiceFactory({
    identityDAL,
    permissionService,
    identityAccessTokenDAL,
    identityUaClientSecretDAL,
    identityUaDAL,
    licenseService,
    keyStore,
    orgDAL,
    membershipIdentityDAL
  });

  const identityKubernetesAuthService = identityKubernetesAuthServiceFactory({
    identityDAL,
    identityKubernetesAuthDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    gatewayService,
    orgDAL,
    gatewayV2Service,
    gatewayV2DAL,
    gatewayDAL,
    kmsService,
    membershipIdentityDAL
  });
  const identityGcpAuthService = identityGcpAuthServiceFactory({
    identityDAL,
    identityGcpAuthDAL,
    orgDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    membershipIdentityDAL
  });

  const identityAliCloudAuthService = identityAliCloudAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    orgDAL,
    identityAliCloudAuthDAL,
    licenseService,
    permissionService,
    membershipIdentityDAL
  });

  const identityTlsCertAuthService = identityTlsCertAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    identityTlsCertAuthDAL,
    licenseService,
    permissionService,
    kmsService,
    membershipIdentityDAL,
    orgDAL
  });

  const identityAwsAuthService = identityAwsAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    orgDAL,
    identityAwsAuthDAL,
    licenseService,
    permissionService,
    membershipIdentityDAL
  });

  const identityAzureAuthService = identityAzureAuthServiceFactory({
    identityDAL,
    identityAzureAuthDAL,
    orgDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    membershipIdentityDAL
  });

  const identityOciAuthService = identityOciAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    orgDAL,
    identityOciAuthDAL,
    licenseService,
    permissionService,
    membershipIdentityDAL
  });

  const pitService = pitServiceFactory({
    folderCommitService,
    secretService,
    folderService,
    permissionService,
    folderDAL,
    projectEnvDAL,
    secretApprovalRequestService,
    secretApprovalPolicyService,
    projectDAL,
    secretV2BridgeService,
    folderCommitDAL
  });

  const identityOidcAuthService = identityOidcAuthServiceFactory({
    identityDAL,
    identityOidcAuthDAL,
    orgDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    kmsService,
    membershipIdentityDAL
  });

  const identityJwtAuthService = identityJwtAuthServiceFactory({
    identityDAL,
    identityJwtAuthDAL,
    orgDAL,
    permissionService,
    identityAccessTokenDAL,
    licenseService,
    kmsService,
    membershipIdentityDAL
  });

  const identityLdapAuthService = identityLdapAuthServiceFactory({
    identityLdapAuthDAL,
    orgDAL,
    permissionService,
    kmsService,
    identityAccessTokenDAL,
    licenseService,
    identityDAL,
    identityAuthTemplateDAL,
    keyStore,
    membershipIdentityDAL
  });

  const convertorService = convertorServiceFactory({
    additionalPrivilegeDAL,
    membershipDAL,
    projectDAL,
    groupDAL
  });

  const pkiAlertV2Service = pkiAlertV2ServiceFactory({
    pkiAlertV2DAL,
    pkiAlertChannelDAL,
    pkiAlertHistoryDAL,
    permissionService,
    smtpService
  });

  const pkiAlertV2Queue = pkiAlertV2QueueServiceFactory({
    queueService,
    pkiAlertV2Service,
    pkiAlertV2DAL,
    pkiAlertHistoryDAL
  });

  const dynamicSecretProviders = buildDynamicSecretProviders({
    gatewayService,
    gatewayV2Service
  });

  const dynamicSecretQueueService = dynamicSecretLeaseQueueServiceFactory({
    queueService,
    dynamicSecretLeaseDAL,
    dynamicSecretProviders,
    dynamicSecretDAL,
    folderDAL,
    kmsService,
    smtpService,
    userDAL,
    identityDAL,
    projectMembershipDAL,
    projectDAL
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
    gatewayV2DAL,
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
    kmsService,
    userDAL,
    identityDAL
  });

  const approvalRequestDAL = approvalRequestDALFactory(db);
  const approvalRequestGrantsDAL = approvalRequestGrantsDALFactory(db);

  // DAILY
  const dailyResourceCleanUp = dailyResourceCleanUpQueueServiceFactory({
    scimService,
    auditLogDAL,
    queueService,
    secretVersionDAL,
    secretFolderVersionDAL: folderVersionDAL,
    snapshotDAL,
    identityAccessTokenDAL,
    secretSharingDAL,
    secretVersionV2DAL: secretVersionV2BridgeDAL,
    identityUniversalAuthClientSecretDAL: identityUaClientSecretDAL,
    serviceTokenService,
    orgService,
    userNotificationDAL,
    keyValueStoreDAL,
    approvalRequestDAL,
    approvalRequestGrantsDAL
  });

  const healthAlert = healthAlertServiceFactory({
    gatewayV2Service,
    queueService,
    relayService
  });

  const dailyReminderQueueService = dailyReminderQueueServiceFactory({
    reminderService,
    queueService,
    secretDAL: secretV2BridgeDAL,
    secretReminderRecipientsDAL
  });

  const dailyExpiringPkiItemAlert = dailyExpiringPkiItemAlertQueueServiceFactory({
    queueService,
    pkiAlertService
  });

  const oidcService = oidcConfigServiceFactory({
    orgDAL,
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
    groupDAL,
    auditLogService,
    membershipGroupDAL,
    membershipRoleDAL
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
    permissionService
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
    resourceMetadataDAL,
    folderCommitService,
    folderVersionDAL,
    notificationService
  });

  const externalGroupOrgRoleMappingService = externalGroupOrgRoleMappingServiceFactory({
    permissionService,
    licenseService,
    externalGroupOrgRoleMappingDAL,
    roleDAL
  });

  const appConnectionService = appConnectionServiceFactory({
    appConnectionDAL,
    permissionService,
    kmsService,
    licenseService,
    gatewayService,
    gatewayV2Service,
    gatewayDAL,
    gatewayV2DAL,
    projectDAL
  });

  const secretSyncService = secretSyncServiceFactory({
    secretSyncDAL,
    secretImportDAL,
    permissionService,
    appConnectionService,
    projectDAL,
    orgDAL,
    folderDAL,
    secretSyncQueue,
    projectBotService,
    keyStore,
    licenseService
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
    folderCommitService,
    secretVersionTagV2BridgeDAL,
    secretVersionV2BridgeDAL,
    keyStore,
    resourceMetadataDAL,
    snapshotService,
    secretQueueService,
    queueService,
    appConnectionDAL,
    gatewayService,
    gatewayV2Service
  });

  const pkiSyncQueue = pkiSyncQueueFactory({
    queueService,
    kmsService,
    appConnectionDAL,
    keyStore,
    pkiSyncDAL,
    auditLogService,
    projectDAL,
    licenseService,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateSyncDAL
  });

  const pkiSyncCleanup = pkiSyncCleanupQueueServiceFactory({
    queueService,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const internalCaFns = InternalCertificateAuthorityFns({
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthoritySecretDAL,
    certificateAuthorityCrlDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const certificateAuthorityQueue = certificateAuthorityQueueFactory({
    certificateAuthorityCrlDAL,
    certificateAuthorityDAL,
    certificateAuthoritySecretDAL,
    certificateDAL,
    projectDAL,
    kmsService,
    queueService,
    pkiSubscriberDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    externalCertificateAuthorityDAL,
    keyStore,
    appConnectionDAL,
    appConnectionService,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const internalCertificateAuthorityService = internalCertificateAuthorityServiceFactory({
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
    internalCertificateAuthorityDAL,
    kmsService,
    permissionService
  });

  const certificateAuthorityService = certificateAuthorityServiceFactory({
    certificateAuthorityDAL,
    permissionService,
    appConnectionDAL,
    appConnectionService,
    externalCertificateAuthorityDAL,
    internalCertificateAuthorityService,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const certificateEstService = certificateEstServiceFactory({
    internalCertificateAuthorityService,
    certificateTemplateService,
    certificateTemplateDAL,
    certificateAuthorityCertDAL,
    certificateAuthorityDAL,
    projectDAL,
    kmsService,
    licenseService
  });

  const pkiSubscriberQueue = pkiSubscriberQueueServiceFactory({
    queueService,
    pkiSubscriberDAL,
    certificateAuthorityDAL,
    certificateAuthorityQueue,
    certificateDAL,
    auditLogService,
    internalCaFns
  });

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
    permissionService,
    pkiCollectionDAL,
    pkiCollectionItemDAL,
    certificateSyncDAL,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const certificateRequestService = certificateRequestServiceFactory({
    certificateRequestDAL,
    certificateDAL,
    certificateService,
    permissionService
  });

  const certificateIssuanceQueue = certificateIssuanceQueueFactory({
    certificateAuthorityDAL,
    appConnectionDAL,
    appConnectionService,
    externalCertificateAuthorityDAL,
    certificateDAL,
    projectDAL,
    kmsService,
    certificateBodyDAL,
    certificateSecretDAL,
    queueService,
    pkiSubscriberDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    certificateProfileDAL,
    certificateRequestService
  });

  const certificateV3Service = certificateV3ServiceFactory({
    certificateDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    certificateProfileDAL,
    certificatePolicyService,
    acmeAccountDAL,
    internalCaService: internalCertificateAuthorityService,
    permissionService,
    certificateSyncDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    kmsService,
    projectDAL,
    certificateBodyDAL,
    certificateIssuanceQueue,
    certificateRequestService
  });

  const certificateV3Queue = certificateV3QueueServiceFactory({
    queueService,
    certificateDAL,
    certificateV3Service,
    auditLogService
  });

  const certificateEstV3Service = certificateEstV3ServiceFactory({
    internalCertificateAuthorityService,
    certificatePolicyService,
    certificatePolicyDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    projectDAL,
    kmsService,
    licenseService,
    certificateProfileDAL,
    estEnrollmentConfigDAL
  });

  const acmeChallengeService = pkiAcmeChallengeServiceFactory({
    acmeChallengeDAL,
    auditLogService
  });

  const pkiAcmeQueueService = await pkiAcmeQueueServiceFactory({
    queueService,
    acmeChallengeService
  });

  const pkiAcmeService = pkiAcmeServiceFactory({
    projectDAL,
    certificateAuthorityDAL,
    certificateProfileDAL,
    certificateBodyDAL,
    certificatePolicyDAL,
    acmeAccountDAL,
    acmeOrderDAL,
    acmeAuthDAL,
    acmeOrderAuthDAL,
    acmeChallengeDAL,
    keyStore,
    kmsService,
    certificateV3Service,
    certificatePolicyService,
    certificateRequestService,
    certificateIssuanceQueue,
    acmeChallengeService,
    pkiAcmeQueueService,
    auditLogService
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
    permissionService,
    certificateAuthorityQueue,
    internalCaFns,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const pkiSyncService = pkiSyncServiceFactory({
    pkiSyncDAL,
    certificateDAL,
    certificateSyncDAL,
    pkiSubscriberDAL,
    appConnectionService,
    permissionService,
    licenseService,
    pkiSyncQueue
  });

  const pkiTemplateService = pkiTemplatesServiceFactory({
    pkiTemplatesDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthoritySecretDAL,
    certificateAuthorityCrlDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService,
    permissionService,
    internalCaFns
  });

  await secretRotationV2QueueServiceFactory({
    secretRotationV2Service,
    secretRotationV2DAL,
    queueService,
    projectDAL,
    projectMembershipDAL,
    smtpService,
    notificationService
  });

  const secretScanningV2Queue = await secretScanningV2QueueServiceFactory({
    auditLogService,
    secretScanningV2DAL,
    queueService,
    projectDAL,
    projectMembershipDAL,
    smtpService,
    kmsService,
    keyStore,
    appConnectionDAL,
    notificationService
  });

  const secretScanningV2Service = secretScanningV2ServiceFactory({
    permissionService,
    appConnectionService,
    licenseService,
    secretScanningV2DAL,
    secretScanningV2Queue,
    kmsService,
    appConnectionDAL
  });

  const pamFolderDAL = pamFolderDALFactory(db);
  const pamResourceDAL = pamResourceDALFactory(db);
  const pamAccountDAL = pamAccountDALFactory(db);
  const pamSessionDAL = pamSessionDALFactory(db);
  const aiMcpServerDAL = aiMcpServerDALFactory(db);
  const aiMcpServerToolDAL = aiMcpServerToolDALFactory(db);
  const aiMcpServerUserCredentialDAL = aiMcpServerUserCredentialDALFactory(db);
  const aiMcpActivityLogDAL = aiMcpActivityLogDALFactory(db);
  const aiMcpEndpointDAL = aiMcpEndpointDALFactory(db);
  const aiMcpEndpointServerDAL = aiMcpEndpointServerDALFactory(db);
  const aiMcpEndpointServerToolDAL = aiMcpEndpointServerToolDALFactory(db);

  const pamFolderService = pamFolderServiceFactory({
    pamFolderDAL,
    permissionService
  });

  const pamResourceService = pamResourceServiceFactory({
    pamResourceDAL,
    permissionService,
    kmsService,
    gatewayV2Service
  });

  const mfaSessionService = mfaSessionServiceFactory({
    keyStore,
    tokenService,
    smtpService,
    totpService
  });

  const approvalPolicyDAL = approvalPolicyDALFactory(db);
  const pamSessionExpirationService = pamSessionExpirationServiceFactory({
    queueService,
    pamSessionDAL
  });

  const pamAccountService = pamAccountServiceFactory({
    pamAccountDAL,
    gatewayV2Service,
    kmsService,
    pamFolderDAL,
    pamResourceDAL,
    pamSessionDAL,
    permissionService,
    projectDAL,
    orgDAL,
    userDAL,
    auditLogService,
    mfaSessionService,
    tokenService,
    smtpService,
    approvalRequestGrantsDAL,
    approvalPolicyDAL,
    pamSessionExpirationService
  });

  const pamAccountRotation = pamAccountRotationServiceFactory({
    queueService,
    pamAccountService
  });

  const pamSessionService = pamSessionServiceFactory({
    pamSessionDAL,
    projectDAL,
    permissionService,
    kmsService
  });

  const aiMcpServerService = aiMcpServerServiceFactory({
    aiMcpServerDAL,
    aiMcpServerToolDAL,
    aiMcpServerUserCredentialDAL,
    kmsService,
    keyStore,
    permissionService
  });

  const aiMcpActivityLogService = aiMcpActivityLogServiceFactory({
    aiMcpActivityLogDAL,
    permissionService
  });

  const aiMcpEndpointService = aiMcpEndpointServiceFactory({
    aiMcpEndpointDAL,
    aiMcpEndpointServerDAL,
    aiMcpEndpointServerToolDAL,
    aiMcpServerDAL,
    aiMcpServerToolDAL,
    aiMcpServerUserCredentialDAL,
    aiMcpServerService,
    kmsService,
    keyStore,
    authTokenService: tokenService,
    aiMcpActivityLogService,
    userDAL,
    permissionService
  });

  const migrationService = externalMigrationServiceFactory({
    externalMigrationQueue,
    userDAL,
    permissionService,
    gatewayService,
    kmsService,
    appConnectionService,
    vaultExternalMigrationConfigDAL,
    secretService,
    auditLogService
  });

  const approvalPolicyStepsDAL = approvalPolicyStepsDALFactory(db);
  const approvalPolicyStepApproversDAL = approvalPolicyStepApproversDALFactory(db);
  const approvalRequestStepsDAL = approvalRequestStepsDALFactory(db);
  const approvalRequestStepEligibleApproversDAL = approvalRequestStepEligibleApproversDALFactory(db);
  const approvalRequestApprovalsDAL = approvalRequestApprovalsDALFactory(db);

  const approvalPolicyService = approvalPolicyServiceFactory({
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    permissionService,
    projectMembershipDAL,
    approvalRequestDAL,
    approvalRequestStepsDAL,
    approvalRequestStepEligibleApproversDAL,
    approvalRequestApprovalsDAL,
    userGroupMembershipDAL,
    notificationService,
    approvalRequestGrantsDAL
  });

  // setup the communication with license key server
  await licenseService.init();

  // If FIPS is enabled, we check to ensure that the users license includes FIPS mode.
  crypto.verifyFipsLicense(licenseService);

  await superAdminService.initServerCfg();

  // Start HSM service if it's configured/enabled.
  await hsmService.startService();

  const hsmStatus = await isHsmActiveAndEnabled({
    hsmService,
    kmsRootConfigDAL,
    licenseService
  });

  // if the encryption strategy is software - user needs to provide an encryption key
  // if the encryption strategy is null AND the hsm is not configured - user needs to provide an encryption key
  const needsEncryptionKey =
    hsmStatus.rootKmsConfigEncryptionStrategy === RootKeyEncryptionStrategy.Software ||
    (hsmStatus.rootKmsConfigEncryptionStrategy === null && !hsmStatus.isHsmConfigured);

  if (needsEncryptionKey) {
    if (!envConfig.ROOT_ENCRYPTION_KEY && !envConfig.ENCRYPTION_KEY) {
      throw new BadRequestError({
        message:
          "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment.\nYou can enable HSM encryption in the Server Console."
      });
    }
  }

  await kmsService.startService(hsmStatus);
  await telemetryQueue.startTelemetryCheck();
  await telemetryQueue.startAggregatedEventsJob();
  await dailyResourceCleanUp.init();
  await healthAlert.init();
  await pkiSyncCleanup.init();
  await pamAccountRotation.init();
  await pamSessionExpirationService.init();
  await dailyReminderQueueService.startDailyRemindersJob();
  await dailyReminderQueueService.startSecretReminderMigrationJob();
  await dailyExpiringPkiItemAlert.startSendingAlerts();
  await pkiSubscriberQueue.startDailyAutoRenewalJob();
  await pkiAlertV2Queue.init();
  await certificateV3Queue.init();
  await certificateIssuanceQueue.initializeCertificateIssuanceQueue();
  await microsoftTeamsService.start();
  await dynamicSecretQueueService.init();
  await eventBusService.init();

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
    subOrganization: subOrgService,
    oidc: oidcService,
    apiKey: apiKeyService,
    authToken: tokenService,
    superAdmin: superAdminService,
    offlineUsageReport: offlineUsageReportService,
    project: projectService,
    projectMembership: projectMembershipService,
    projectKey: projectKeyService,
    projectEnv: projectEnvService,
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
    identityV1: identityService,
    identityV2: identityV2Service,
    identityAuthTemplate: identityAuthTemplateService,
    identityAccessToken: identityAccessTokenService,
    identityTokenAuth: identityTokenAuthService,
    identityUa: identityUaService,
    identityKubernetesAuth: identityKubernetesAuthService,
    identityGcpAuth: identityGcpAuthService,
    identityAliCloudAuth: identityAliCloudAuthService,
    identityAwsAuth: identityAwsAuthService,
    identityAzureAuth: identityAzureAuthService,
    identityOciAuth: identityOciAuthService,
    identityTlsCertAuth: identityTlsCertAuthService,
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
    certificateV3: certificateV3Service,
    certificateRequest: certificateRequestService,
    certificateEstV3: certificateEstV3Service,
    sshCertificateAuthority: sshCertificateAuthorityService,
    sshCertificateTemplate: sshCertificateTemplateService,
    sshHost: sshHostService,
    sshHostGroup: sshHostGroupService,
    certificateAuthority: certificateAuthorityService,
    internalCertificateAuthority: internalCertificateAuthorityService,
    certificateTemplate: certificateTemplateService,
    certificatePolicy: certificatePolicyService,
    certificateProfile: certificateProfileService,
    certificateAuthorityCrl: certificateAuthorityCrlService,
    certificateEst: certificateEstService,
    pkiAcme: pkiAcmeService,
    pit: pitService,
    pkiAlert: pkiAlertService,
    pkiCollection: pkiCollectionService,
    pkiSubscriber: pkiSubscriberService,
    pkiSync: pkiSyncService,
    pkiTemplate: pkiTemplateService,
    secretScanning: secretScanningService,
    license: licenseService,
    trustedIp: trustedIpService,
    scim: scimService,
    secretBlindIndex: secretBlindIndexService,
    telemetry: telemetryService,
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
    webAuthn: webAuthnService,
    appConnection: appConnectionService,
    secretSync: secretSyncService,
    kmip: kmipService,
    kmipOperation: kmipOperationService,
    gateway: gatewayService,
    relay: relayService,
    gatewayV2: gatewayV2Service,
    secretRotationV2: secretRotationV2Service,
    microsoftTeams: microsoftTeamsService,
    assumePrivileges: assumePrivilegeService,
    githubOrgSync: githubOrgSyncConfigService,
    folderCommit: folderCommitService,
    secretScanningV2: secretScanningV2Service,
    reminder: reminderService,
    bus: eventBusService,
    sse: sseService,
    notification: notificationService,
    pamFolder: pamFolderService,
    pamResource: pamResourceService,
    pamAccount: pamAccountService,
    pamSession: pamSessionService,
    mfaSession: mfaSessionService,
    upgradePath: upgradePathService,

    membershipUser: membershipUserService,
    membershipIdentity: membershipIdentityService,
    membershipGroup: membershipGroupService,
    role: roleService,
    additionalPrivilege: additionalPrivilegeService,
    identityProject: identityProjectService,
    convertor: convertorService,
    pkiAlertV2: pkiAlertV2Service,
    aiMcpServer: aiMcpServerService,
    aiMcpEndpoint: aiMcpEndpointService,
    aiMcpActivityLog: aiMcpActivityLogService,
    approvalPolicy: approvalPolicyService
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

    const adminIntegrationsSyncJob = await superAdminService.initializeAdminIntegrationConfigSync();
    if (adminIntegrationsSyncJob) {
      cronJobs.push(adminIntegrationsSyncJob);
    }
  }

  const configSyncJob = await superAdminService.initializeEnvConfigSync();
  if (configSyncJob) {
    cronJobs.push(configSyncJob);
  }

  const oauthConfigSyncJob = await initializeOauthConfigSync();
  if (oauthConfigSyncJob) {
    cronJobs.push(oauthConfigSyncJob);
  }

  server.decorate<FastifyZodProvider["store"]>("store", {
    user: userDAL,
    kmipClient: kmipClientDAL
  });
  const shouldForwardWritesToPrimaryInstance = Boolean(envConfig.INFISICAL_PRIMARY_INSTANCE_URL);
  if (shouldForwardWritesToPrimaryInstance) {
    logger.info(`Infisical primary instance is configured: ${envConfig.INFISICAL_PRIMARY_INSTANCE_URL}`);

    await server.register(forwardWritesToPrimary, { primaryUrl: envConfig.INFISICAL_PRIMARY_INSTANCE_URL as string });
  }

  await server.register(injectIdentity, { shouldForwardWritesToPrimaryInstance });
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
          samlDefaultOrgSlug: z.string().optional(),
          auditLogStorageDisabled: z.boolean().optional()
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
        samlDefaultOrgSlug: cfg.samlDefaultOrgSlug,
        auditLogStorageDisabled: Boolean(cfg.DISABLE_AUDIT_LOG_STORAGE)
      };
    }
  });

  // register special routes
  await server.register(registerCertificateEstRouter, { prefix: "/.well-known/est" });
  await server.register(registerMcpEndpointMetadataRouter, { prefix: "/mcp-endpoints" });
  await server.register(registerMcpEndpointAuthServerMetadataRouter, {
    prefix: "/.well-known/oauth-authorization-server"
  });

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
  await server.register(registerV4Routes, { prefix: "/api/v4" });

  // Note: This is a special route for BDD tests. It's only available in development mode and only for BDD tests.
  // This route should NEVER BE ENABLED IN PRODUCTION!
  if (getConfig().isBddNockApiEnabled) {
    await server.register(registerBddNockRouter, { prefix: "/api/__bdd_nock__" });
  }

  server.addHook("onClose", async () => {
    cronJobs.forEach((job) => job.stop());
    await telemetryService.flushAll();
    await eventBusService.close();
    sseService.close();
  });
};
