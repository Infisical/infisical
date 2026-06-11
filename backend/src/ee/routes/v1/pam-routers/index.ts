import { registerPamAccountRouter } from "./pam-account-router";
import { registerPamAccountTemplateRouter } from "./pam-account-template-router";
import { registerPamFolderRouter } from "./pam-folder-router";
import { registerPamMembershipRouter } from "./pam-membership-router";
import { registerPamResourceRoleRouter } from "./pam-resource-role-router";
import { registerPamSessionChunkRouter } from "./pam-session-chunk-router";
import { registerPamSessionRouter } from "./pam-session-router";

export const registerPamRouters = async (server: FastifyZodProvider) => {
  await server.register(registerPamAccountTemplateRouter, { prefix: "/account-templates" });
  await server.register(registerPamFolderRouter, { prefix: "/folders" });
  await server.register(registerPamAccountRouter, { prefix: "/accounts" });
  await server.register(registerPamMembershipRouter, { prefix: "/members" });
  await server.register(registerPamResourceRoleRouter, { prefix: "/resource-roles" });
  await server.register(registerPamSessionRouter, { prefix: "/sessions" });
  await server.register(registerPamSessionChunkRouter, { prefix: "/sessions" });
};
