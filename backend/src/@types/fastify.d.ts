import "fastify";

import { Redis } from "ioredis";

import { TUsers } from "@app/db/schemas";
import { TAccessApprovalPolicyServiceFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { TAccessApprovalRequestServiceFactory } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { TAssumePrivilegeServiceFactory } from "@app/ee/services/assume-privilege/assume-privilege-types";
import { TAuditLogServiceFactory, TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-types";
import { TCertificateAuthorityCrlServiceFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-types";
import { TCertificateEstServiceFactory } from "@app/ee/services/certificate-est/certificate-est-service";
import { TDynamicSecretServiceFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-types";
import { TDynamicSecretLeaseServiceFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-types";
import { TExternalKmsServiceFactory } from "@app/ee/services/external-kms/external-kms-service";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGithubOrgSyncServiceFactory } from "@app/ee/services/github-org-sync/github-org-sync-service";
import { TGroupServiceFactory } from "@app/ee/services/group/group-service";
import { TIdentityProjectAdditionalPrivilegeServiceFactory } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-service";
import { TIdentityProjectAdditionalPrivilegeV2ServiceFactory } from "@app/ee/services/identity-project-additional-privilege-v2/identity-project-additional-privilege-v2-service";
import { TKmipClientDALFactory } from "@app/ee/services/kmip/kmip-client-dal";
import { TKmipOperationServiceFactory } from "@app/ee/services/kmip/kmip-operation-service";
import { TKmipServiceFactory } from "@app/ee/services/kmip/kmip-service";
import { TLdapConfigServiceFactory } from "@app/ee/services/ldap-config/ldap-config-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOidcConfigServiceFactory } from "@app/ee/services/oidc/oidc-config-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TPitServiceFactory } from "@app/ee/services/pit/pit-service";
import { TProjectTemplateServiceFactory } from "@app/ee/services/project-template/project-template-types";
import { TProjectUserAdditionalPrivilegeServiceFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-types";
import { RateLimitConfiguration, TRateLimitServiceFactory } from "@app/ee/services/rate-limit/rate-limit-types";
import { TSamlConfigServiceFactory } from "@app/ee/services/saml-config/saml-config-types";
import { TScimServiceFactory } from "@app/ee/services/scim/scim-types";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { TSecretRotationServiceFactory } from "@app/ee/services/secret-rotation/secret-rotation-service";
import { TSecretRotationV2ServiceFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-service";
import { TSecretScanningServiceFactory } from "@app/ee/services/secret-scanning/secret-scanning-service";
import { TSecretScanningV2ServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-service";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { TSshCertificateAuthorityServiceFactory } from "@app/ee/services/ssh/ssh-certificate-authority-service";
import { TSshCertificateTemplateServiceFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-service";
import { TSshHostServiceFactory } from "@app/ee/services/ssh-host/ssh-host-service";
import { TSshHostGroupServiceFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-service";
import { TTrustedIpServiceFactory } from "@app/ee/services/trusted-ip/trusted-ip-types";
import { TAuthMode } from "@app/server/plugins/auth/inject-identity";
import { TApiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { TAuthPasswordFactory } from "@app/services/auth/auth-password-service";
import { TAuthSignupFactory } from "@app/services/auth/auth-signup-service";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { TCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/certificate-authority-service";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificateTemplateServiceFactory } from "@app/services/certificate-template/certificate-template-service";
import { TCmekServiceFactory } from "@app/services/cmek/cmek-service";
import { TExternalGroupOrgRoleMappingServiceFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-service";
import { TExternalMigrationServiceFactory } from "@app/services/external-migration/external-migration-service";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TGroupProjectServiceFactory } from "@app/services/group-project/group-project-service";
import { THsmServiceFactory } from "@app/services/hsm/hsm-service";
import { TIdentityServiceFactory } from "@app/services/identity/identity-service";
import { TIdentityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { TIdentityAliCloudAuthServiceFactory } from "@app/services/identity-alicloud-auth/identity-alicloud-auth-service";
import { TIdentityAwsAuthServiceFactory } from "@app/services/identity-aws-auth/identity-aws-auth-service";
import { TIdentityAzureAuthServiceFactory } from "@app/services/identity-azure-auth/identity-azure-auth-service";
import { TIdentityGcpAuthServiceFactory } from "@app/services/identity-gcp-auth/identity-gcp-auth-service";
import { TIdentityJwtAuthServiceFactory } from "@app/services/identity-jwt-auth/identity-jwt-auth-service";
import { TIdentityKubernetesAuthServiceFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-service";
import { TIdentityLdapAuthServiceFactory } from "@app/services/identity-ldap-auth/identity-ldap-auth-service";
import { TAllowedFields } from "@app/services/identity-ldap-auth/identity-ldap-auth-types";
import { TIdentityOciAuthServiceFactory } from "@app/services/identity-oci-auth/identity-oci-auth-service";
import { TIdentityOidcAuthServiceFactory } from "@app/services/identity-oidc-auth/identity-oidc-auth-service";
import { TIdentityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { TIdentityTokenAuthServiceFactory } from "@app/services/identity-token-auth/identity-token-auth-service";
import { TIdentityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { TIntegrationServiceFactory } from "@app/services/integration/integration-service";
import { TIntegrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TOrgRoleServiceFactory } from "@app/services/org/org-role-service";
import { TOrgServiceFactory } from "@app/services/org/org-service";
import { TOrgAdminServiceFactory } from "@app/services/org-admin/org-admin-service";
import { TPkiAlertServiceFactory } from "@app/services/pki-alert/pki-alert-service";
import { TPkiCollectionServiceFactory } from "@app/services/pki-collection/pki-collection-service";
import { TPkiSubscriberServiceFactory } from "@app/services/pki-subscriber/pki-subscriber-service";
import { TPkiTemplatesServiceFactory } from "@app/services/pki-templates/pki-templates-service";
import { TProjectServiceFactory } from "@app/services/project/project-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectEnvServiceFactory } from "@app/services/project-env/project-env-service";
import { TProjectKeyServiceFactory } from "@app/services/project-key/project-key-service";
import { TProjectMembershipServiceFactory } from "@app/services/project-membership/project-membership-service";
import { TProjectRoleServiceFactory } from "@app/services/project-role/project-role-service";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TSecretBlindIndexServiceFactory } from "@app/services/secret-blind-index/secret-blind-index-service";
import { TSecretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { TSecretImportServiceFactory } from "@app/services/secret-import/secret-import-service";
import { TSecretReplicationServiceFactory } from "@app/services/secret-replication/secret-replication-service";
import { TSecretSharingServiceFactory } from "@app/services/secret-sharing/secret-sharing-service";
import { TSecretSyncServiceFactory } from "@app/services/secret-sync/secret-sync-service";
import { TSecretTagServiceFactory } from "@app/services/secret-tag/secret-tag-service";
import { TServiceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import { TSlackServiceFactory } from "@app/services/slack/slack-service";
import { TSuperAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TTotpServiceFactory } from "@app/services/totp/totp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserServiceFactory } from "@app/services/user/user-service";
import { TUserEngagementServiceFactory } from "@app/services/user-engagement/user-engagement-service";
import { TWebhookServiceFactory } from "@app/services/webhook/webhook-service";
import { TWorkflowIntegrationServiceFactory } from "@app/services/workflow-integration/workflow-integration-service";

declare module "@fastify/request-context" {
  interface RequestContextData {
    reqId: string;
    orgId?: string;
    identityAuthInfo?: {
      identityId: string;
      oidc?: {
        claims: Record<string, string>;
      };
      kubernetes?: {
        namespace: string;
        name: string;
      };
    };
    identityPermissionMetadata?: Record<string, unknown>; // filled by permission service
    assumedPrivilegeDetails?: { requesterId: string; actorId: string; actorType: ActorType; projectId: string };
  }
}

declare module "fastify" {
  interface Session {
    callbackPort: string;
    isAdminLogin: boolean;
  }

  interface FastifyRequest {
    realIp: string;
    // used for mfa session authentication
    mfa: {
      userId: string;
      orgId?: string;
      user: TUsers;
    };
    // identity injection. depending on which kinda of token the information is filled in auth
    auth: TAuthMode;
    permission: {
      authMethod: ActorAuthMethod;
      type: ActorType;
      id: string;
      orgId: string;
    };
    rateLimits: RateLimitConfiguration;
    // passport data
    passportUser: {
      isUserCompleted: boolean;
      providerAuthToken: string;
      externalProviderAccessToken?: string;
    };
    passportMachineIdentity: {
      identityId: string;
      user: {
        uid: string;
        mail?: string;
      };
    };
    kmipUser: {
      projectId: string;
      clientId: string;
      name: string;
    };
    auditLogInfo: Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;
    ssoConfig: Awaited<ReturnType<TSamlConfigServiceFactory["getSaml"]>>;
    ldapConfig: Awaited<ReturnType<TLdapConfigServiceFactory["getLdapCfg"]>> & {
      allowedFields?: TAllowedFields[];
    };
  }

  interface FastifyInstance {
    redis: Redis;
    services: {
      login: TAuthLoginFactory;
      password: TAuthPasswordFactory;
      signup: TAuthSignupFactory;
      authToken: TAuthTokenServiceFactory;
      permission: TPermissionServiceFactory;
      org: TOrgServiceFactory;
      orgRole: TOrgRoleServiceFactory;
      oidc: TOidcConfigServiceFactory;
      superAdmin: TSuperAdminServiceFactory;
      user: TUserServiceFactory;
      group: TGroupServiceFactory;
      groupProject: TGroupProjectServiceFactory;
      apiKey: TApiKeyServiceFactory;
      pkiAlert: TPkiAlertServiceFactory;
      project: TProjectServiceFactory;
      projectMembership: TProjectMembershipServiceFactory;
      projectEnv: TProjectEnvServiceFactory;
      projectKey: TProjectKeyServiceFactory;
      projectRole: TProjectRoleServiceFactory;
      secret: TSecretServiceFactory;
      secretReplication: TSecretReplicationServiceFactory;
      secretTag: TSecretTagServiceFactory;
      secretImport: TSecretImportServiceFactory;
      projectBot: TProjectBotServiceFactory;
      folder: TSecretFolderServiceFactory;
      integration: TIntegrationServiceFactory;
      integrationAuth: TIntegrationAuthServiceFactory;
      webhook: TWebhookServiceFactory;
      serviceToken: TServiceTokenServiceFactory;
      identity: TIdentityServiceFactory;
      identityAccessToken: TIdentityAccessTokenServiceFactory;
      identityProject: TIdentityProjectServiceFactory;
      identityTokenAuth: TIdentityTokenAuthServiceFactory;
      identityUa: TIdentityUaServiceFactory;
      identityKubernetesAuth: TIdentityKubernetesAuthServiceFactory;
      identityGcpAuth: TIdentityGcpAuthServiceFactory;
      identityAliCloudAuth: TIdentityAliCloudAuthServiceFactory;
      identityAwsAuth: TIdentityAwsAuthServiceFactory;
      identityAzureAuth: TIdentityAzureAuthServiceFactory;
      identityOciAuth: TIdentityOciAuthServiceFactory;
      identityOidcAuth: TIdentityOidcAuthServiceFactory;
      identityJwtAuth: TIdentityJwtAuthServiceFactory;
      identityLdapAuth: TIdentityLdapAuthServiceFactory;
      accessApprovalPolicy: TAccessApprovalPolicyServiceFactory;
      accessApprovalRequest: TAccessApprovalRequestServiceFactory;
      secretApprovalPolicy: TSecretApprovalPolicyServiceFactory;
      secretApprovalRequest: TSecretApprovalRequestServiceFactory;
      secretRotation: TSecretRotationServiceFactory;
      snapshot: TSecretSnapshotServiceFactory;
      saml: TSamlConfigServiceFactory;
      scim: TScimServiceFactory;
      ldap: TLdapConfigServiceFactory;
      auditLog: TAuditLogServiceFactory;
      auditLogStream: TAuditLogStreamServiceFactory;
      certificate: TCertificateServiceFactory;
      certificateTemplate: TCertificateTemplateServiceFactory;
      sshCertificateAuthority: TSshCertificateAuthorityServiceFactory;
      sshCertificateTemplate: TSshCertificateTemplateServiceFactory;
      sshHost: TSshHostServiceFactory;
      sshHostGroup: TSshHostGroupServiceFactory;
      certificateAuthority: TCertificateAuthorityServiceFactory;
      certificateAuthorityCrl: TCertificateAuthorityCrlServiceFactory;
      certificateEst: TCertificateEstServiceFactory;
      pkiCollection: TPkiCollectionServiceFactory;
      pkiSubscriber: TPkiSubscriberServiceFactory;
      secretScanning: TSecretScanningServiceFactory;
      license: TLicenseServiceFactory;
      trustedIp: TTrustedIpServiceFactory;
      secretBlindIndex: TSecretBlindIndexServiceFactory;
      telemetry: TTelemetryServiceFactory;
      dynamicSecret: TDynamicSecretServiceFactory;
      dynamicSecretLease: TDynamicSecretLeaseServiceFactory;
      projectUserAdditionalPrivilege: TProjectUserAdditionalPrivilegeServiceFactory;
      identityProjectAdditionalPrivilege: TIdentityProjectAdditionalPrivilegeServiceFactory;
      identityProjectAdditionalPrivilegeV2: TIdentityProjectAdditionalPrivilegeV2ServiceFactory;
      secretSharing: TSecretSharingServiceFactory;
      rateLimit: TRateLimitServiceFactory;
      userEngagement: TUserEngagementServiceFactory;
      externalKms: TExternalKmsServiceFactory;
      hsm: THsmServiceFactory;
      orgAdmin: TOrgAdminServiceFactory;
      slack: TSlackServiceFactory;
      workflowIntegration: TWorkflowIntegrationServiceFactory;
      cmek: TCmekServiceFactory;
      migration: TExternalMigrationServiceFactory;
      externalGroupOrgRoleMapping: TExternalGroupOrgRoleMappingServiceFactory;
      projectTemplate: TProjectTemplateServiceFactory;
      totp: TTotpServiceFactory;
      appConnection: TAppConnectionServiceFactory;
      secretSync: TSecretSyncServiceFactory;
      kmip: TKmipServiceFactory;
      kmipOperation: TKmipOperationServiceFactory;
      gateway: TGatewayServiceFactory;
      secretRotationV2: TSecretRotationV2ServiceFactory;
      microsoftTeams: TMicrosoftTeamsServiceFactory;
      assumePrivileges: TAssumePrivilegeServiceFactory;
      githubOrgSync: TGithubOrgSyncServiceFactory;
      folderCommit: TFolderCommitServiceFactory;
      pit: TPitServiceFactory;
      secretScanningV2: TSecretScanningV2ServiceFactory;
      internalCertificateAuthority: TInternalCertificateAuthorityServiceFactory;
      pkiTemplate: TPkiTemplatesServiceFactory;
    };
    // this is exclusive use for middlewares in which we need to inject data
    // everywhere else access using service layer
    store: {
      user: Pick<TUserDALFactory, "findById">;
      kmipClient: Pick<TKmipClientDALFactory, "findByProjectAndClientId">;
    };
  }
}
