import { registerPamAccessRequestRouter } from "./pam-access-request-router";
import { registerPamAccountRouter } from "./pam-account-router";
import { registerPamAccountTemplateRouter } from "./pam-account-template-router";
import { registerPamApprovalConfigurationRouter } from "./pam-approval-configuration-router";
import { registerPamFolderRouter } from "./pam-folder-router";
import {
  registerPamAccountMembershipRouter,
  registerPamFolderMembershipRouter,
  registerPamProductMembershipRouter
} from "./pam-membership-router";
import { registerPamResourceRoleRouter } from "./pam-resource-role-router";
import { registerPamSessionChunkRouter } from "./pam-session-chunk-router";
import { registerPamSessionRouter, registerPamWebAccessRouter } from "./pam-session-router";

export const registerPamRouters = async (server: FastifyZodProvider) => {
  await server.register(registerPamAccountTemplateRouter, { prefix: "/account-templates" });
  await server.register(registerPamFolderRouter, { prefix: "/folders" });
  await server.register(registerPamFolderMembershipRouter, { prefix: "/folders" });
  await server.register(registerPamApprovalConfigurationRouter, { prefix: "/folders" });
  await server.register(registerPamAccountRouter, { prefix: "/accounts" });
  await server.register(registerPamAccountMembershipRouter, { prefix: "/accounts" });
  await server.register(registerPamWebAccessRouter, { prefix: "/accounts" });
  await server.register(registerPamProductMembershipRouter, { prefix: "/memberships" });
  await server.register(registerPamResourceRoleRouter, { prefix: "/roles" });
  await server.register(registerPamSessionRouter, { prefix: "/sessions" });
  await server.register(registerPamSessionChunkRouter, { prefix: "/sessions" });
  await server.register(registerPamAccessRequestRouter, { prefix: "/access-requests" });
};
