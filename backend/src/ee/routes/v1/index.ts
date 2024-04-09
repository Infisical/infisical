import { registerAuditLogStreamRouter } from "./audit-log-stream-router";
import { registerAccessApprovalPolicyRouter } from "./access-approval-policy-router";
import { registerAccessApprovalRequestRouter } from "./access-approval-request-router";
import { registerDynamicSecretLeaseRouter } from "./dynamic-secret-lease-router";
import { registerDynamicSecretRouter } from "./dynamic-secret-router";
import { registerGroupRouter } from "./group-router";
import { registerIdentityProjectAdditionalPrivilegeRouter } from "./identity-project-additional-privilege-router";
import { registerLdapRouter } from "./ldap-router";
import { registerLicenseRouter } from "./license-router";
import { registerOrgRoleRouter } from "./org-role-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerProjectRouter } from "./project-router";
import { registerSamlRouter } from "./saml-router";
import { registerScimRouter } from "./scim-router";
import { registerSecretApprovalPolicyRouter } from "./secret-approval-policy-router";
import { registerSecretApprovalRequestRouter } from "./secret-approval-request-router";
import { registerSecretRotationProviderRouter } from "./secret-rotation-provider-router";
import { registerSecretRotationRouter } from "./secret-rotation-router";
import { registerSecretScanningRouter } from "./secret-scanning-router";
import { registerSecretVersionRouter } from "./secret-version-router";
import { registerSnapshotRouter } from "./snapshot-router";
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

  await server.register(
    async (dynamicSecretRouter) => {
      await dynamicSecretRouter.register(registerDynamicSecretRouter);
      await dynamicSecretRouter.register(registerDynamicSecretLeaseRouter, { prefix: "/leases" });
    },
    { prefix: "/dynamic-secrets" }
  );

  await server.register(registerSamlRouter, { prefix: "/sso" });
  await server.register(registerScimRouter, { prefix: "/scim" });
  await server.register(registerLdapRouter, { prefix: "/ldap" });
  await server.register(registerSecretScanningRouter, { prefix: "/secret-scanning" });
  await server.register(registerSecretRotationRouter, { prefix: "/secret-rotations" });
  await server.register(registerSecretVersionRouter, { prefix: "/secret" });
  await server.register(registerGroupRouter, { prefix: "/groups" });
  await server.register(registerAuditLogStreamRouter, { prefix: "/audit-log-streams" });
  await server.register(
    async (privilegeRouter) => {
      await privilegeRouter.register(registerUserAdditionalPrivilegeRouter, { prefix: "/users" });
      await privilegeRouter.register(registerIdentityProjectAdditionalPrivilegeRouter, { prefix: "/identity" });
    },
    { prefix: "/additional-privilege" }
  );
};
