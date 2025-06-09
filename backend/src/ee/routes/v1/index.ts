import { registerProjectTemplateRouter } from "@app/ee/routes/v1/project-template-router";

import { registerAccessApprovalPolicyRouter } from "./access-approval-policy-router";
import { registerAccessApprovalRequestRouter } from "./access-approval-request-router";
import { registerAssumePrivilegeRouter } from "./assume-privilege-router";
import { registerAuditLogStreamRouter } from "./audit-log-stream-router";
import { registerCaCrlRouter } from "./certificate-authority-crl-router";
import { registerDynamicSecretLeaseRouter } from "./dynamic-secret-lease-router";
import { registerDynamicSecretRouter } from "./dynamic-secret-router";
import { registerExternalKmsRouter } from "./external-kms-router";
import { registerGatewayRouter } from "./gateway-router";
import { registerGithubOrgSyncRouter } from "./github-org-sync-router";
import { registerGroupRouter } from "./group-router";
import { registerIdentityProjectAdditionalPrivilegeRouter } from "./identity-project-additional-privilege-router";
import { registerKmipRouter } from "./kmip-router";
import { registerKmipSpecRouter } from "./kmip-spec-router";
import { registerLdapRouter } from "./ldap-router";
import { registerLicenseRouter } from "./license-router";
import { registerOidcRouter } from "./oidc-router";
import { registerOrgRoleRouter } from "./org-role-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerProjectRouter } from "./project-router";
import { registerRateLimitRouter } from "./rate-limit-router";
import { registerSamlRouter } from "./saml-router";
import { registerScimRouter } from "./scim-router";
import { registerSecretApprovalPolicyRouter } from "./secret-approval-policy-router";
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
import { registerTrustedIpRouter } from "./trusted-ip-router";
import { registerUserAdditionalPrivilegeRouter } from "./user-additional-privilege-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(registerLicenseRouter, { prefix: "/organizations" });
  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerProjectRoleRouter);
      await projectRouter.register(registerProjectRouter);
      await projectRouter.register(registerTrustedIpRouter);
      await projectRouter.register(registerAssumePrivilegeRouter);
    },
    { prefix: "/workspace" }
  );
  await server.register(registerSnapshotRouter, { prefix: "/secret-snapshot" });
  await server.register(registerSecretApprovalPolicyRouter, { prefix: "/secret-approvals" });
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
    },
    { prefix: "/dynamic-secrets" }
  );

  await server.register(registerGatewayRouter, { prefix: "/gateways" });
  await server.register(registerGithubOrgSyncRouter, { prefix: "/github-org-sync-config" });

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(registerCaCrlRouter, { prefix: "/crl" });
    },
    { prefix: "/pki" }
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
  await server.register(registerAuditLogStreamRouter, { prefix: "/audit-log-streams" });
  await server.register(registerUserAdditionalPrivilegeRouter, { prefix: "/user-project-additional-privilege" });
  await server.register(
    async (privilegeRouter) => {
      await privilegeRouter.register(registerIdentityProjectAdditionalPrivilegeRouter, { prefix: "/identity" });
    },
    { prefix: "/additional-privilege" }
  );

  await server.register(registerExternalKmsRouter, {
    prefix: "/external-kms"
  });

  await server.register(registerProjectTemplateRouter, { prefix: "/project-templates" });

  await server.register(
    async (kmipRouter) => {
      await kmipRouter.register(registerKmipRouter);
      await kmipRouter.register(registerKmipSpecRouter, { prefix: "/spec" });
    },
    { prefix: "/kmip" }
  );
};
