import {
  registerSecretRotationV2Router,
  SECRET_ROTATION_REGISTER_ROUTER_MAP
} from "@app/ee/routes/v2/secret-rotation-v2-routers";
import {
  registerSecretScanningV2Router,
  SECRET_SCANNING_REGISTER_ROUTER_MAP
} from "@app/ee/routes/v2/secret-scanning-v2-routers";

import { registerDeprecatedProjectRoleRouter } from "./deprecated-project-role-router";
import { registerGatewayV2Router } from "./gateway-router";
import { registerIdentityProjectAdditionalPrivilegeRouter } from "./identity-project-additional-privilege-router";
import { registerSecretApprovalPolicyRouter } from "./secret-approval-policy-router";
import { registerSecretVersionRouter } from "./secret-version-router";

export const registerV2EERoutes = async (server: FastifyZodProvider) => {
  await server.register(
    async (projectRouter) => {
      // this has been depreciated and moved to /api/v1/projects
      await projectRouter.register(registerDeprecatedProjectRoleRouter);
    },
    { prefix: "/workspace" }
  );

  await server.register(registerIdentityProjectAdditionalPrivilegeRouter, {
    prefix: "/identity-project-additional-privilege"
  });

  await server.register(registerGatewayV2Router, { prefix: "/gateways" });

  await server.register(registerSecretApprovalPolicyRouter, { prefix: "/secret-approvals" });

  await server.register(
    async (secretRotationV2Router) => {
      // register generic secret rotation endpoints
      await secretRotationV2Router.register(registerSecretRotationV2Router);

      // register service specific secret rotation endpoints (secret-rotations/postgres-credentials, etc.)
      for await (const [type, router] of Object.entries(SECRET_ROTATION_REGISTER_ROUTER_MAP)) {
        await secretRotationV2Router.register(router, { prefix: `/${type}` });
      }
    },
    { prefix: "/secret-rotations" }
  );

  await server.register(
    async (secretScanningV2Router) => {
      // register generic secret scanning endpoints
      await secretScanningV2Router.register(registerSecretScanningV2Router);

      // register service-specific secret scanning endpoints (gitlab/github, etc.)
      for await (const [type, router] of Object.entries(SECRET_SCANNING_REGISTER_ROUTER_MAP)) {
        await secretScanningV2Router.register(router, { prefix: `data-sources/${type}` });
      }
    },
    { prefix: "/secret-scanning" }
  );

  await server.register(registerSecretVersionRouter, { prefix: "/secret-versions" });
};
