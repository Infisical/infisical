import { registerAdminRouter } from "./admin-router";
import { registerAuthRoutes } from "./auth-router";
import { registerInviteOrgRouter } from "./invite-org-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerProjectEnvRouter } from "./project-env-router";
import { registerProjectKeyRouter } from "./project-key-router";
import { registerProjectMembershipRouter } from "./project-membership-router";
import { registerProjectRouter } from "./project-router";
import { registerSecretFolderRouter } from "./secret-folder-router";
import { registerSecretImportRouter } from "./secret-import-router";
import { registerSsoRouter } from "./sso-router";
import { registerUserActionRouter } from "./user-action-router";
import { registerUserRouter } from "./user-router";

export const registerV1Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSsoRouter, { prefix: "/sso" });
  await server.register(registerAuthRoutes, { prefix: "/auth" });
  await server.register(registerPasswordRouter, { prefix: "/password" });
  await server.register(registerOrgRouter, { prefix: "/organization" });
  await server.register(registerAdminRouter, { prefix: "/admin" });
  await server.register(registerUserRouter, { prefix: "/user" });
  await server.register(registerInviteOrgRouter, { prefix: "/invite-org" });
  await server.register(registerUserActionRouter, { prefix: "/user-action" });
  await server.register(registerSecretImportRouter, { prefix: "/secret-imports" });
  await server.register(registerSecretFolderRouter, { prefix: "/folders" });

  await server.register(
    async (projectServer) => {
      await projectServer.register(registerProjectRouter);
      await projectServer.register(registerProjectEnvRouter);
      await projectServer.register(registerProjectKeyRouter);
      await projectServer.register(registerProjectMembershipRouter);
    },
    { prefix: "/workspace" }
  );
};
