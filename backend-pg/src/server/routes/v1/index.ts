import { registerAdminRouter } from "./admin-router";
import { registerAuthRoutes } from "./auth-router";
import { registerInviteOrgRouter } from "./invite-org-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerUserActionRouter } from "./user-action-router";
import { registerUserRouter } from "./user-router";

export const registerV1Routes = async (server: FastifyZodProvider) => {
  await server.register(registerAuthRoutes, { prefix: "/auth" });
  await server.register(registerPasswordRouter, { prefix: "/password" });
  await server.register(registerOrgRouter, { prefix: "/organization" });
  await server.register(registerAdminRouter, { prefix: "/admin" });
  await server.register(registerUserRouter, { prefix: "/user" });
  await server.register(registerInviteOrgRouter, { prefix: "/invite-org" });
  await server.register(registerUserActionRouter, { prefix: "/user-action" });
};
