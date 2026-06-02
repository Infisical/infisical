import { registerCertManagerAccessGroupsRouter } from "./groups-router";
import { registerCertManagerAccessIdentitiesRouter } from "./identities-router";
import { registerCertManagerAccessRolesRouter } from "./roles-router";
import { registerCertManagerAccessUsersRouter } from "./users-router";

export const registerCertManagerAccessRouter = async (server: FastifyZodProvider) => {
  await registerCertManagerAccessUsersRouter(server);
  await registerCertManagerAccessIdentitiesRouter(server);
  await registerCertManagerAccessGroupsRouter(server);
  await registerCertManagerAccessRolesRouter(server);
};
