import "fastify";

import { TUsers } from "@app/db/schemas";
import { TAccessApprovalPolicyServiceFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-service";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-service";
import { TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
import { TDynamicSecretServiceFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-service";
import { TDynamicSecretLeaseServiceFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-service";
import { TGroupServiceFactory } from "@app/ee/services/group/group-service";
import { TIdentityProjectAdditionalPrivilegeServiceFactory } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-service";
import { TLdapConfigServiceFactory } from "@app/ee/services/ldap-config/ldap-config-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TProjectUserAdditionalPrivilegeServiceFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-service";
import { TSamlConfigServiceFactory } from "@app/ee/services/saml-config/saml-config-service";
import { TScimServiceFactory } from "@app/ee/services/scim/scim-service";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { TSecretRotationServiceFactory } from "@app/ee/services/secret-rotation/secret-rotation-service";
import { TSecretScanningServiceFactory } from "@app/ee/services/secret-scanning/secret-scanning-service";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { TTrustedIpServiceFactory } from "@app/ee/services/trusted-ip/trusted-ip-service";
import { TAuthMode } from "@app/server/plugins/auth/inject-identity";
import { TApiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { TAuthPasswordFactory } from "@app/services/auth/auth-password-service";
import { TAuthSignupFactory } from "@app/services/auth/auth-signup-service";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TGroupProjectServiceFactory } from "@app/services/group-project/group-project-service";
import { TIdentityServiceFactory } from "@app/services/identity/identity-service";
import { TIdentityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { TIdentityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { TIdentityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { TIntegrationServiceFactory } from "@app/services/integration/integration-service";
import { TIntegrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { TOrgRoleServiceFactory } from "@app/services/org/org-role-service";
import { TOrgServiceFactory } from "@app/services/org/org-service";
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
import { TSecretTagServiceFactory } from "@app/services/secret-tag/secret-tag-service";
import { TServiceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import { TSuperAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserServiceFactory } from "@app/services/user/user-service";
import { TWebhookServiceFactory } from "@app/services/webhook/webhook-service";

declare module "fastify" {
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
    // passport data
    passportUser: {
      isUserCompleted: string;
      providerAuthToken: string;
    };
    auditLogInfo: Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;
    ssoConfig: Awaited<ReturnType<TSamlConfigServiceFactory["getSaml"]>>;
    ldapConfig: Awaited<ReturnType<TLdapConfigServiceFactory["getLdapCfg"]>>;
  }

  interface FastifyInstance {
    services: {
      login: TAuthLoginFactory;
      password: TAuthPasswordFactory;
      signup: TAuthSignupFactory;
      authToken: TAuthTokenServiceFactory;
      permission: TPermissionServiceFactory;
      org: TOrgServiceFactory;
      orgRole: TOrgRoleServiceFactory;
      superAdmin: TSuperAdminServiceFactory;
      user: TUserServiceFactory;
      group: TGroupServiceFactory;
      groupProject: TGroupProjectServiceFactory;
      apiKey: TApiKeyServiceFactory;
      project: TProjectServiceFactory;
      projectMembership: TProjectMembershipServiceFactory;
      projectEnv: TProjectEnvServiceFactory;
      projectKey: TProjectKeyServiceFactory;
      projectRole: TProjectRoleServiceFactory;
      secret: TSecretServiceFactory;
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
      identityUa: TIdentityUaServiceFactory;
      accessApprovalPolicy: TAccessApprovalPolicyServiceFactory;
      secretApprovalPolicy: TSecretApprovalPolicyServiceFactory;
      secretApprovalRequest: TSecretApprovalRequestServiceFactory;
      secretRotation: TSecretRotationServiceFactory;
      snapshot: TSecretSnapshotServiceFactory;
      saml: TSamlConfigServiceFactory;
      scim: TScimServiceFactory;
      ldap: TLdapConfigServiceFactory;
      auditLog: TAuditLogServiceFactory;
      auditLogStream: TAuditLogStreamServiceFactory;
      secretScanning: TSecretScanningServiceFactory;
      license: TLicenseServiceFactory;
      trustedIp: TTrustedIpServiceFactory;
      secretBlindIndex: TSecretBlindIndexServiceFactory;
      telemetry: TTelemetryServiceFactory;
      dynamicSecret: TDynamicSecretServiceFactory;
      dynamicSecretLease: TDynamicSecretLeaseServiceFactory;
      projectUserAdditionalPrivilege: TProjectUserAdditionalPrivilegeServiceFactory;
      identityProjectAdditionalPrivilege: TIdentityProjectAdditionalPrivilegeServiceFactory;
    };
    // this is exclusive use for middlewares in which we need to inject data
    // everywhere else access using service layer
    store: {
      user: Pick<TUserDALFactory, "findById">;
    };
  }
}
