import { registerIdentityOrgRouter } from "./identity-org-router";
import { registerIdentityProjectRouter } from "./identity-project-router";
import { registerMfaRouter } from "./mfa-router";
import { registerOrgRouter } from "./organization-router";
import { registerProjectMembershipRouter } from "./project-membership-router";
import { registerProjectRouter } from "./project-router";
import { registerServiceTokenRouter } from "./service-token-router";
import { registerUserRouter } from "./user-router";

export const registerV2Routes = async (server: FastifyZodProvider) => {
  await server.register(registerMfaRouter, { prefix: "/auth" });
  await server.register(registerUserRouter, { prefix: "/users" });
  await server.register(registerServiceTokenRouter, { prefix: "/service-token" });
  await server.register(
    async (orgRouter) => {
      await orgRouter.register(registerOrgRouter);
      await orgRouter.register(registerIdentityOrgRouter);
    },
    { prefix: "/organizations" }
  );
  await server.register(
    async (projectServer) => {
      await projectServer.register(registerProjectRouter);
      await projectServer.register(registerIdentityProjectRouter);
      await projectServer.register(registerProjectMembershipRouter);
    },
    { prefix: "/workspace" }
  );
};
