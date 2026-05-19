import { registerPkiApplicationGroupMembershipRouter } from "./groups-router";
import { registerPkiApplicationIdentityMembershipRouter } from "./identities-router";
import { registerPkiApplicationUserMembershipRouter } from "./users-router";

export const registerPkiApplicationMembershipRoutes = async (server: FastifyZodProvider) => {
  await registerPkiApplicationUserMembershipRouter(server);
  await registerPkiApplicationIdentityMembershipRouter(server);
  await registerPkiApplicationGroupMembershipRouter(server);
};
