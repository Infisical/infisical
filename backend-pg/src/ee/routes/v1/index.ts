import { registerOrgRoleRouter } from "./org-role-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerSecretApprovalPolicyRouter } from "./secret-approval-policy-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(registerProjectRoleRouter, { prefix: "/workspace" });
  await server.register(registerSecretApprovalPolicyRouter, { prefix: "/secret-approvals" });
};
