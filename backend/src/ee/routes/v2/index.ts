import {
  registerSecretRotationV2Router,
  SECRET_ROTATION_REGISTER_ROUTER_MAP
} from "@app/ee/routes/v2/secret-rotation-v2-routers";

import { registerIdentityProjectAdditionalPrivilegeRouter } from "./identity-project-additional-privilege-router";
import { registerProjectRoleRouter } from "./project-role-router";

export const registerV2EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerProjectRoleRouter);
    },
    { prefix: "/workspace" }
  );

  await server.register(registerIdentityProjectAdditionalPrivilegeRouter, {
    prefix: "/identity-project-additional-privilege"
  });

  await server.register(
    async (secretRotationV2Router) => {
      // register generic secret sync endpoints
      await secretRotationV2Router.register(registerSecretRotationV2Router);

      // register service specific secret rotation endpoints (secret-rotations/postgres-credentials, etc.)
      for await (const [type, router] of Object.entries(SECRET_ROTATION_REGISTER_ROUTER_MAP)) {
        await secretRotationV2Router.register(router, { prefix: `/${type}` });
      }
    },
    { prefix: "/secret-rotations" }
  );
};
