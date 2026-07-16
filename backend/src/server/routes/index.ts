import { registerBddNockRouter } from "@bdd_routes/bdd-nock-router";
import type { ClickHouseClient } from "@clickhouse/client";
import { CronJob } from "cron";
import { Cluster, Redis } from "ioredis";
import { Knex } from "knex";
import { monitorEventLoopDelay } from "perf_hooks";
import { z } from "zod";

import {
  registerMcpEndpointAuthServerMetadataRouter,
  registerMcpEndpointMetadataRouter,
  registerRfc9728ProtectedResourceMetadataRouter
} from "@app/ee/routes/ai/mcp-endpoint-metadata-router";
import { registerCertificateEstRouter } from "@app/ee/routes/est/certificate-est-router";
import { registerPkiScepRouter } from "@app/ee/routes/scep/pki-scep-router";
import { registerV1EERoutes } from "@app/ee/routes/v1";
import { registerV2EERoutes } from "@app/ee/routes/v2";
import { registerV3EERoutes } from "@app/ee/routes/v3";
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
import { agentProxyCaServiceFactory } from "@app/ee/services/agent-proxy-ca/agent-proxy-ca-service";
import { orgAgentProxyConfigDALFactory } from "@app/ee/services/agent-proxy-ca/org-agent-proxy-config-dal";
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
import { clickhouseAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-clickhouse-dal";
import { auditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { auditLogQueueServiceFactory } from "@app/ee/services/audit-log/audit-log-queue";
import { auditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-service";
import { auditLogStreamDALFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-dal";
import { auditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
import { auditLogStreamOutboxDALFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-dal";
import { auditLogStreamOutboxQueueFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-queue";
import { auditLogStreamOutboxServiceFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-service";
import { auditReportDALFactory } from "@app/ee/services/audit-report/audit-report-dal";
import { auditReportQueueServiceFactory } from "@app/ee/services/audit-report/audit-report-queue";
import { auditReportServiceFactory } from "@app/ee/services/audit-report/audit-report-service";
import { certificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { certificateAuthorityCrlServiceFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-service";
import { certificateEstServiceFactory } from "@app/ee/services/certificate-est/certificate-est-service";
import { dynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { dynamicSecretServiceFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-service";
import { buildDynamicSecretProviders } from "@app/ee/services/dynamic-secret/providers";
import { dynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { dynamicSecretLeaseQueueServiceFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-queue";
import { dynamicSecretLeaseServiceFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-service";
import { emailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { emailDomainServiceFactory } from "@app/ee/services/email-domain/email-domain-service";
import { eventBusServiceFactory } from "@app/ee/services/event-bus/event-bus-service";
import { externalKmsDALFactory } from "@app/ee/services/external-kms/external-kms-dal";
import { externalKmsServiceFactory } from "@app/ee/services/external-kms/external-kms-service";
import { gatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { gatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { orgGatewayConfigDALFactory } from "@app/ee/services/gateway/org-gateway-config-dal";
import { gatewayPoolDalFactory } from "@app/ee/services/gateway-pool/gateway-pool-dal";
import { gatewayPoolMembershipDalFactory } from "@app/ee/services/gateway-pool/gateway-pool-membership-dal";
import { gatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { gatewayV2DalFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { gatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { orgGatewayConfigV2DalFactory } from "@app/ee/services/gateway-v2/org-gateway-config-v2-dal";
import { githubOrgSyncDALFactory } from "@app/ee/services/github-org-sync/github-org-sync-dal";
import { githubOrgSyncServiceFactory } from "@app/ee/services/github-org-sync/github-org-sync-service";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { groupServiceFactory } from "@app/ee/services/group/group-service";
import { identityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { honeyTokenDALFactory } from "@app/ee/services/honey-token/honey-token-dal";
import { honeyTokenEventDALFactory } from "@app/ee/services/honey-token/honey-token-event-dal";
import { honeyTokenServiceFactory } from "@app/ee/services/honey-token/honey-token-service";
import { honeyTokenConfigDALFactory } from "@app/ee/services/honey-token-config/honey-token-config-dal";
import { honeyTokenConfigServiceFactory } from "@app/ee/services/honey-token-config/honey-token-config-service";
import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { identityAuthTemplateDALFactory } from "@app/ee/services/identity-auth-template/identity-auth-template-dal";
import { identityAuthTemplateServiceFactory } from "@app/ee/services/identity-auth-template/identity-auth-template-service";
import { insightsServiceFactory } from "@app/ee/services/insights/insights-service";
import { kmipClientCertificateDALFactory } from "@app/ee/services/kmip/kmip-client-certificate-dal";
import { kmipClientDALFactory } from "@app/ee/services/kmip/kmip-client-dal";
import { kmipOperationServiceFactory } from "@app/ee/services/kmip/kmip-operation-service";
import { kmipOrgConfigDALFactory } from "@app/ee/services/kmip/kmip-org-config-dal";
import { kmipOrgServerCertificateDALFactory } from "@app/ee/services/kmip/kmip-org-server-certificate-dal";
import { kmipServiceFactory } from "@app/ee/services/kmip/kmip-service";
import { kmipServerDALFactory } from "@app/ee/services/kmip-server/kmip-server-dal";
import { kmipServerServiceFactory } from "@app/ee/services/kmip-server/kmip-server-service";
import { ldapConfigDALFactory } from "@app/ee/services/ldap-config/ldap-config-dal";
import { ldapConfigServiceFactory } from "@app/ee/services/ldap-config/ldap-config-service";
import { ldapGroupMapDALFactory } from "@app/ee/services/ldap-config/ldap-group-map-dal";
import { licenseDALFactory } from "@app/ee/services/license/license-dal";
import { licenseServiceFactory } from "@app/ee/services/license/license-service";
import { licenseV2ServiceFactory } from "@app/ee/services/license-v2/license-v2-service";
import { oidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { oidcConfigServiceFactory } from "@app/ee/services/oidc/oidc-config-service";
import { pamAuditLogScopeResolverFactory } from "@app/ee/services/pam/pam-audit-log-fns";
import { pamAccessRequestServiceFactory } from "@app/ee/services/pam-access-request/pam-access-request-service";
import { pamFolderNotificationConfigDALFactory } from "@app/ee/services/pam-access-request/pam-folder-notification-config-dal";
import { pamAccountDALFactory } from "@app/ee/services/pam-account/pam-account-dal";
import { pamAccountServiceFactory } from "@app/ee/services/pam-account/pam-account-service";
import { pamAccountRotationQueueServiceFactory } from "@app/ee/services/pam-account-rotation/pam-account-rotation-queue";
import { pamAccountRotationServiceFactory } from "@app/ee/services/pam-account-rotation/pam-account-rotation-service";
import { pamAccountTemplateDALFactory } from "@app/ee/services/pam-account-template/pam-account-template-dal";
import { pamAccountTemplateServiceFactory } from "@app/ee/services/pam-account-template/pam-account-template-service";
import { pamDiscoveredAccountDALFactory } from "@app/ee/services/pam-discovery/pam-discovered-account-dal";
import { pamDiscoverySourceDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-dal";
import { pamDiscoverySourceRunDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-run-dal";
import { pamDiscoverySourceServiceFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-service";
import { pamFolderDALFactory } from "@app/ee/services/pam-folder/pam-folder-dal";
import { pamFolderServiceFactory } from "@app/ee/services/pam-folder/pam-folder-service";
import { pamMembershipServiceFactory } from "@app/ee/services/pam-membership/pam-membership-service";
import { pamProjectResolverFactory } from "@app/ee/services/pam-project/pam-project-resolver";
import { pamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { pamSessionExpirationServiceFactory } from "@app/ee/services/pam-session/pam-session-expiration-queue";
import { pamSessionServiceFactory } from "@app/ee/services/pam-session/pam-session-service";
import { pamSessionEventChunkDALFactory } from "@app/ee/services/pam-session-recording/pam-recording-chunk-dal";
import { pamSessionChunkServiceFactory } from "@app/ee/services/pam-session-recording/pam-recording-chunk-service";
import { pamWebAccessServiceFactory } from "@app/ee/services/pam-web-access/pam-web-access-service";
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
import { pkiCertificateInstallationCertDALFactory } from "@app/ee/services/pki-discovery/pki-certificate-installation-cert-dal";
import { pkiCertificateInstallationDALFactory } from "@app/ee/services/pki-discovery/pki-certificate-installation-dal";
import { pkiDiscoveryConfigDALFactory } from "@app/ee/services/pki-discovery/pki-discovery-config-dal";
import { pkiDiscoveryInstallationDALFactory } from "@app/ee/services/pki-discovery/pki-discovery-installation-dal";
import { pkiDiscoveryQueueFactory } from "@app/ee/services/pki-discovery/pki-discovery-queue";
import { pkiDiscoveryScanHistoryDALFactory } from "@app/ee/services/pki-discovery/pki-discovery-scan-history-dal";
import { pkiDiscoveryServiceFactory } from "@app/ee/services/pki-discovery/pki-discovery-service";
import { pkiInstallationServiceFactory } from "@app/ee/services/pki-discovery/pki-installation-service";
import { scepDynamicChallengeDALFactory } from "@app/ee/services/pki-scep/pki-scep-dynamic-challenge-dal";
import { pkiScepServiceFactory } from "@app/ee/services/pki-scep/pki-scep-service";
import { scepTransactionDALFactory } from "@app/ee/services/pki-scep/pki-scep-transaction-dal";
import { projectEventsServiceFactory } from "@app/ee/services/project-events/project-events-service";
import { projectEventsSSEServiceFactory } from "@app/ee/services/project-events/project-events-sse-service";
import { projectTemplateDALFactory } from "@app/ee/services/project-template/project-template-dal";
import { projectTemplateGroupMembershipDALFactory } from "@app/ee/services/project-template/project-template-group-membership-dal";
import { projectTemplateIdentityMembershipDALFactory } from "@app/ee/services/project-template/project-template-identity-membership-dal";
import { projectTemplateServiceFactory } from "@app/ee/services/project-template/project-template-service";
import { projectTemplateUserMembershipDALFactory } from "@app/ee/services/project-template/project-template-user-membership-dal";
import { proxiedServiceCredentialDALFactory } from "@app/ee/services/proxied-service/proxied-service-credential-dal";
import { proxiedServiceDALFactory } from "@app/ee/services/proxied-service/proxied-service-dal";
import { proxiedServiceServiceFactory } from "@app/ee/services/proxied-service/proxied-service-service";
import { rateLimitDALFactory } from "@app/ee/services/rate-limit/rate-limit-dal";
import { rateLimitServiceFactory } from "@app/ee/services/rate-limit/rate-limit-service";
import { instanceRelayConfigDalFactory } from "@app/ee/services/relay/instance-relay-config-dal";
import { orgRelayConfigDalFactory } from "@app/ee/services/relay/org-relay-config-dal";
import { relayDalFactory } from "@app/ee/services/relay/relay-dal";
import { relayServiceFactory } from "@app/ee/services/relay/relay-service";
import { resourceAwsAuthDALFactory } from "@app/ee/services/resource-auth-method/aws-auth-dal";
import { resourceAuthMethodDALFactory } from "@app/ee/services/resource-auth-method/resource-auth-method-dal";
import { resourceAuthMethodServiceFactory } from "@app/ee/services/resource-auth-method/resource-auth-method-service";
import { resourceTokenAuthDALFactory } from "@app/ee/services/resource-auth-method/token-auth-dal";
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
import { cronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { Redlock } from "@app/lib/red-lock";
import { TQueueServiceFactory } from "@app/queue";
import { readLimit } from "@app/server/config/rateLimiter";
import { registerSecretScanningV2Webhooks } from "@app/server/plugins/secret-scanner-v2";
import { accessTokenQueueServiceFactory } from "@app/services/access-token-queue/access-token-queue";
import { accountRecoveryServiceFactory } from "@app/services/account-recovery/account-recovery-service";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { additionalPrivilegeServiceFactory } from "@app/services/additional-privilege/additional-privilege-service";
import { announcementServiceFactory } from "@app/services/announcement/announcement-service";
import { appConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { appConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import {
  appConnectionCredentialRotationDALFactory,
  appConnectionCredentialRotationQueueFactory,
  appConnectionCredentialRotationServiceFactory
} from "@app/services/app-connection/credential-rotation";
import {
  approvalPolicyBypassersDALFactory,
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
import { mfaLockoutServiceFactory } from "@app/services/auth/mfa-lockout-service";
import { tokenDALFactory } from "@app/services/auth-token/auth-token-dal";
import { tokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { certManagerExportServiceFactory } from "@app/services/cert-manager-export/cert-manager-export-service";
import { certManagerInstanceServiceFactory } from "@app/services/cert-manager-instance/cert-manager-instance-service";
import { certManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import { certificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { certificateDALFactory } from "@app/services/certificate/certificate-dal";
import { certificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { certificateServiceFactory } from "@app/services/certificate/certificate-service";
import { caAutoRenewalQueueFactory } from "@app/services/certificate-authority/ca-auto-renewal-queue";
import { caSigningConfigDALFactory } from "@app/services/certificate-authority/ca-signing-config/ca-signing-config-dal";
import { caSigningConfigServiceFactory } from "@app/services/certificate-authority/ca-signing-config/ca-signing-config-service";
import { certificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { certificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { certificateAuthorityQueueFactory } from "@app/services/certificate-authority/certificate-authority-queue";
import { certificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { certificateAuthorityServiceFactory } from "@app/services/certificate-authority/certificate-authority-service";
import { certificateIssuanceQueueFactory } from "@app/services/certificate-authority/certificate-issuance-queue";
import { DigiCertCertificateAuthorityFns } from "@app/services/certificate-authority/digicert/digicert-certificate-authority-fns";
import { digicertCertificateAuthorityQueueServiceFactory } from "@app/services/certificate-authority/digicert/digicert-certificate-authority-queue";
import { digicertRevocationSyncQueueFactory } from "@app/services/certificate-authority/digicert/digicert-revocation-sync-queue";
import { externalCertificateAuthorityDALFactory } from "@app/services/certificate-authority/external-certificate-authority-dal";
import { GoDaddyCertificateAuthorityFns } from "@app/services/certificate-authority/godaddy/godaddy-certificate-authority-fns";
import { godaddyCertificateAuthorityQueueServiceFactory } from "@app/services/certificate-authority/godaddy/godaddy-certificate-authority-queue";
import { internalCertificateAuthorityDALFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-dal";
import { InternalCertificateAuthorityFns } from "@app/services/certificate-authority/internal/internal-certificate-authority-fns";
import { internalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { certificateCleanupConfigDALFactory } from "@app/services/certificate-cleanup/certificate-cleanup-dal";
import { certificateCleanupQueueFactory } from "@app/services/certificate-cleanup/certificate-cleanup-queue";
import { certificateCleanupServiceFactory } from "@app/services/certificate-cleanup/certificate-cleanup-service";
import { certificateEstV3ServiceFactory } from "@app/services/certificate-est-v3/certificate-est-v3-service";
import { certificateInventoryViewDALFactory } from "@app/services/certificate-inventory-view/certificate-inventory-view-dal";
import { certificateInventoryViewServiceFactory } from "@app/services/certificate-inventory-view/certificate-inventory-view-service";
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
import { certificateApprovalServiceFactory } from "@app/services/certificate-v3/certificate-approval-fns";
import { certificateV3QueueServiceFactory } from "@app/services/certificate-v3/certificate-v3-queue";
import { certificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { cmekServiceFactory } from "@app/services/cmek/cmek-service";
import { convertorServiceFactory } from "@app/services/convertor/convertor-service";
import { acmeEnrollmentConfigDALFactory } from "@app/services/enrollment-config/acme-enrollment-config-dal";
import { apiEnrollmentConfigDALFactory } from "@app/services/enrollment-config/api-enrollment-config-dal";
import { estEnrollmentConfigDALFactory } from "@app/services/enrollment-config/est-enrollment-config-dal";
import { scepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
import { externalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { externalGroupOrgRoleMappingServiceFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-service";
import { externalMigrationQueueFactory } from "@app/services/external-migration/external-migration-queue";
import { externalMigrationServiceFactory } from "@app/services/external-migration/external-migration-service";
import { folderCheckpointDALFactory } from "@app/services/folder-checkpoint/folder-checkpoint-dal";
import { folderCheckpointResourcesDALFactory } from "@app/services/folder-checkpoint-resources/folder-checkpoint-resources-dal";
import { folderCommitDALFactory } from "@app/services/folder-commit/folder-commit-dal";
import { folderCommitQueueServiceFactory } from "@app/services/folder-commit/folder-commit-queue";
import { folderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { folderCommitChangesDALFactory } from "@app/services/folder-commit-changes/folder-commit-changes-dal";
import { folderTreeCheckpointDALFactory } from "@app/services/folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { folderTreeCheckpointResourcesDALFactory } from "@app/services/folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { gitHubAppDALFactory } from "@app/services/github-app/github-app-dal";
import { gitHubAppServiceFactory } from "@app/services/github-app/github-app-service";
import { groupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { groupProjectServiceFactory } from "@app/services/group-project/group-project-service";
import { healthAlertServiceFactory } from "@app/services/health-alert/health-alert-queue";
import { hsmConnectorDALFactory } from "@app/services/hsm-connector/hsm-connector-dal";
import { hsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { identityMetadataDALFactory } from "@app/services/identity/identity-metadata-dal";
import { identityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { identityServiceFactory } from "@app/services/identity/identity-service";
import { identityAccessTokenDALFactory } from "@app/services/identity-access-token/identity-access-token-dal";
import { identityAccessTokenRevocationDALFactory } from "@app/services/identity-access-token/identity-access-token-revocation-dal";
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
import { identitySpiffeAuthDALFactory } from "@app/services/identity-spiffe-auth/identity-spiffe-auth-dal";
import { identitySpiffeAuthServiceFactory } from "@app/services/identity-spiffe-auth/identity-spiffe-auth-service";
import { identityTlsCertAuthDALFactory } from "@app/services/identity-tls-cert-auth/identity-tls-cert-auth-dal";
import { identityTlsCertAuthServiceFactory } from "@app/services/identity-tls-cert-auth/identity-tls-cert-auth-service";
import { identityTokenAuthDALFactory } from "@app/services/identity-token-auth/identity-token-auth-dal";
import { identityTokenAuthServiceFactory } from "@app/services/identity-token-auth/identity-token-auth-service";
import { identityUaClientSecretDALFactory } from "@app/services/identity-ua/identity-ua-client-secret-dal";
import { identityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";
import { identityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { identityV2DALFactory } from "@app/services/identity-v2/identity-dal";
import { identityMembershipV2DALFactory } from "@app/services/identity-v2/identity-membership-dal";
import { identityV2ServiceFactory } from "@app/services/identity-v2/identity-service";
import { integrationDALFactory } from "@app/services/integration/integration-dal";
import { integrationServiceFactory } from "@app/services/integration/integration-service";
import { integrationAuthDALFactory } from "@app/services/integration-auth/integration-auth-dal";
import { integrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";
import { licenseClientFactory } from "@app/services/license-client";
import { dualReadServiceFactory } from "@app/services/license-client/dual-read/dual-read-service";
import {
  buildMeteredFeatures,
  buildUsageReporter,
  usageCounterDALFactory,
  usageEventQueueFactory,
  usageMeteringServiceFactory
} from "@app/services/license-client/usage";
import { applicationMembershipCleanupServiceFactory } from "@app/services/membership/application-membership-cleanup-service";
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { membershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { membershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { membershipGroupServiceFactory } from "@app/services/membership-group/membership-group-service";
import { membershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { membershipIdentityServiceFactory } from "@app/services/membership-identity/membership-identity-service";
import { membershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { membershipUserServiceFactory } from "@app/services/membership-user/membership-user-service";
import { mfaRecoveryCodeDALFactory } from "@app/services/mfa-recovery-code/mfa-recovery-code-dal";
import { mfaRecoveryCodeServiceFactory } from "@app/services/mfa-recovery-code/mfa-recovery-code-service";
import { mfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { microsoftTeamsIntegrationDALFactory } from "@app/services/microsoft-teams/microsoft-teams-integration-dal";
import { microsoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { projectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { notificationQueueServiceFactory } from "@app/services/notification/notification-queue";
import { notificationServiceFactory } from "@app/services/notification/notification-service";
import { userNotificationDALFactory } from "@app/services/notification/user-notification-dal";
import { oauthClientDALFactory } from "@app/services/oauth-client/oauth-client-dal";
import { oauthClientServiceFactory } from "@app/services/oauth-client/oauth-client-service";
import { offlineUsageReportDALFactory } from "@app/services/offline-usage-report/offline-usage-report-dal";
import { offlineUsageReportServiceFactory } from "@app/services/offline-usage-report/offline-usage-report-service";
import { incidentContactDALFactory } from "@app/services/org/incident-contacts-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { orgServiceFactory } from "@app/services/org/org-service";
import { orgAdminServiceFactory } from "@app/services/org-admin/org-admin-service";
import { orgAssetDALFactory } from "@app/services/org-asset/org-asset-dal";
import { orgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { orgProductStatsDALFactory } from "@app/services/org-product-stats/org-product-stats-dal";
import { orgProductStatsServiceFactory } from "@app/services/org-product-stats/org-product-stats-service";
import { dailyExpiringPkiItemAlertQueueServiceFactory } from "@app/services/pki-alert/expiring-pki-item-alert-queue";
import { pkiAlertDALFactory } from "@app/services/pki-alert/pki-alert-dal";
import { pkiAlertServiceFactory } from "@app/services/pki-alert/pki-alert-service";
import { pkiAlertChannelDALFactory } from "@app/services/pki-alert-v2/pki-alert-channel-dal";
import { pkiAlertHistoryDALFactory } from "@app/services/pki-alert-v2/pki-alert-history-dal";
import { pkiAlertV2DALFactory } from "@app/services/pki-alert-v2/pki-alert-v2-dal";
import { pkiAlertV2QueueServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-queue";
import { pkiAlertV2ServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-service";
import { pkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { pkiApplicationEnrollmentServiceFactory } from "@app/services/pki-application/pki-application-enrollment-service";
import { pkiApplicationMembershipServiceFactory } from "@app/services/pki-application/pki-application-membership-service";
import { pkiApplicationProfileDALFactory } from "@app/services/pki-application/pki-application-profile-dal";
import { pkiApplicationServiceFactory } from "@app/services/pki-application/pki-application-service";
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
import { projectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { projectCleanupQueueFactory } from "@app/services/project/project-cleanup-queue";
import { projectDALFactory } from "@app/services/project/project-dal";
import { projectQueueFactory } from "@app/services/project/project-queue";
import { projectServiceFactory } from "@app/services/project/project-service";
import { projectSshConfigDALFactory } from "@app/services/project/project-ssh-config-dal";
import { projectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { projectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { projectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { projectEnvQueueFactory } from "@app/services/project-env/project-env-queue";
import { projectEnvServiceFactory } from "@app/services/project-env/project-env-service";
import { projectFolderGrantDALFactory } from "@app/services/project-folder-grant/project-folder-grant-dal";
import { projectFolderGrantServiceFactory } from "@app/services/project-folder-grant/project-folder-grant-service";
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
import { secretValidationRuleDALFactory } from "@app/services/secret-validation-rule/secret-validation-rule-dal";
import { secretValidationRuleServiceFactory } from "@app/services/secret-validation-rule/secret-validation-rule-service";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { serviceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import {
  signerDALFactory,
  signerRequestDALFactory,
  signerServiceFactory,
  signingOperationDALFactory
} from "@app/services/signer";
import { signerAutoRenewalQueueFactory } from "@app/services/signer/signer-auto-renewal-queue";
import { signerIssuanceJobDALFactory } from "@app/services/signer/signer-issuance-job-dal";
import { signerIssuanceServiceFactory } from "@app/services/signer/signer-issuance-service";
import { signerPolicyServiceFactory } from "@app/services/signer/signer-policy-service";
import { signerMembershipServiceFactory } from "@app/services/signer-membership";
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
import { userDALFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";
import { userActivationDALFactory } from "@app/services/user-activation/user-activation-dal";
import { userActivationServiceFactory } from "@app/services/user-activation/user-activation-service";
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
import { goSidecarPlugin } from "../plugins/go-sidecar";
// import { forwardToGoSidecar } from "../plugins/go-sidecar-forwarding";
import { shadowToGoSidecar } from "../plugins/go-sidecar-shadowing";
import { injectPamProjectId } from "../plugins/inject-pam-project-id";
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
    redis,
    clickhouse,
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
    redis: Redis | Cluster;
    clickhouse: ClickHouseClient | null;
    envConfig: TEnvConfig;
    hsmService: THsmServiceFactory;
    kmsRootConfigDAL: TKmsRootConfigDALFactory;
  }
) => {
  const appCfg = getConfig();

  const redlock = new Redlock([redis], { retryCount: 0 });
  const cronJob = cronJobFactory({ redis, redlock });
  cronJob.start();

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
  const userActivationDAL = userActivationDALFactory(db);
  const incidentContactDAL = incidentContactDALFactory(db);
  const rateLimitDAL = rateLimitDALFactory(db);

  const projectDAL = projectDALFactory(db);
  const projectAccessRequestDAL = projectAccessRequestDALFactory(db);
  const projectSshConfigDAL = projectSshConfigDALFactory(db);
  const projectMembershipDAL = projectMembershipDALFactory(db);
  const projectEnvDAL = projectEnvDALFactory(db);
  const projectKeyDAL = projectKeyDALFactory(db);
  const projectBotDAL = projectBotDALFactory(db);

  const secretDAL = secretDALFactory(db);
  const secretTagDAL = secretTagDALFactory(db);
  const secretValidationRuleDAL = secretValidationRuleDALFactory(db);
  const folderDAL = secretFolderDALFactory(db);
  const folderVersionDAL = secretFolderVersionDALFactory(db);
  const secretImportDAL = secretImportDALFactory(db);
  const projectFolderGrantDAL = projectFolderGrantDALFactory(db);
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
  const orgProductStatsDAL = orgProductStatsDALFactory(db);
  const integrationAuthDAL = integrationAuthDALFactory(db);
  const webhookDAL = webhookDALFactory(db);
  const serviceTokenDAL = serviceTokenDALFactory(db);

  const identityDAL = identityDALFactory(db);
  const identityV2DAL = identityV2DALFactory(db);
  const identityMembershipV2DAL = identityMembershipV2DALFactory(db);
  const identityMetadataDAL = identityMetadataDALFactory(db);
  const identityAccessTokenDAL = identityAccessTokenDALFactory(db);
  const identityAccessTokenRevocationDAL = identityAccessTokenRevocationDALFactory(db);
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
  const identitySpiffeAuthDAL = identitySpiffeAuthDALFactory(db);
  const identityAzureAuthDAL = identityAzureAuthDALFactory(db);
  const identityLdapAuthDAL = identityLdapAuthDALFactory(db);

  const auditLogDAL = auditLogDALFactory(auditLogDb ?? db);
  const auditLogStreamDAL = auditLogStreamDALFactory(db);
  const auditLogStreamOutboxDAL = auditLogStreamOutboxDALFactory(db);
  const trustedIpDAL = trustedIpDALFactory(db);
  const telemetryDAL = telemetryDALFactory(db);
  const appConnectionDAL = appConnectionDALFactory(db);
  const hsmConnectorDAL = hsmConnectorDALFactory(db);
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
  const emailDomainDAL = emailDomainDALFactory(db);

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
  const internalKmsKeyVersionDAL = internalKmsKeyVersionDALFactory(db);
  const externalKmsDAL = externalKmsDALFactory(db);

  const slackIntegrationDAL = slackIntegrationDALFactory(db);
  const projectSlackConfigDAL = projectSlackConfigDALFactory(db);
  const workflowIntegrationDAL = workflowIntegrationDALFactory(db);
  const totpConfigDAL = totpConfigDALFactory(db);
  const webAuthnCredentialDAL = webAuthnCredentialDALFactory(db);
  const mfaRecoveryCodeDAL = mfaRecoveryCodeDALFactory(db);

  const externalGroupOrgRoleMappingDAL = externalGroupOrgRoleMappingDALFactory(db);

  const projectTemplateDAL = projectTemplateDALFactory(db);
  const projectTemplateUserMembershipDAL = projectTemplateUserMembershipDALFactory(db);
  const projectTemplateGroupMembershipDAL = projectTemplateGroupMembershipDALFactory(db);
  const projectTemplateIdentityMembershipDAL = projectTemplateIdentityMembershipDALFactory(db);
  const resourceMetadataDAL = resourceMetadataDALFactory(db);
  const kmipClientDAL = kmipClientDALFactory(db);
  const kmipClientCertificateDAL = kmipClientCertificateDALFactory(db);
  const kmipOrgConfigDAL = kmipOrgConfigDALFactory(db);
  const kmipOrgServerCertificateDAL = kmipOrgServerCertificateDALFactory(db);

  const orgGatewayConfigDAL = orgGatewayConfigDALFactory(db);
  const gatewayDAL = gatewayDALFactory(db);
  const secretReminderRecipientsDAL = secretReminderRecipientsDALFactory(db);
  const githubOrgSyncDAL = githubOrgSyncDALFactory(db);
  const gitHubAppDAL = gitHubAppDALFactory(db);
  const honeyTokenConfigDAL = honeyTokenConfigDALFactory(db);
  const honeyTokenDAL = honeyTokenDALFactory(db);
  const honeyTokenEventDAL = honeyTokenEventDALFactory(db);

  const proxiedServiceDAL = proxiedServiceDALFactory(db);
  const proxiedServiceCredentialDAL = proxiedServiceCredentialDALFactory(db);
  const orgAgentProxyConfigDAL = orgAgentProxyConfigDALFactory(db);

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
  const approvalPolicyDAL = approvalPolicyDALFactory(db);
  const roleDAL = roleDALFactory(db);
  const pkiAlertHistoryDAL = pkiAlertHistoryDALFactory(db);
  const pkiAlertChannelDAL = pkiAlertChannelDALFactory(db);
  const pkiAlertV2DAL = pkiAlertV2DALFactory(db);

  const appConnectionCredentialRotationDAL = appConnectionCredentialRotationDALFactory(db);

  // New event bus for inter-container communication
  const eventBusService = eventBusServiceFactory({ redis: server.redis });

  // Project events service (publishes via event bus for inter-container communication)
  const projectEventsService = projectEventsServiceFactory({ eventBus: eventBusService });

  const permissionService = permissionServiceFactory({
    permissionDAL,
    serviceTokenDAL,
    projectDAL,
    keyStore,
    roleDAL,
    userDAL,
    identityDAL,
    additionalPrivilegeDAL,
    groupDAL
  });

  const assumePrivilegeService = assumePrivilegeServiceFactory({
    permissionService
  });

  // License Server v2 client SDK. Coexists with licenseService during migration - getFeature()
  // is the single read primitive; falls back to feature defaults until the server is configured.
  const licenseClient = licenseClientFactory({ envConfig, keyStore });

  // Shadow-compares v1 getPlan against v2 entitlements in read-compare mode; reads v2 via the real SDK.
  const licenseDualRead = dualReadServiceFactory({ licenseClient, envConfig });

  const licenseService = licenseServiceFactory({
    permissionService,
    orgDAL,
    licenseDAL,
    keyStore,
    projectDAL,
    envConfig,
    licenseClient,
    licenseDualRead
  });

  // Usage metering: counts the 5 metered features and reports them to the License Server. Inert while
  // LICENSE_SERVER_V2_MODE is off; active in read-compare and on (emitter no-ops / worker no-ops without a reporter).
  const usageCounterDAL = usageCounterDALFactory(db);
  const meteredFeatures = buildMeteredFeatures({ licenseDAL, usageCounterDAL });
  meteredFeatures.forEach(({ feature, count }) => licenseClient.registerCounter(feature, count));
  const usageReporter = buildUsageReporter(envConfig);
  const usageMeteringService = usageMeteringServiceFactory({ queueService, projectDAL, envConfig });
  let usageSource = "self-hosted";
  if (envConfig.isCloud) {
    usageSource = "cloud";
  }
  const usageEventQueue = usageEventQueueFactory({
    queueService,
    cronJob,
    keyStore,
    orgDAL,
    usageMeteringService,
    meteredFeatures,
    usageReporter,
    source: usageSource
  });

  // Flag-gated v2 billing surface. Drives the catalog, subscription, and entitlement reads off the
  // real license server via licenseClient; no new tables.
  const licenseV2Service = licenseV2ServiceFactory({
    envConfig,
    orgDAL,
    identityOrgMembershipDAL,
    permissionService,
    licenseClient,
    meteredFeatures
  });

  // Project events SSE service (for clients to subscribe to secret mutation events)
  const projectEventsSSEService = projectEventsSSEServiceFactory({
    projectEventsService,
    permissionService,
    licenseService,
    keyStore,
    projectEnvDAL
  });

  const tokenService = tokenServiceFactory({ tokenDAL: authTokenDAL, userDAL, membershipUserDAL, orgDAL, keyStore });

  const applicationMembershipCleanupService = applicationMembershipCleanupServiceFactory({
    membershipDAL,
    approvalPolicyDAL
  });

  const oauthClientDAL = oauthClientDALFactory(db);
  const oauthClientService = oauthClientServiceFactory({
    oauthClientDAL,
    permissionService,
    keyStore,
    tokenService,
    orgDAL,
    userDAL
  });

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
    additionalPrivilegeDAL,
    projectAccessRequestDAL,
    applicationMembershipCleanupService,
    approvalPolicyDAL,
    emailDomainDAL,
    oidcConfigDAL,
    samlConfigDAL
  });

  const membershipIdentityService = membershipIdentityServiceFactory({
    identityDAL,
    membershipIdentityDAL,
    membershipRoleDAL,
    orgDAL,
    permissionService,
    roleDAL,
    additionalPrivilegeDAL,
    licenseService,
    applicationMembershipCleanupService,
    projectDAL,
    keyStore
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
    orgDAL,
    groupDAL,
    licenseService,
    applicationMembershipCleanupService,
    projectDAL
  });

  const roleService = roleServiceFactory({
    permissionService,
    roleDAL,
    projectDAL,
    identityDAL,
    userDAL,
    externalGroupOrgRoleMappingDAL,
    membershipRoleDAL,
    licenseService
  });
  const additionalPrivilegeService = additionalPrivilegeServiceFactory({
    additionalPrivilegeDAL,
    membershipDAL,
    orgDAL,
    permissionService,
    userDAL
  });

  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    kmsDAL,
    internalKmsDAL,
    internalKmsKeyVersionDAL,
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

  const notificationQueue = notificationQueueServiceFactory({
    userNotificationDAL,
    queueService
  });

  const notificationService = notificationServiceFactory({ notificationQueue, userNotificationDAL });

  const auditLogStreamService = auditLogStreamServiceFactory({
    licenseService,
    permissionService,
    auditLogStreamDAL,
    kmsService
  });

  const auditLogStreamOutboxService = auditLogStreamOutboxServiceFactory({
    auditLogStreamOutboxDAL,
    auditLogStreamDAL,
    projectDAL,
    kmsService,
    keyStore,
    queueService
  });

  const auditLogStreamOutboxQueue = auditLogStreamOutboxQueueFactory({
    queueService,
    cronJob,
    auditLogStreamOutboxService
  });

  const auditLogQueue = await auditLogQueueServiceFactory({
    auditLogDAL,
    queueService,
    projectDAL,
    licenseService,
    auditLogStreamOutboxService,
    clickhouseClient: clickhouse,
    keyStore
  });

  const announcementService = announcementServiceFactory({ userDAL, keyStore });

  const clickhouseAuditLogDAL = clickhouse
    ? clickhouseAuditLogDALFactory(clickhouse, db, envConfig.CLICKHOUSE_AUDIT_LOG_TABLE_NAME)
    : undefined;

  const pamAccountDAL = pamAccountDALFactory(db);
  const auditLogService = auditLogServiceFactory({
    auditLogDAL,
    clickhouseAuditLogDAL,
    permissionService,
    auditLogQueue,
    keyStore,
    smtpService,
    userDAL,
    notificationService,
    resolvePamAuditScope: pamAuditLogScopeResolverFactory({
      projectDAL,
      permissionService,
      membershipDAL,
      membershipRoleDAL,
      pamAccountDAL
    })
  });
  const secretApprovalPolicyService = secretApprovalPolicyServiceFactory({
    projectEnvDAL,
    secretApprovalPolicyApproverDAL: sapApproverDAL,
    secretApprovalPolicyBypasserDAL: sapBypasserDAL,
    secretApprovalPolicyEnvironmentDAL: sapEnvironmentDAL,
    permissionService,
    secretApprovalPolicyDAL,
    licenseService,
    projectDAL,
    userDAL,
    secretApprovalRequestDAL
  });

  // samlService is created after loginService (below) due to dependency on processProviderCallback
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

  const telemetryService = telemetryServiceFactory({
    keyStore,
    licenseService,
    orgDAL,
    emailDomainDAL
  });
  const telemetryQueue = telemetryQueueServiceFactory({
    keyStore,
    telemetryDAL,
    cronJob,
    telemetryService
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
    additionalPrivilegeDAL,
    approvalPolicyDAL,
    emailDomainDAL,
    telemetryService
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

  // gitHubAppService is created after gatewayPoolService (below) due to dependency on gateway services

  // ldapService is created after loginService (below) due to dependency on processProviderCallback

  const invalidateCacheQueue = invalidateCacheQueueFactory({
    keyStore,
    queueService
  });

  const mfaRecoveryCodeService = mfaRecoveryCodeServiceFactory({
    mfaRecoveryCodeDAL,
    userDAL,
    kmsService
  });

  const userService = userServiceFactory({
    userDAL,
    orgDAL,
    tokenService,
    permissionService,
    groupProjectDAL,
    smtpService,
    userAliasDAL,
    membershipUserDAL,
    totpConfigDAL,
    webAuthnCredentialDAL,
    mfaRecoveryCodeService
  });

  const totpService = totpServiceFactory({
    totpConfigDAL,
    userDAL,
    kmsService,
    keyStore
  });

  const webAuthnService = webAuthnServiceFactory({
    webAuthnCredentialDAL,
    userDAL,
    tokenService,
    keyStore
  });

  const mfaLockoutService = mfaLockoutServiceFactory({
    userDAL,
    tokenService,
    smtpService,
    keyStore
  });

  const mfaSessionService = mfaSessionServiceFactory({
    keyStore,
    tokenService,
    smtpService,
    totpService,
    mfaLockoutService
  });

  const loginService = authLoginServiceFactory({
    userDAL,
    userAliasDAL,
    smtpService,
    tokenService,
    orgDAL,
    totpService,
    mfaRecoveryCodeService,
    auditLogService,
    notificationService,
    membershipRoleDAL,
    membershipUserDAL,
    permissionService,
    mfaLockoutService
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
    membershipGroupDAL,
    loginService,
    emailDomainDAL,
    telemetryService
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
    membershipRoleDAL,
    loginService,
    emailDomainDAL,
    telemetryService
  });
  const passwordService = authPaswordServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL,
    totpConfigDAL,
    keyStore
  });

  const accountRecoveryService = accountRecoveryServiceFactory({
    tokenService,
    smtpService,
    userDAL,
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

  const certificatePolicyDAL = certificatePolicyDALFactory(db);

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
    membershipDAL,
    roleDAL,
    userGroupMembershipDAL,
    additionalPrivilegeDAL,
    approvalPolicyDAL,
    certificatePolicyDAL
  });

  const subOrgService = subOrgServiceFactory({
    licenseService,
    membershipDAL,
    membershipRoleDAL,
    orgDAL,
    projectDAL,
    permissionService,
    certificatePolicyDAL
  });

  const signupService = authSignupServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL,
    userAliasDAL,
    orgDAL,
    orgService,
    loginService,
    emailDomainDAL
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
    emailDomainDAL,
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

  const orgProductStatsService = orgProductStatsServiceFactory({
    orgProductStatsDAL
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
    accessApprovalPolicyApproverDAL,
    accessApprovalPolicyDAL,
    secretApprovalPolicyApproverDAL: sapApproverDAL,
    secretApprovalPolicyDAL,
    membershipRoleDAL,
    applicationMembershipCleanupService
  });

  const projectKeyService = projectKeyServiceFactory({
    permissionService,
    projectKeyDAL,
    membershipUserDAL
  });

  const projectQueueService = projectQueueFactory({
    queueService,
    keyStore,
    secretDAL,
    secretV2BridgeDAL,
    kmsService,
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
  const caSigningConfigDAL = caSigningConfigDALFactory(db);
  const externalCertificateAuthorityDAL = externalCertificateAuthorityDALFactory(db);
  const certificateAuthorityCertDAL = certificateAuthorityCertDALFactory(db);
  const certificateAuthoritySecretDAL = certificateAuthoritySecretDALFactory(db);
  const certificateAuthorityCrlDAL = certificateAuthorityCrlDALFactory(db);
  const certificateTemplateDAL = certificateTemplateDALFactory(db);
  const certificateTemplateEstConfigDAL = certificateTemplateEstConfigDALFactory(db);
  const certificateProfileDAL = certificateProfileDALFactory(db);
  const pkiApplicationDAL = pkiApplicationDALFactory(db);
  const pkiApplicationProfileDAL = pkiApplicationProfileDALFactory(db);
  const apiEnrollmentConfigDAL = apiEnrollmentConfigDALFactory(db);
  const estEnrollmentConfigDAL = estEnrollmentConfigDALFactory(db);
  const acmeEnrollmentConfigDAL = acmeEnrollmentConfigDALFactory(db);
  const scepEnrollmentConfigDAL = scepEnrollmentConfigDALFactory(db);
  const scepTransactionDAL = scepTransactionDALFactory(db);
  const scepDynamicChallengeDAL = scepDynamicChallengeDALFactory(db);
  const acmeAccountDAL = pkiAcmeAccountDALFactory(db);
  const acmeOrderDAL = pkiAcmeOrderDALFactory(db);
  const acmeAuthDAL = pkiAcmeAuthDALFactory(db);
  const acmeOrderAuthDAL = pkiAcmeOrderAuthDALFactory(db);
  const acmeChallengeDAL = pkiAcmeChallengeDALFactory(db);
  const certificateCleanupConfigDAL = certificateCleanupConfigDALFactory(db);
  const certificateInventoryViewDAL = certificateInventoryViewDALFactory(db);
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
  const pkiDiscoveryConfigDAL = pkiDiscoveryConfigDALFactory(db);
  const pkiCertificateInstallationDAL = pkiCertificateInstallationDALFactory(db);
  const pkiDiscoveryInstallationDAL = pkiDiscoveryInstallationDALFactory(db);
  const pkiCertificateInstallationCertDAL = pkiCertificateInstallationCertDALFactory(db);
  const pkiDiscoveryScanHistoryDAL = pkiDiscoveryScanHistoryDALFactory(db);

  const signerDAL = signerDALFactory(db);
  const signerRequestDAL = signerRequestDALFactory(db);
  const signingOperationDAL = signingOperationDALFactory(db);
  const signerIssuanceJobDAL = signerIssuanceJobDALFactory(db);

  const instanceRelayConfigDAL = instanceRelayConfigDalFactory(db);
  const orgRelayConfigDAL = orgRelayConfigDalFactory(db);
  const relayDAL = relayDalFactory(db);
  const gatewayV2DAL = gatewayV2DalFactory(db);
  const kmipServerDAL = kmipServerDALFactory(db);
  const resourceTokenAuthDAL = resourceTokenAuthDALFactory(db);
  const resourceAuthMethodDAL = resourceAuthMethodDALFactory(db);
  const resourceAwsAuthDAL = resourceAwsAuthDALFactory(db);
  const gatewayPoolDAL = gatewayPoolDalFactory(db);
  const gatewayPoolMembershipDAL = gatewayPoolMembershipDalFactory(db);

  const approvalRequestDAL = approvalRequestDALFactory(db);
  const approvalRequestGrantsDAL = approvalRequestGrantsDALFactory(db);
  const approvalRequestStepsDAL = approvalRequestStepsDALFactory(db);
  const approvalRequestStepEligibleApproversDAL = approvalRequestStepEligibleApproversDALFactory(db);
  const approvalPolicyStepsDAL = approvalPolicyStepsDALFactory(db);
  const approvalPolicyStepApproversDAL = approvalPolicyStepApproversDALFactory(db);
  const approvalRequestApprovalsDAL = approvalRequestApprovalsDALFactory(db);

  const orgGatewayConfigV2DAL = orgGatewayConfigV2DalFactory(db);

  const aiMcpServerDAL = aiMcpServerDALFactory(db);

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
    certificatePolicyService,
    apiEnrollmentConfigDAL,
    estEnrollmentConfigDAL,
    acmeEnrollmentConfigDAL,
    scepEnrollmentConfigDAL,
    scepDynamicChallengeDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    permissionService,
    kmsService,
    projectDAL,
    resourceMetadataDAL,
    pkiApplicationProfileDAL
  });

  const pkiApplicationService = pkiApplicationServiceFactory({
    pkiApplicationDAL,
    pkiApplicationProfileDAL,
    membershipDAL,
    membershipRoleDAL,
    approvalPolicyDAL,
    approvalRequestDAL,
    permissionService
  });

  const pkiApplicationMembershipService = pkiApplicationMembershipServiceFactory({
    pkiApplicationDAL,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    userDAL,
    identityDAL,
    groupDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL,
    approvalPolicyDAL
  });

  const signerMembershipService = signerMembershipServiceFactory({
    signerDAL,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    userDAL,
    identityDAL,
    groupDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL,
    approvalPolicyDAL
  });

  const certManagerProjectResolver = certManagerProjectResolverFactory({
    orgDAL,
    projectDAL
  });

  const pamProjectResolver = pamProjectResolverFactory({
    db,
    projectDAL,
    membershipDAL,
    membershipRoleDAL,
    keyStore
  });

  const pamAccountTemplateDAL = pamAccountTemplateDALFactory(db);
  const pamFolderDAL = pamFolderDALFactory(db);
  const pamFolderNotificationConfigDAL = pamFolderNotificationConfigDALFactory(db);

  const pamMembershipService = pamMembershipServiceFactory({
    membershipDAL,
    membershipRoleDAL,
    approvalPolicyDAL,
    projectAccessRequestDAL,
    pamFolderDAL,
    pamAccountDAL,
    userDAL,
    groupDAL,
    identityDAL,
    permissionService
  });

  const certManagerInstanceService = certManagerInstanceServiceFactory({
    db,
    orgDAL,
    projectDAL,
    permissionService
  });

  const pkiApplicationEnrollmentService = pkiApplicationEnrollmentServiceFactory({
    pkiApplicationDAL,
    pkiApplicationProfileDAL,
    apiEnrollmentConfigDAL,
    estEnrollmentConfigDAL,
    acmeEnrollmentConfigDAL,
    scepEnrollmentConfigDAL,
    kmsService,
    projectDAL,
    permissionService
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
    projectTemplateDAL,
    projectTemplateUserMembershipDAL,
    projectTemplateGroupMembershipDAL,
    projectTemplateIdentityMembershipDAL,
    orgMembershipDAL,
    groupDAL,
    identityDAL
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

  const resourceAuthMethodService = resourceAuthMethodServiceFactory({
    resourceAuthMethodDAL,
    resourceAwsAuthDAL,
    resourceTokenAuthDAL,
    gatewayV2DAL,
    relayDAL,
    kmipServerDAL,
    identityDAL,
    permissionService
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
    userDAL,
    resourceAuthMethodService,
    gatewayV2DAL
  });

  const kmipServerService = kmipServerServiceFactory({
    kmipServerDAL,
    permissionService,
    resourceAuthMethodService
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
    smtpService,
    appConnectionDAL,
    dynamicSecretDAL,
    identityKubernetesAuthDAL,
    aiMcpServerDAL,
    pkiDiscoveryConfigDAL,
    resourceAuthMethodService
  });

  const gatewayPoolService = gatewayPoolServiceFactory({
    gatewayPoolDAL,
    gatewayPoolMembershipDAL,
    gatewayV2DAL,
    gatewayV2Service,
    permissionService,
    licenseService,
    identityKubernetesAuthDAL,
    pkiDiscoveryConfigDAL,
    appConnectionDAL,
    dynamicSecretDAL
  });

  const pamAccountTemplateService = pamAccountTemplateServiceFactory({
    pamAccountTemplateDAL,
    pamAccountDAL,
    permissionService,
    gatewayV2DAL,
    gatewayPoolService,
    appConnectionDAL,
    kmsService
  });

  const pamSessionDAL = pamSessionDALFactory(db);
  const pamSessionEventChunkDAL = pamSessionEventChunkDALFactory(db);

  const pamSessionExpirationService = pamSessionExpirationServiceFactory({
    queueService,
    pamSessionDAL
  });

  const pamAccessRequestService = pamAccessRequestServiceFactory({
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    approvalRequestDAL,
    approvalRequestStepsDAL,
    approvalRequestStepEligibleApproversDAL,
    approvalRequestApprovalsDAL,
    approvalRequestGrantsDAL,
    pamAccountDAL,
    pamAccountTemplateDAL,
    pamFolderDAL,
    pamSessionDAL,
    gatewayV2Service,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    notificationService,
    smtpService,
    groupDAL,
    userGroupMembershipDAL,
    userDAL,
    pamFolderNotificationConfigDAL,
    workflowIntegrationDAL,
    slackIntegrationDAL,
    kmsService,
    licenseService
  });

  const pamFolderService = pamFolderServiceFactory({
    pamFolderDAL,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    pamAccessRequestService
  });

  const pamAccountService = pamAccountServiceFactory({
    pamAccountDAL,
    pamFolderDAL,
    pamAccountTemplateDAL,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    kmsService,
    gatewayV2DAL,
    gatewayPoolService,
    appConnectionDAL,
    pamAccessRequestService
  });

  const pamDiscoverySourceDAL = pamDiscoverySourceDALFactory(db);
  const pamDiscoverySourceRunDAL = pamDiscoverySourceRunDALFactory(db);
  const pamDiscoveredAccountDAL = pamDiscoveredAccountDALFactory(db);

  const pamDiscoveryService = pamDiscoverySourceServiceFactory({
    pamDiscoverySourceDAL,
    pamDiscoverySourceRunDAL,
    pamDiscoveredAccountDAL,
    pamAccountDAL,
    pamAccountService,
    permissionService,
    kmsService,
    gatewayV2DAL,
    gatewayV2Service,
    gatewayPoolService,
    queueService,
    cronJob,
    auditLogService
  });

  const pamAccountRotationService = pamAccountRotationServiceFactory({
    pamAccountDAL,
    permissionService,
    membershipDAL,
    membershipRoleDAL,
    kmsService,
    keyStore,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService
  });

  const pamSessionService = pamSessionServiceFactory({
    pamSessionDAL,
    pamAccountDAL,
    pamFolderDAL,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    kmsService,
    gatewayV2Service,
    gatewayPoolService,
    userDAL,
    pamSessionExpirationService,
    pamAccessRequestService,
    mfaSessionService,
    orgDAL
  });

  const pamSessionChunkService = pamSessionChunkServiceFactory({
    pamSessionDAL,
    pamSessionEventChunkDAL,
    pamAccountDAL,
    permissionService,
    kmsService,
    appConnectionDAL
  });

  const pamWebAccessService = pamWebAccessServiceFactory({
    pamAccountDAL,
    pamAccessRequestService,
    permissionService,
    auditLogService,
    tokenService,
    pamSessionDAL,
    gatewayV2Service,
    gatewayPoolService,
    kmsService,
    userDAL,
    mfaSessionService,
    orgDAL
  });

  const gitHubAppService = gitHubAppServiceFactory({
    gitHubAppDAL,
    permissionService,
    kmsService,
    keyStore,
    licenseService,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService,
    gatewayDAL,
    gatewayV2DAL,
    auditLogService,
    userDAL
  });

  const secretSyncQueue = secretSyncQueueFactory({
    queueService,
    cronJob,
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
    gitHubAppDAL,
    licenseService,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService,
    notificationService,
    projectSlackConfigDAL,
    projectMicrosoftTeamsConfigDAL,
    microsoftTeamsService,
    telemetryService,
    projectFolderGrantDAL,
    orgDAL
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
    identityDAL,
    userDAL,
    serviceTokenDAL,
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
    licenseService,
    membershipRoleDAL,
    membershipUserDAL,
    telemetryService,
    projectEventsService,
    projectFolderGrantDAL,
    orgDAL
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
    identityDAL,
    membershipGroupDAL,
    membershipIdentityDAL,
    membershipRoleDAL,
    membershipUserDAL,
    roleDAL,
    groupDAL,
    projectAccessRequestDAL
  });

  const projectEnvQueue = projectEnvQueueFactory({
    cronJob,
    queueService,
    projectEnvDAL,
    keyStore,
    auditLogService
  });

  const projectCleanupQueue = projectCleanupQueueFactory({
    cronJob,
    queueService,
    projectDAL,
    membershipUserDAL,
    userDAL,
    kmsService,
    keyStore,
    auditLogService
  });

  const projectEnvService = projectEnvServiceFactory({
    permissionService,
    projectEnvDAL,
    keyStore,
    licenseService,
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

  const secretTagService = secretTagServiceFactory({ secretTagDAL, permissionService, secretV2BridgeDAL });
  const secretValidationRuleService = secretValidationRuleServiceFactory({
    secretValidationRuleDAL,
    projectEnvDAL,
    permissionService,
    kmsService,
    folderDAL,
    secretDAL: secretV2BridgeDAL,
    secretVersionV2BridgeDAL
  });
  const secretImportService = secretImportServiceFactory({
    licenseService,
    projectBotService,
    projectFolderGrantDAL,
    orgDAL,
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
  const projectFolderGrantService = projectFolderGrantServiceFactory({
    projectFolderGrantDAL,
    folderDAL,
    projectDAL,
    orgDAL,
    permissionService,
    secretV2BridgeDAL
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
    permissionDAL,
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
    reminderDAL,
    keyStore,
    secretValidationRuleService,
    projectFolderGrantDAL,
    orgDAL
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
    notificationService,
    telemetryService
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
    reminderService,
    secretVersionV2DAL: secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    kmsService,
    userGroupMembershipDAL,
    identityGroupMembershipDAL,
    orgDAL,
    projectFolderGrantDAL
  });

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
    kmsService,
    secretVersionDAL: secretVersionV2BridgeDAL,
    secretTagDAL,
    secretVersionTagDAL: secretVersionTagV2BridgeDAL,
    resourceMetadataDAL,
    secretApprovalRequestDAL,
    secretApprovalRequestSecretDAL,
    secretQueueService,
    dynamicSecretDAL,
    secretRotationV2DAL,
    honeyTokenDAL,
    secretImportDAL,
    secretV2BridgeService,
    reminderDAL,
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
    identityDAL,
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
    additionalPrivilegeDAL
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
    folderCommitService,
    projectFolderGrantDAL,
    orgDAL
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
    kmsService,
    projectFolderGrantDAL,
    orgDAL
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
    licenseDAL,
    identityMetadataDAL,
    keyStore,
    orgDAL,
    membershipIdentityDAL,
    membershipRoleDAL,
    usageMeteringService
  });

  const identityAccessTokenService = identityAccessTokenServiceFactory({
    identityAccessTokenDAL,
    identityAccessTokenRevocationDAL,
    identityDAL,
    orgDAL,
    keyStore
  });

  const identityV2Service = identityV2ServiceFactory({
    membershipIdentityDAL,
    membershipRoleDAL,
    identityMetadataDAL,
    licenseService,
    permissionService,
    identityDAL: identityV2DAL,
    identityMembershipV2DAL,
    identityAccessTokenService,
    keyStore,
    projectDAL,
    orgDAL,
    roleDAL
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

  const identityTokenAuthService = identityTokenAuthServiceFactory({
    identityTokenAuthDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    orgDAL,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identityUaService = identityUaServiceFactory({
    identityDAL,
    permissionService,
    identityUaClientSecretDAL,
    identityUaDAL,
    licenseService,
    keyStore,
    orgDAL,
    membershipIdentityDAL,
    identityAccessTokenService
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
    membershipIdentityDAL,
    gatewayPoolService,
    gatewayPoolDAL,
    identityAccessTokenService
  });
  const identityGcpAuthService = identityGcpAuthServiceFactory({
    identityDAL,
    identityGcpAuthDAL,
    orgDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identityAliCloudAuthService = identityAliCloudAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    orgDAL,
    identityAliCloudAuthDAL,
    licenseService,
    permissionService,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identityTlsCertAuthService = identityTlsCertAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    identityTlsCertAuthDAL,
    licenseService,
    permissionService,
    kmsService,
    membershipIdentityDAL,
    orgDAL,
    identityAccessTokenService
  });

  const identityAwsAuthService = identityAwsAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    orgDAL,
    identityAwsAuthDAL,
    licenseService,
    permissionService,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identityAzureAuthService = identityAzureAuthServiceFactory({
    identityDAL,
    identityAzureAuthDAL,
    orgDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identityOciAuthService = identityOciAuthServiceFactory({
    identityDAL,
    identityAccessTokenDAL,
    orgDAL,
    identityOciAuthDAL,
    licenseService,
    permissionService,
    membershipIdentityDAL,
    identityAccessTokenService
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
    folderCommitDAL,
    secretQueueService
  });

  const identityOidcAuthService = identityOidcAuthServiceFactory({
    identityDAL,
    identityOidcAuthDAL,
    orgDAL,
    identityAccessTokenDAL,
    permissionService,
    licenseService,
    kmsService,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identityJwtAuthService = identityJwtAuthServiceFactory({
    identityDAL,
    identityJwtAuthDAL,
    orgDAL,
    permissionService,
    identityAccessTokenDAL,
    licenseService,
    kmsService,
    membershipIdentityDAL,
    identityAccessTokenService
  });

  const identitySpiffeAuthService = identitySpiffeAuthServiceFactory({
    identityDAL,
    identitySpiffeAuthDAL,
    orgDAL,
    permissionService,
    identityAccessTokenDAL,
    licenseService,
    kmsService,
    membershipIdentityDAL,
    identityAccessTokenService
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
    membershipIdentityDAL,
    identityAccessTokenService
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
    smtpService,
    kmsService,
    notificationService,
    projectMembershipDAL,
    projectDAL,
    pkiApplicationDAL
  });

  const pkiAlertV2Queue = pkiAlertV2QueueServiceFactory({
    queueService,
    cronJob,
    pkiAlertV2Service,
    pkiAlertV2DAL,
    pkiAlertHistoryDAL
  });

  const certificateCleanupService = certificateCleanupServiceFactory({
    certificateCleanupConfigDAL,
    permissionService
  });

  const certificateInventoryViewService = certificateInventoryViewServiceFactory({
    certificateInventoryViewDAL,
    permissionService
  });

  const certificateCleanupQueue = certificateCleanupQueueFactory({
    db,
    cronJob,
    certificateCleanupConfigDAL,
    certificateDAL,
    certificateRequestDAL,
    auditLogService,
    telemetryService
  });

  const dynamicSecretProviders = buildDynamicSecretProviders({
    gatewayService,
    gatewayV2Service,
    gatewayPoolService
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
    gatewayPoolService,
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
    identityDAL,
    secretValidationRuleService
  });

  const emailDomainService = emailDomainServiceFactory({
    emailDomainDAL,
    permissionService,
    licenseService
  });

  // DAILY
  const dailyResourceCleanUp = dailyResourceCleanUpQueueServiceFactory({
    scimService,
    auditLogDAL,
    auditLogService,
    cronJob,
    secretVersionDAL,
    secretFolderVersionDAL: folderVersionDAL,
    snapshotDAL,
    identityAccessTokenDAL,
    identityAccessTokenRevocationDAL,
    secretSharingDAL,
    secretVersionV2DAL: secretVersionV2BridgeDAL,
    identityUniversalAuthClientSecretDAL: identityUaClientSecretDAL,
    serviceTokenService,
    orgService,
    userNotificationDAL,
    keyValueStoreDAL,
    approvalRequestDAL,
    approvalRequestGrantsDAL,
    certificateRequestDAL,
    scepTransactionDAL
  });

  const healthAlert = healthAlertServiceFactory({
    gatewayV2Service,
    cronJob,
    relayService
  });

  const dailyReminderQueueService = dailyReminderQueueServiceFactory({
    reminderService,
    cronJob
  });

  const dailyExpiringPkiItemAlert = dailyExpiringPkiItemAlertQueueServiceFactory({
    cronJob,
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
    membershipRoleDAL,
    loginService,
    emailDomainDAL,
    telemetryService
  });

  const userActivationService = userActivationServiceFactory({
    userActivationDAL,
    permissionService,
    orgDAL
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
    licenseService
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

  const appConnectionCredentialRotationService = appConnectionCredentialRotationServiceFactory({
    appConnectionCredentialRotationDAL,
    appConnectionDAL,
    keyStore,
    kmsService,
    queueService
  });

  const appConnectionService = appConnectionServiceFactory({
    appConnectionDAL,
    permissionService,
    kmsService,
    licenseService,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService,
    gatewayDAL,
    gatewayV2DAL,
    projectDAL,
    appConnectionCredentialRotationService,
    identityUaDAL,
    gitHubAppDAL,
    keyStore
  });

  const hsmConnectorService = hsmConnectorServiceFactory({
    hsmConnectorDAL,
    permissionService,
    kmsService,
    gatewayV2Service,
    gatewayPoolService,
    gatewayV2DAL,
    gatewayPoolDAL,
    licenseService
  });

  const honeyTokenConfigService = honeyTokenConfigServiceFactory({
    honeyTokenConfigDAL,
    permissionService,
    kmsService,
    licenseService,
    appConnectionDAL,
    appConnectionService
  });

  const honeyTokenService = honeyTokenServiceFactory({
    honeyTokenDAL,
    honeyTokenConfigDAL,
    honeyTokenEventDAL,
    permissionService,
    licenseService,
    kmsService,
    appConnectionDAL,
    orgDAL,
    projectDAL,
    smtpService,
    folderDAL,
    projectBotService,
    secretDAL: secretV2BridgeDAL,
    secretVersionDAL: secretVersionV2BridgeDAL,
    secretVersionTagDAL: secretVersionTagV2BridgeDAL,
    secretTagDAL,
    folderCommitService,
    resourceMetadataDAL,
    snapshotService,
    secretQueueService,
    webhookDAL,
    projectEnvDAL,
    appConnectionService,
    telemetryService,
    auditLogService
  });

  const proxiedServiceService = proxiedServiceServiceFactory({
    proxiedServiceDAL,
    proxiedServiceCredentialDAL,
    folderDAL,
    secretV2BridgeService,
    permissionService,
    licenseService,
    dynamicSecretDAL,
    projectDAL
  });

  const agentProxyCaService = agentProxyCaServiceFactory({
    orgAgentProxyConfigDAL,
    kmsService,
    licenseService,
    permissionService
  });

  const webhookService = webhookServiceFactory({
    permissionService,
    webhookDAL,
    projectEnvDAL,
    projectDAL,
    kmsService
  });

  const secretSyncService = secretSyncServiceFactory({
    secretSyncDAL,
    secretImportDAL,
    secretV2BridgeDAL,
    appConnectionDAL,
    appConnectionService,
    kmsService,
    permissionService,
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
    gatewayV2Service,
    gatewayPoolService,
    telemetryService,
    secretValidationRuleService
  });

  const insightsService = insightsServiceFactory({
    permissionService,
    licenseService,
    auditLogDAL,
    secretRotationV2DAL,
    reminderDAL,
    folderDAL,
    secretV2BridgeDAL,
    dynamicSecretDAL,
    honeyTokenDAL,
    projectBotService,
    projectDAL,
    userDAL,
    kmsService,
    keyStore
  });

  const auditReportDAL = auditReportDALFactory(db);
  const auditReportService = auditReportServiceFactory({
    permissionService,
    licenseService,
    auditReportDAL,
    projectDAL,
    projectBotService,
    userDAL,
    queueService
  });
  // Registers the BullMQ worker that generates the CSVs and emails them.
  auditReportQueueServiceFactory({
    queueService,
    auditReportDAL,
    projectDAL,
    smtpService,
    secretV2BridgeDAL,
    folderDAL,
    secretRotationV2DAL,
    reminderDAL,
    auditLogDAL,
    secretValidationRuleDAL,
    kmsService
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
    certificateSyncDAL,
    gatewayV2Service,
    gatewayPoolService,
    telemetryService
  });

  const pkiSyncCleanup = pkiSyncCleanupQueueServiceFactory({
    cronJob,
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
    cronJob,
    pkiSubscriberDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    externalCertificateAuthorityDAL,
    keyStore,
    appConnectionDAL,
    appConnectionService,
    pkiSyncDAL,
    pkiSyncQueue,
    internalCertificateAuthorityDAL,
    hsmConnectorService
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
    permissionService,
    licenseService,
    caSigningConfigDAL,
    usageMeteringService,
    hsmConnectorService
  });

  const caAutoRenewalQueue = caAutoRenewalQueueFactory({
    queueService,
    cronJob,
    internalCertificateAuthorityDAL,
    caSigningConfigDAL,
    internalCertificateAuthorityService,
    appConnectionDAL,
    kmsService,
    gatewayV2Service,
    gatewayPoolService
  });

  const caSigningConfigService = caSigningConfigServiceFactory({
    caSigningConfigDAL,
    certificateAuthorityDAL,
    internalCertificateAuthorityDAL,
    permissionService,
    appConnectionDAL,
    appConnectionService,
    caAutoRenewalQueue
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
    pkiSyncQueue,
    certificateRequestDAL,
    resourceMetadataDAL,
    gatewayV2Service,
    gatewayPoolService,
    usageMeteringService,
    hsmConnectorService,
    certificateAuthoritySecretDAL
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

  const certManagerExportService = certManagerExportServiceFactory({
    certificateAuthorityDAL,
    internalCertificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateAuthoritySecretDAL,
    certificateAuthorityCrlDAL,
    certificatePolicyDAL,
    certificateProfileDAL,
    projectDAL,
    orgDAL,
    kmsService,
    permissionService
  });

  const pkiSubscriberQueue = pkiSubscriberQueueServiceFactory({
    queueService,
    cronJob,
    pkiSubscriberDAL,
    projectDAL,
    certificateAuthorityDAL,
    certificateAuthorityQueue,
    certificateDAL,
    auditLogService,
    internalCaFns,
    telemetryService
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
    pkiSyncQueue,
    certificateAuthorityService,
    resourceMetadataDAL,
    pkiAlertV2Queue,
    pkiApplicationDAL,
    licenseService,
    usageMeteringService,
    hsmConnectorService
  });

  const digicertCaFns = DigiCertCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL
  });

  const godaddyCaFns = GoDaddyCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL
  });

  const certificateRequestService = certificateRequestServiceFactory({
    certificateRequestDAL,
    certificateDAL,
    certificateService,
    permissionService,
    resourceMetadataDAL,
    queueService,
    userDAL,
    identityDAL
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
    certificateSyncDAL,
    certificateProfileDAL,
    certificateRequestService,
    certificateRequestDAL,
    resourceMetadataDAL,
    pkiAlertV2Queue,
    pkiApplicationProfileDAL,
    apiEnrollmentConfigDAL,
    gatewayV2Service,
    gatewayPoolService
  });

  const certificateApprovalService = certificateApprovalServiceFactory({
    certificateRequestDAL,
    certificateProfileDAL,
    acmeAccountDAL,
    permissionService,
    certificateAuthorityDAL,
    internalCaService: internalCertificateAuthorityService,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificatePolicyService,
    certificateIssuanceQueue,
    resourceMetadataDAL,
    pkiApplicationProfileDAL,
    apiEnrollmentConfigDAL
  });

  const approvalPolicyBypassersDAL = approvalPolicyBypassersDALFactory(db);

  const approvalPolicyService = approvalPolicyServiceFactory({
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    approvalPolicyBypassersDAL,
    permissionService,
    projectMembershipDAL,
    membershipDAL,
    pkiApplicationDAL,
    approvalRequestDAL,
    approvalRequestStepsDAL,
    approvalRequestStepEligibleApproversDAL,
    approvalRequestApprovalsDAL,
    userGroupMembershipDAL,
    notificationService,
    approvalRequestGrantsDAL,
    certificateApprovalService,
    certificateRequestDAL,
    smtpService,
    userDAL,
    projectDAL
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
    certificateRequestService,
    approvalPolicyDAL,
    certificateRequestDAL,
    userDAL,
    identityDAL,
    approvalPolicyService,
    resourceMetadataDAL,
    pkiAlertV2Queue,
    pkiApplicationProfileDAL,
    apiEnrollmentConfigDAL,
    licenseService
  });

  const certificateV3Queue = certificateV3QueueServiceFactory({
    cronJob,
    certificateDAL,
    certificateV3Service,
    auditLogService
  });

  const digicertCaQueue = digicertCertificateAuthorityQueueServiceFactory({
    cronJob,
    certificateRequestDAL,
    certificateRequestService,
    certificateAuthorityDAL,
    appConnectionDAL,
    kmsService,
    resourceMetadataDAL,
    digicertFns: digicertCaFns
  });

  const digicertRevocationSyncQueue = digicertRevocationSyncQueueFactory({
    cronJob,
    certificateAuthorityDAL,
    certificateDAL,
    appConnectionDAL,
    kmsService,
    auditLogService,
    pkiAlertV2Queue
  });

  const godaddyCaQueue = godaddyCertificateAuthorityQueueServiceFactory({
    cronJob,
    certificateRequestDAL,
    certificateRequestService,
    certificateAuthorityDAL,
    appConnectionDAL,
    kmsService,
    resourceMetadataDAL,
    godaddyFns: godaddyCaFns
  });

  const certificateEstV3Service = certificateEstV3ServiceFactory({
    certificateV3Service,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateDAL,
    projectDAL,
    kmsService,
    licenseService,
    certificateProfileDAL,
    estEnrollmentConfigDAL,
    certificatePolicyDAL,
    pkiApplicationProfileDAL
  });

  const pkiScepService = pkiScepServiceFactory({
    certificateV3Service,
    certificateProfileDAL,
    scepEnrollmentConfigDAL,
    scepDynamicChallengeDAL,
    scepTransactionDAL,
    certificateDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateRequestDAL,
    certificateBodyDAL,
    projectDAL,
    kmsService,
    licenseService,
    certificatePolicyDAL,
    certificatePolicyService,
    certificateRequestService,
    certificateIssuanceQueue,
    auditLogService,
    permissionService,
    pkiApplicationProfileDAL
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
    auditLogService,
    approvalPolicyDAL,
    approvalPolicyService,
    certificateRequestDAL,
    pkiApplicationProfileDAL,
    acmeEnrollmentConfigDAL
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
    pkiSyncQueue,
    kmsService
  });

  const pkiDiscoveryQueue = pkiDiscoveryQueueFactory({
    pkiDiscoveryConfigDAL,
    pkiDiscoveryScanHistoryDAL,
    pkiCertificateInstallationDAL,
    pkiDiscoveryInstallationDAL,
    pkiCertificateInstallationCertDAL,
    certificateDAL,
    certificateBodyDAL,
    projectDAL,
    kmsService,
    queueService,
    cronJob,
    gatewayV2Service,
    gatewayV2DAL,
    gatewayPoolService
  });

  const pkiDiscoveryService = pkiDiscoveryServiceFactory({
    pkiDiscoveryConfigDAL,
    pkiDiscoveryScanHistoryDAL,
    permissionService,
    gatewayV2DAL,
    gatewayPoolDAL,
    gatewayPoolService,
    queuePkiDiscoveryScan: pkiDiscoveryQueue.queuePkiDiscoveryScan
  });

  const pkiInstallationService = pkiInstallationServiceFactory({
    pkiCertificateInstallationDAL,
    permissionService
  });

  const signerIssuanceService = signerIssuanceServiceFactory({
    signerIssuanceJobDAL,
    signerDAL,
    certificateAuthorityDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService,
    certificateIssuanceQueue,
    cronJob,
    hsmConnectorService,
    certificateDAL
  });

  const signerService = signerServiceFactory({
    signerDAL,
    signingOperationDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    signerIssuanceService,
    internalCertificateAuthorityService,
    digicertFns: digicertCaFns,
    projectDAL,
    kmsService,
    permissionService,
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    approvalRequestDAL,
    approvalRequestGrantsDAL,
    membershipDAL,
    membershipRoleDAL,
    hsmConnectorService
  });

  const signerAutoRenewalQueue = signerAutoRenewalQueueFactory({
    queueService,
    cronJob,
    signerDAL,
    signerService
  });

  const signerPolicyService = signerPolicyServiceFactory({
    signerDAL,
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    approvalRequestDAL,
    signerRequestDAL,
    approvalRequestStepsDAL,
    approvalRequestStepEligibleApproversDAL,
    approvalRequestGrantsDAL,
    membershipDAL,
    membershipRoleDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL,
    userDAL,
    identityDAL,
    permissionService,
    notificationService,
    smtpService
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
    cronJob,
    projectDAL,
    projectMembershipDAL,
    smtpService,
    notificationService
  });

  await appConnectionCredentialRotationQueueFactory({
    queueService,
    cronJob,
    appConnectionCredentialRotationDAL,
    appConnectionCredentialRotationService,
    smtpService,
    notificationService,
    projectMembershipDAL,
    projectDAL,
    orgDAL
  });

  await pamAccountRotationQueueServiceFactory({
    queueService,
    cronJob,
    auditLogService,
    pamAccountDAL,
    pamAccountRotationService
  });

  const secretScanningV2Queue = secretScanningV2QueueServiceFactory({
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

  const aiMcpServerToolDAL = aiMcpServerToolDALFactory(db);
  const aiMcpServerUserCredentialDAL = aiMcpServerUserCredentialDALFactory(db);
  const aiMcpActivityLogDAL = aiMcpActivityLogDALFactory(db);
  const aiMcpEndpointDAL = aiMcpEndpointDALFactory(db);
  const aiMcpEndpointServerDAL = aiMcpEndpointServerDALFactory(db);
  const aiMcpEndpointServerToolDAL = aiMcpEndpointServerToolDALFactory(db);

  const aiMcpServerService = aiMcpServerServiceFactory({
    aiMcpServerDAL,
    aiMcpServerToolDAL,
    aiMcpServerUserCredentialDAL,
    kmsService,
    keyStore,
    permissionService,
    gatewayV2DAL,
    gatewayV2Service
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
    permissionService,
    gatewayV2Service
  });

  const migrationService = externalMigrationServiceFactory({
    externalMigrationQueue,
    userDAL,
    permissionService,
    gatewayDAL,
    gatewayService,
    gatewayV2DAL,
    appConnectionService,
    secretService,
    auditLogService,
    gatewayV2Service,
    gatewayPoolService
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
  // Register all cron jobs (synchronous registrations) before starting the scheduler
  telemetryQueue.startTelemetryCheck();
  telemetryQueue.startAggregatedEventsJob();
  dailyResourceCleanUp.init();
  projectEnvQueue.init();
  projectCleanupQueue.init();
  usageEventQueue.init();
  healthAlert.init();
  auditLogStreamOutboxQueue.init();
  pkiSyncCleanup.init();
  pamDiscoveryService.init();
  pkiDiscoveryQueue.startPkiDiscoveryScanQueue();
  dailyReminderQueueService.startDailyRemindersJob();
  secretSyncQueue.startDailySecretSyncRetryJob();
  dailyExpiringPkiItemAlert.startSendingAlerts();
  certificateAuthorityQueue.startCaCrlRebuildJob();
  pkiSubscriberQueue.startDailyAutoRenewalJob();
  pkiAlertV2Queue.init();
  certificateCleanupQueue.init();
  certificateV3Queue.init();
  digicertCaQueue.init();
  digicertRevocationSyncQueue.init();
  pamSessionExpirationService.init();
  godaddyCaQueue.init();
  caAutoRenewalQueue.startDailyAutoRenewalJob();
  signerAutoRenewalQueue.start();
  signerIssuanceService.start();
  await microsoftTeamsService.start();
  await eventBusService.init();

  // inject all services
  server.decorate<FastifyZodProvider["services"]>("services", {
    login: loginService,
    password: passwordService,
    accountRecovery: accountRecoveryService,
    signup: signupService,
    user: userService,
    group: groupService,
    groupProject: groupProjectService,
    permission: permissionService,
    org: orgService,
    subOrganization: subOrgService,
    oidc: oidcService,
    authToken: tokenService,
    oauthClient: oauthClientService,
    superAdmin: superAdminService,
    offlineUsageReport: offlineUsageReportService,
    orgProductStats: orgProductStatsService,
    project: projectService,
    projectMembership: projectMembershipService,
    projectKey: projectKeyService,
    projectEnv: projectEnvService,
    secret: secretService,
    secretReplication: secretReplicationService,
    secretTag: secretTagService,
    secretValidationRule: secretValidationRuleService,
    rateLimit: rateLimitService,
    folder: folderService,
    secretImport: secretImportService,
    projectFolderGrant: projectFolderGrantService,
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
    identitySpiffeAuth: identitySpiffeAuthService,
    identityLdapAuth: identityLdapAuthService,
    accessApprovalPolicy: accessApprovalPolicyService,
    accessApprovalRequest: accessApprovalRequestService,
    secretApprovalPolicy: secretApprovalPolicyService,
    secretApprovalRequest: secretApprovalRequestService,
    dynamicSecret: dynamicSecretService,
    dynamicSecretLease: dynamicSecretLeaseService,
    emailDomain: emailDomainService,
    snapshot: snapshotService,
    saml: samlService,
    ldap: ldapService,
    auditLog: auditLogService,
    auditLogStream: auditLogStreamService,
    certificate: certificateService,
    certificateCleanup: certificateCleanupService,
    certificateInventoryView: certificateInventoryViewService,
    certificateV3: certificateV3Service,
    certificateRequest: certificateRequestService,
    certificateEstV3: certificateEstV3Service,
    sshCertificateAuthority: sshCertificateAuthorityService,
    sshCertificateTemplate: sshCertificateTemplateService,
    sshHost: sshHostService,
    sshHostGroup: sshHostGroupService,
    certificateAuthority: certificateAuthorityService,
    internalCertificateAuthority: internalCertificateAuthorityService,
    caSigningConfig: caSigningConfigService,
    certificateTemplate: certificateTemplateService,
    certificatePolicy: certificatePolicyService,
    certificateProfile: certificateProfileService,
    pkiApplication: pkiApplicationService,
    pkiApplicationMembership: pkiApplicationMembershipService,
    signerMembership: signerMembershipService,
    signerPolicy: signerPolicyService,
    pkiApplicationEnrollment: pkiApplicationEnrollmentService,
    certManagerProjectResolver,
    pamProjectResolver,
    pamAccountTemplate: pamAccountTemplateService,
    pamFolder: pamFolderService,
    pamAccount: pamAccountService,
    pamDiscovery: pamDiscoveryService,
    pamAccountRotation: pamAccountRotationService,
    pamMembership: pamMembershipService,
    pamSession: pamSessionService,
    pamSessionChunk: pamSessionChunkService,
    pamAccessRequest: pamAccessRequestService,
    pamWebAccess: pamWebAccessService,
    certManagerInstance: certManagerInstanceService,
    certManagerExport: certManagerExportService,
    certificateAuthorityCrl: certificateAuthorityCrlService,
    certificateEst: certificateEstService,
    pkiAcme: pkiAcmeService,
    pkiScep: pkiScepService,
    pit: pitService,
    pkiAlert: pkiAlertService,
    pkiCollection: pkiCollectionService,
    pkiSubscriber: pkiSubscriberService,
    pkiSync: pkiSyncService,
    pkiDiscovery: pkiDiscoveryService,
    pkiInstallation: pkiInstallationService,
    pkiSigner: signerService,
    pkiTemplate: pkiTemplateService,
    secretScanning: secretScanningService,
    license: licenseService,
    licenseClient,
    licenseV2: licenseV2Service,
    trustedIp: trustedIpService,
    scim: scimService,
    secretBlindIndex: secretBlindIndexService,
    telemetry: telemetryService,
    secretSharing: secretSharingService,
    userActivation: userActivationService,
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
    mfaRecoveryCode: mfaRecoveryCodeService,
    appConnection: appConnectionService,
    hsmConnector: hsmConnectorService,
    secretSync: secretSyncService,
    kmip: kmipService,
    kmipOperation: kmipOperationService,
    kmipServer: kmipServerService,
    gateway: gatewayService,
    relay: relayService,
    gatewayV2: gatewayV2Service,
    gatewayPool: gatewayPoolService,
    resourceAuthMethod: resourceAuthMethodService,
    secretRotationV2: secretRotationV2Service,
    microsoftTeams: microsoftTeamsService,
    assumePrivileges: assumePrivilegeService,
    insights: insightsService,
    auditReport: auditReportService,
    githubOrgSync: githubOrgSyncConfigService,
    gitHubApp: gitHubAppService,
    honeyTokenConfig: honeyTokenConfigService,
    honeyToken: honeyTokenService,
    proxiedService: proxiedServiceService,
    agentProxyCa: agentProxyCaService,
    folderCommit: folderCommitService,
    secretScanningV2: secretScanningV2Service,
    reminder: reminderService,
    eventBus: eventBusService,
    projectEvents: projectEventsService,
    projectEventsSSE: projectEventsSSEService,
    notification: notificationService,
    announcement: announcementService,
    mfaSession: mfaSessionService,
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
    approvalPolicy: approvalPolicyService,
    appConnectionCredentialRotation: appConnectionCredentialRotationService,
    caAutoRenewalQueue
  });

  // Expose services globally for e2e tests (only available inside the encapsulated plugin context)
  if (process.env.NODE_ENV === "test") {
    // @ts-expect-error type - expose for e2e test access
    globalThis.testServices = server.services;
  }

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

  // Spawn Go sidecar as subprocess (must be registered before shadowing plugin)
  if (envConfig.GO_SIDECAR_SPAWN_ENABLED) {
    logger.info(`Go sidecar spawn enabled: ${envConfig.GO_SIDECAR_BINARY_PATH || "./go-sidecar"}`);
    await server.register(goSidecarPlugin, {
      enabled: true,
      binaryPath: envConfig.GO_SIDECAR_BINARY_PATH,
      env: {
        // Pass through relevant env vars to Go sidecar
        DB_CONNECTION_URI: envConfig.DB_CONNECTION_URI,
        REDIS_URL: envConfig.REDIS_URL || "",
        ENCRYPTION_KEY: envConfig.ENCRYPTION_KEY || "",
        AUTH_SECRET: envConfig.AUTH_SECRET || ""
      }
    });
  }

  if (envConfig.GOLANG_SIDECAR_URL && envConfig.GO_SIDECAR_SHADOW_ENABLED) {
    logger.info(
      `Go sidecar shadowing enabled: ${envConfig.GOLANG_SIDECAR_URL} [sampleRate=${envConfig.GO_SIDECAR_SHADOW_SAMPLE_RATE}%]`
    );
    await server.register(shadowToGoSidecar, {
      sidecarUrl: envConfig.GOLANG_SIDECAR_URL,
      sampleRate: envConfig.GO_SIDECAR_SHADOW_SAMPLE_RATE
    });
  }
  // Forwarding plugin disabled in favor of shadowing
  // if (envConfig.GOLANG_SIDECAR_URL) {
  //   logger.info(`Go sidecar is configured: ${envConfig.GOLANG_SIDECAR_URL}`);
  //   await server.register(forwardToGoSidecar, { sidecarUrl: envConfig.GOLANG_SIDECAR_URL });
  // }

  const shouldForwardWritesToPrimaryInstance = Boolean(envConfig.INFISICAL_PRIMARY_INSTANCE_URL);
  if (shouldForwardWritesToPrimaryInstance) {
    logger.info(`Infisical primary instance is configured: ${envConfig.INFISICAL_PRIMARY_INSTANCE_URL}`);

    await server.register(forwardWritesToPrimary, { primaryUrl: envConfig.INFISICAL_PRIMARY_INSTANCE_URL as string });
  }

  await server.register(injectIdentity, { shouldForwardWritesToPrimaryInstance });
  await server.register(injectAssumePrivilege);
  await server.register(injectPermission);
  await server.register(injectPamProjectId);
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
          auditLogStorageDisabled: z.boolean().optional(),
          maxIdentityAccessTokenTTL: z.number().optional()
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
        auditLogStorageDisabled: Boolean(cfg.DISABLE_POSTGRES_AUDIT_LOG_STORAGE),
        maxIdentityAccessTokenTTL: cfg.MAX_MACHINE_IDENTITY_TOKEN_AGE
      };
    }
  });

  // register special routes
  await server.register(registerCertificateEstRouter, { prefix: "/.well-known/est" });
  await server.register(registerPkiScepRouter, { prefix: "/scep" });
  await server.register(registerMcpEndpointMetadataRouter, { prefix: "/mcp-endpoints" });
  await server.register(registerMcpEndpointAuthServerMetadataRouter, {
    prefix: "/.well-known/oauth-authorization-server"
  });
  await server.register(registerRfc9728ProtectedResourceMetadataRouter, {
    prefix: "/.well-known/oauth-protected-resource"
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
  await server.register(
    async (v3Server) => {
      await v3Server.register(registerV3EERoutes);
      await v3Server.register(registerV3Routes);
    },
    { prefix: "/api/v3" }
  );
  await server.register(registerV4Routes, { prefix: "/api/v4" });

  // Note: This is a special route for BDD tests. It's only available in development mode and only for BDD tests.
  // This route should NEVER BE ENABLED IN PRODUCTION!
  if (getConfig().isBddNockApiEnabled) {
    await server.register(registerBddNockRouter, { prefix: "/api/__bdd_nock__" });
  }

  server.addHook("onClose", async () => {
    cronJobs.forEach((job) => job.stop());
    await cronJob.stop();
    await telemetryService.flushAll();
    await eventBusService.close();
    await projectEventsSSEService.close();
  });
};
