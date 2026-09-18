import { registerSignerGroupMembershipRouter } from "./groups-router";
import { registerSignerIdentityMembershipRouter } from "./identities-router";
import { registerSignerUserMembershipRouter } from "./users-router";

export const registerSignerMembershipRoutes = async (server: FastifyZodProvider) => {
  await registerSignerUserMembershipRouter(server);
  await registerSignerIdentityMembershipRouter(server);
  await registerSignerGroupMembershipRouter(server);
};
