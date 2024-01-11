import { registerOrgRoleRouter } from "./org-role-router";
import { registerProjectRoleRouter } from "./project-role-router";
import { registerProjectRouter } from "./project-router";
import { registerSamlRouter } from "./saml-router";
import { registerSecretApprovalPolicyRouter } from "./secret-approval-policy-router";
import { registerSecretApprovalRequestRouter } from "./secret-approval-request-router";
import { registerSecretRotationProviderRouter } from "./secret-rotation-provider-router";
import { registerSecretRotationRouter } from "./secret-rotation-router";
import { registerSecretScanningRouter } from "./secret-scanning-router";
import { registerSnapshotRouter } from "./snapshot-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(
    async (projectServer) => {
      projectServer.register(registerProjectRoleRouter);
      projectServer.register(registerProjectRouter);
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
  await server.register(registerSamlRouter, { prefix: "/sso" });
  await server.register(registerSecretScanningRouter, { prefix: "/secret-scanning" });
  await server.register(registerSecretRotationRouter, { prefix: "/secret-rotations" });
};
