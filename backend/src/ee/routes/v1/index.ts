import { registerProjectTemplateRouter } from "@app/ee/routes/v1/project-template-router";
import { withRoutePrefix } from "@app/server/lib/with-route-prefix";
import { injectCertManagerProjectId } from "@app/server/plugins/inject-cert-manager-project-id";

import { registerAccessApprovalPolicyRouter } from "./access-approval-policy-router";
import { registerAccessApprovalRequestRouter } from "./access-approval-request-router";
import { registerAgentGatewayAccessRouter } from "./agent-gateway-access-router";
import { registerAgentGatewayRouter } from "./agent-gateway-router";
import { registerAgentGatewaySessionRouter } from "./agent-gateway-session-router";
import { registerAgentProxyCaRouter } from "./agent-proxy-ca-router";
import { registerAssumePrivilegeRouter } from "./assume-privilege-router";
import { AUDIT_LOG_STREAM_REGISTER_ROUTER_MAP, registerAuditLogStreamRouter } from "./audit-log-stream-routers";
import { registerCaCrlRouter } from "./certificate-authority-crl-router";
import { registerDeprecatedProjectRoleRouter } from "./deprecated-project-role-router";
import { registerDeprecatedProjectRouter } from "./deprecated-project-router";
import { registerDeprecatedSecretApprovalPolicyRouter } from "./deprecated-secret-approval-policy-router";
import { registerDynamicSecretLeaseRouter } from "./dynamic-secret-lease-router";
import { registerKubernetesDynamicSecretLeaseRouter } from "./dynamic-secret-lease-routers/kubernetes-lease-router";
import { registerDynamicSecretRouter } from "./dynamic-secret-router";
import { registerEmailDomainRouter } from "./email-domain-router";
import { registerExternalKmsRouter } from "./external-kms-router";
import { EXTERNAL_KMS_REGISTER_ROUTER_MAP } from "./external-kms-routers";
import { registerGatewayPoolRouter } from "./gateway-pool-router";
import { registerGatewayRouter } from "./gateway-router";
import { registerGithubOrgSyncRouter } from "./github-org-sync-router";
import { registerGroupRouter } from "./group-router";
import { registerHoneyTokenRouter } from "./honey-token-router";
import { registerIdentityProjectAdditionalPrivilegeRouter } from "./identity-project-additional-privilege-router";
import { registerIdentityTemplateRouter } from "./identity-template-router";
import { registerInsightsRouter } from "./insights-router";
import { registerKmipRouter } from "./kmip-router";
import { registerKmipServerRouter } from "./kmip-server-router";
import { registerKmipSpecRouter } from "./kmip-spec-router";
import { registerLdapRouter } from "./ldap-router";
import { registerLicenseRouter } from "./license-router";
import { registerLicenseV2Router } from "./license-v2-router";
import { registerOidcRouter } from "./oidc-router";
import { registerOrgRoleRouter } from "./org-role-router";
import { registerPamRouters } from "./pam-routers";
import { registerPITRouter } from "./pit-router";
import { registerPkiAcmeRouter } from "./pki-acme-router";
import { registerPkiDiscoveryRouter } from "./pki-discovery-router";
import { registerPkiInstallationRouter } from "./pki-installation-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerProjectRouter } from "./project-router";
import { registerProxiedServiceRouter } from "./proxied-service-router";
import { registerRateLimitRouter } from "./rate-limit-router";
import { registerRelayRouter } from "./relay-router";
import { registerRemovedProductTombstoneRouter } from "./removed-product-tombstone-router";
import { registerSamlRouter } from "./saml-router";
import { registerScimRouter } from "./scim-router";
import { registerSecretApprovalRequestRouter } from "./secret-approval-request-router";
import { registerSecretRouter } from "./secret-router";
import { registerSecretScanningRouter } from "./secret-scanning-router";
import { registerSecretVersionRouter } from "./secret-version-router";
import { registerSubOrgRouter } from "./sub-org-router";
import { registerTrustedIpRouter } from "./trusted-ip-router";
import { registerUserAdditionalPrivilegeRouter } from "./user-additional-privilege-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(registerSubOrgRouter, { prefix: "/sub-organizations" });
  await server.register(registerLicenseRouter, { prefix: "/organizations" });
  await server.register(registerLicenseV2Router, { prefix: "/organizations" });
  await server.register(registerEmailDomainRouter, { prefix: "/email-domains" });

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

  await server.register(registerPITRouter, { prefix: "/pit" });
  await server.register(registerDeprecatedSecretApprovalPolicyRouter, { prefix: "/secret-approvals" });
  await server.register(registerSecretApprovalRequestRouter, {
    prefix: "/secret-approval-requests"
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
  await server.register(registerGatewayPoolRouter, { prefix: "/gateway-pools" });
  await server.register(registerRelayRouter, { prefix: "/relays" });
  await server.register(registerGithubOrgSyncRouter, { prefix: "/github-org-sync-config" });
  await server.register(registerHoneyTokenRouter, { prefix: "/honey-tokens" });

  await server.register(registerProxiedServiceRouter, { prefix: "/proxied-services" });
  await server.register(registerAgentGatewayRouter, { prefix: "/agent-gateways" });
  await server.register(registerAgentGatewayAccessRouter, { prefix: "/agent-gateways" });
  await server.register(registerAgentGatewaySessionRouter, { prefix: "/agent-gateways" });
  await server.register(registerAgentProxyCaRouter, { prefix: "/organization/agent-proxy-ca" });

  await server.register(registerInsightsRouter, { prefix: "/insights" });

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(injectCertManagerProjectId);

      await pkiRouter.register(registerCaCrlRouter, { prefix: "/crl" });
      await pkiRouter.register(registerPkiAcmeRouter, { prefix: "/acme" });
      await pkiRouter.register(registerPkiDiscoveryRouter, { prefix: "/discovery-jobs" });
      await pkiRouter.register(registerPkiInstallationRouter, { prefix: "/installations" });
    },
    { prefix: "/cert-manager" }
  );

  // 410 tombstones for the removed SSH and Agent Sentinel (AI MCP) products; see
  // the router file for rationale and removal conditions.
  await server.register(
    registerRemovedProductTombstoneRouter(
      "The Infisical SSH product has been removed. SSH host access is now available through Infisical PAM (https://infisical.com/docs/documentation/platform/pam/overview). If you are using 'infisical ssh' CLI commands, upgrade to the latest CLI version."
    ),
    { prefix: "/ssh" }
  );
  await server.register(
    registerRemovedProductTombstoneRouter(
      "The Infisical Agent Sentinel (MCP) product has been removed. See Agent Proxy for agent traffic management (https://infisical.com/docs/documentation/platform/agent-proxy/overview)."
    ),
    { prefix: "/ai/mcp" }
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
  await server.register(registerSecretRouter, { prefix: "/secrets" });
  await server.register(registerSecretVersionRouter, { prefix: "/secret" });
  await server.register(registerGroupRouter, { prefix: "/groups" });

  await server.register(
    async (auditLogStreamRouter) => {
      await auditLogStreamRouter.register(registerAuditLogStreamRouter);

      // Provider-specific endpoints
      await Promise.all(
        Object.entries(AUDIT_LOG_STREAM_REGISTER_ROUTER_MAP).map(([provider, router]) =>
          router(withRoutePrefix(auditLogStreamRouter, `/${provider}`))
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
          router(withRoutePrefix(externalKmsRouter, `/${provider}`))
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
      await kmipRouter.register(registerKmipServerRouter, { prefix: "/servers" });
    },
    { prefix: "/kmip" }
  );

  await server.register(registerPamRouters, { prefix: "/pam" });
};
