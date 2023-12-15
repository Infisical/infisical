import { registerOrgRoleRouter } from "./org-role-router";
import { registerProjectRoleRouter } from "./project-role-router";

export const registerV1EERoutes = async (server: FastifyZodProvider) => {
  // org role starts with organization
  await server.register(registerOrgRoleRouter, { prefix: "/organization" });
  await server.register(registerProjectRoleRouter, { prefix: "/workspace" });
};
