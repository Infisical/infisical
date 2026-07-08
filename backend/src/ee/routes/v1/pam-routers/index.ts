import { registerPamAccessRequestRouter } from "./pam-access-request-router";
import { registerPamAccountRouter } from "./pam-account-router";
import { registerPamAccountTemplateRouter } from "./pam-account-template-router";
import { registerPamApprovalConfigurationRouter } from "./pam-approval-configuration-router";
import { registerPamDiscoveryRouter } from "./pam-discovery-router";
import { registerPamFolderRouter } from "./pam-folder-router";
import {
  registerPamAccountMembershipRouter,
  registerPamFolderMembershipRouter,
  registerPamProductMembershipRouter
} from "./pam-membership-router";
import { registerPamProjectRouter } from "./pam-project-router";
import { registerPamResourceRoleRouter } from "./pam-resource-role-router";
import { registerPamSessionChunkRouter } from "./pam-session-chunk-router";
import { registerPamSessionRouter, registerPamWebAccessRouter } from "./pam-session-router";

export const registerPamRouters = async (server: FastifyZodProvider) => {
  await server.register(registerPamProjectRouter, { prefix: "/project" });
  await server.register(registerPamAccountTemplateRouter, { prefix: "/account-templates" });
  await server.register(
    async (folderServer) => {
      await folderServer.register(registerPamFolderRouter);
      await folderServer.register(registerPamFolderMembershipRouter);
      await folderServer.register(registerPamApprovalConfigurationRouter);
    },
    { prefix: "/folders" }
  );
  await server.register(
    async (accountServer) => {
      await accountServer.register(registerPamAccountRouter);
      await accountServer.register(registerPamAccountMembershipRouter);
      await accountServer.register(registerPamWebAccessRouter);
    },
    { prefix: "/accounts" }
  );
  await server.register(registerPamDiscoveryRouter, { prefix: "/discovery-sources" });
  await server.register(registerPamProductMembershipRouter, { prefix: "/memberships" });
  await server.register(registerPamResourceRoleRouter, { prefix: "/roles" });
  await server.register(
    async (sessionServer) => {
      await sessionServer.register(registerPamSessionRouter);
      await sessionServer.register(registerPamSessionChunkRouter);
    },
    { prefix: "/sessions" }
  );
  await server.register(registerPamAccessRequestRouter, { prefix: "/access-requests" });
};
