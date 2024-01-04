import { registerOrgRoleRouter } from "./org-role-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerSecretApprovalPolicyRouter } from "./secret-approval-policy-router";
import { registerSecretApprovalRequestRouter } from "./secret-approval-request-router";
import { registerSecretRotationProviderRouter } from "./secret-rotation-provider-router";
import { registerSecretRotationRouter } from "./secret-rotation-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(registerProjectRoleRouter, { prefix: "/workspace" });
  await server.register(registerSecretApprovalPolicyRouter, { prefix: "/secret-approvals" });
  await server.register(registerSecretApprovalRequestRouter, {
    prefix: "/secret-approval-requests"
  });
  await server.register(registerSecretRotationProviderRouter, {
    prefix: "/secret-rotation-providers"
  });
  await server.register(registerSecretRotationRouter, { prefix: "/secret-rotations" });
};
