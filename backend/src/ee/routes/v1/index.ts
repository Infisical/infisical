import { registerProjectTemplateRouter } from "@app/ee/routes/v1/project-template-router";

import { registerAccessApprovalPolicyRouter } from "./access-approval-policy-router";
import { registerAccessApprovalRequestRouter } from "./access-approval-request-router";
import { registerAiMcpActivityLogRouter } from "./ai-mcp-activity-log-router";
import { registerAiMcpEndpointRouter } from "./ai-mcp-endpoint-router";
import { registerAiMcpServerRouter } from "./ai-mcp-server-router";
import { registerAssumePrivilegeRouter } from "./assume-privilege-router";
import { AUDIT_LOG_STREAM_REGISTER_ROUTER_MAP, registerAuditLogStreamRouter } from "./audit-log-stream-routers";
import { registerCaCrlRouter } from "./certificate-authority-crl-router";
import { registerDeprecatedProjectRoleRouter } from "./deprecated-project-role-router";
import { registerDeprecatedProjectRouter } from "./deprecated-project-router";
import { registerDeprecatedSecretApprovalPolicyRouter } from "./deprecated-secret-approval-policy-router";
import { registerDynamicSecretLeaseRouter } from "./dynamic-secret-lease-router";
import { registerKubernetesDynamicSecretLeaseRouter } from "./dynamic-secret-lease-routers/kubernetes-lease-router";
import { registerDynamicSecretRouter } from "./dynamic-secret-router";
import { registerExternalKmsRouter } from "./external-kms-router";
import { EXTERNAL_KMS_REGISTER_ROUTER_MAP } from "./external-kms-routers";
import { registerGatewayRouter } from "./gateway-router";
import { registerGithubOrgSyncRouter } from "./github-org-sync-router";
import { registerGroupRouter } from "./group-router";
import { registerIdentityProjectAdditionalPrivilegeRouter } from "./identity-project-additional-privilege-router";
import { registerIdentityTemplateRouter } from "./identity-template-router";
import { registerKmipRouter } from "./kmip-router";
import { registerKmipSpecRouter } from "./kmip-spec-router";
import { registerLdapRouter } from "./ldap-router";
import { registerLicenseRouter } from "./license-router";
import { registerNhiRouter } from "./nhi-router";
import { registerOidcRouter } from "./oidc-router";
import { registerOrgRoleRouter } from "./org-role-router";
import { PAM_ACCOUNT_REGISTER_ROUTER_MAP } from "./pam-account-routers";
import { registerPamAccountRouter } from "./pam-account-routers/pam-account-router";
import { registerPamFolderRouter } from "./pam-folder-router";
import { PAM_RESOURCE_REGISTER_ROUTER_MAP } from "./pam-resource-routers";
import { registerPamResourceRouter } from "./pam-resource-routers/pam-resource-router";
import { registerPamSessionRouter } from "./pam-session-router";
import { registerPITRouter } from "./pit-router";
import { registerPkiAcmeRouter } from "./pki-acme-router";
import { registerPkiDiscoveryRouter } from "./pki-discovery-router";
import { registerPkiInstallationRouter } from "./pki-installation-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerProjectRouter } from "./project-router";
import { registerRateLimitRouter } from "./rate-limit-router";
import { registerRelayRouter } from "./relay-router";
import { registerSamlRouter } from "./saml-router";
import { registerScimRouter } from "./scim-router";
import { registerSecretApprovalRequestRouter } from "./secret-approval-request-router";
import { registerSecretRotationProviderRouter } from "./secret-rotation-provider-router";
import { registerSecretRotationRouter } from "./secret-rotation-router";
import { registerSecretRouter } from "./secret-router";
import { registerSecretScanningRouter } from "./secret-scanning-router";
import { registerSecretVersionRouter } from "./secret-version-router";
import { registerSnapshotRouter } from "./snapshot-router";
import { registerSshCaRouter } from "./ssh-certificate-authority-router";
import { registerSshCertRouter } from "./ssh-certificate-router";
import { registerSshCertificateTemplateRouter } from "./ssh-certificate-template-router";
import { registerSshHostGroupRouter } from "./ssh-host-group-router";
import { registerSshHostRouter } from "./ssh-host-router";
import { registerSubOrgRouter } from "./sub-org-router";
import { registerTrustedIpRouter } from "./trusted-ip-router";
import { registerUserAdditionalPrivilegeRouter } from "./user-additional-privilege-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(registerSubOrgRouter, { prefix: "/sub-organizations" });
  await server.register(registerLicenseRouter, { prefix: "/organizations" });

  // depreciated in favour of infisical workspace
  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerDeprecatedProjectRoleRouter);
      await projectRouter.register(registerDeprecatedProjectRouter);
    },
    { prefix: "/workspace" }
  );

  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerProjectRoleRouter);
      await projectRouter.register(registerTrustedIpRouter);
      await projectRouter.register(registerAssumePrivilegeRouter);
      await projectRouter.register(registerProjectRouter);
    },
    { prefix: "/projects" }
  );

  await server.register(registerSnapshotRouter, { prefix: "/secret-snapshot" });
  await server.register(registerPITRouter, { prefix: "/pit" });
  await server.register(registerDeprecatedSecretApprovalPolicyRouter, { prefix: "/secret-approvals" });
  await server.register(registerSecretApprovalRequestRouter, {
    prefix: "/secret-approval-requests"
  });
  await server.register(registerSecretRotationProviderRouter, {
    prefix: "/secret-rotation-providers"
  });

  await server.register(registerAccessApprovalPolicyRouter, { prefix: "/access-approvals/policies" });
  await server.register(registerAccessApprovalRequestRouter, { prefix: "/access-approvals/requests" });
  await server.register(registerRateLimitRouter, { prefix: "/rate-limit" });

  await server.register(
    async (dynamicSecretRouter) => {
      await dynamicSecretRouter.register(registerDynamicSecretRouter);
      await dynamicSecretRouter.register(registerDynamicSecretLeaseRouter, { prefix: "/leases" });
      await dynamicSecretRouter.register(registerKubernetesDynamicSecretLeaseRouter, { prefix: "/leases/kubernetes" });
    },
    { prefix: "/dynamic-secrets" }
  );

  await server.register(registerGatewayRouter, { prefix: "/gateways" });
  await server.register(registerRelayRouter, { prefix: "/relays" });
  await server.register(registerGithubOrgSyncRouter, { prefix: "/github-org-sync-config" });

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(registerCaCrlRouter, { prefix: "/crl" });
      await pkiRouter.register(registerPkiAcmeRouter, { prefix: "/acme" });
      await pkiRouter.register(registerPkiDiscoveryRouter, { prefix: "/discovery-jobs" });
      await pkiRouter.register(registerPkiInstallationRouter, { prefix: "/installations" });
    },
    { prefix: "/cert-manager" }
  );

  await server.register(
    async (sshRouter) => {
      await sshRouter.register(registerSshCaRouter, { prefix: "/ca" });
      await sshRouter.register(registerSshCertRouter, { prefix: "/certificates" });
      await sshRouter.register(registerSshCertificateTemplateRouter, { prefix: "/certificate-templates" });
      await sshRouter.register(registerSshHostRouter, { prefix: "/hosts" });
      await sshRouter.register(registerSshHostGroupRouter, { prefix: "/host-groups" });
    },
    { prefix: "/ssh" }
  );

  await server.register(
    async (ssoRouter) => {
      await ssoRouter.register(registerSamlRouter);
      await ssoRouter.register(registerOidcRouter, { prefix: "/oidc" });
    },
    { prefix: "/sso" }
  );

  await server.register(registerScimRouter, { prefix: "/scim" });
  await server.register(registerLdapRouter, { prefix: "/ldap" });
  await server.register(registerSecretScanningRouter, { prefix: "/secret-scanning" });
  await server.register(registerSecretRotationRouter, { prefix: "/secret-rotations" });
  await server.register(registerSecretRouter, { prefix: "/secrets" });
  await server.register(registerSecretVersionRouter, { prefix: "/secret" });
  await server.register(registerGroupRouter, { prefix: "/groups" });

  await server.register(
    async (auditLogStreamRouter) => {
      await auditLogStreamRouter.register(registerAuditLogStreamRouter);

      // Provider-specific endpoints
      await Promise.all(
        Object.entries(AUDIT_LOG_STREAM_REGISTER_ROUTER_MAP).map(([provider, router]) =>
          auditLogStreamRouter.register(router, { prefix: `/${provider}` })
        )
      );
    },
    { prefix: "/audit-log-streams" }
  );

  await server.register(registerUserAdditionalPrivilegeRouter, { prefix: "/user-project-additional-privilege" });
  await server.register(
    async (privilegeRouter) => {
      await privilegeRouter.register(registerIdentityProjectAdditionalPrivilegeRouter, { prefix: "/identity" });
    },
    { prefix: "/additional-privilege" }
  );

  await server.register(
    async (externalKmsRouter) => {
      await externalKmsRouter.register(registerExternalKmsRouter);

      // Provider-specific endpoints
      await Promise.all(
        Object.entries(EXTERNAL_KMS_REGISTER_ROUTER_MAP).map(([provider, router]) =>
          externalKmsRouter.register(router, { prefix: `/${provider}` })
        )
      );
    },
    { prefix: "/external-kms" }
  );
  await server.register(registerIdentityTemplateRouter, { prefix: "/identity-templates" });

  await server.register(registerProjectTemplateRouter, { prefix: "/project-templates" });

  await server.register(
    async (kmipRouter) => {
      await kmipRouter.register(registerKmipRouter);
      await kmipRouter.register(registerKmipSpecRouter, { prefix: "/spec" });
    },
    { prefix: "/kmip" }
  );

  await server.register(
    async (pamRouter) => {
      await pamRouter.register(registerPamFolderRouter, { prefix: "/folders" });
      await pamRouter.register(registerPamSessionRouter, { prefix: "/sessions" });

      await pamRouter.register(
        async (pamAccountRouter) => {
          await pamAccountRouter.register(registerPamAccountRouter);

          // Provider-specific endpoints
          await Promise.all(
            Object.entries(PAM_ACCOUNT_REGISTER_ROUTER_MAP).map(([provider, router]) =>
              pamAccountRouter.register(router, { prefix: `/${provider}` })
            )
          );
        },
        { prefix: "/accounts" }
      );

      await pamRouter.register(
        async (pamResourceRouter) => {
          await pamResourceRouter.register(registerPamResourceRouter);

          // Provider-specific endpoints
          await Promise.all(
            Object.entries(PAM_RESOURCE_REGISTER_ROUTER_MAP).map(([provider, router]) =>
              pamResourceRouter.register(router, { prefix: `/${provider}` })
            )
          );
        },
        { prefix: "/resources" }
      );
    },
    { prefix: "/pam" }
  );

  await server.register(
    async (aiRouter) => {
      await aiRouter.register(registerAiMcpServerRouter, { prefix: "/mcp/servers" });
      await aiRouter.register(registerAiMcpEndpointRouter, { prefix: "/mcp/endpoints" });
      await aiRouter.register(registerAiMcpActivityLogRouter, { prefix: "/mcp/activity-logs" });
    },
    { prefix: "/ai" }
  );

  await server.register(registerNhiRouter, { prefix: "/nhi" });
};
