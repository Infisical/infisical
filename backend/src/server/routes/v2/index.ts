import { registerCaRouter } from "./certificate-authority-router";
import { registerDepreciatedGroupProjectRouter } from "./depreciated-group-project-router";
import { registerIdentityOrgRouter } from "./identity-org-router";
import { registerDepreciatedIdentityProjectRouter } from "./depreciated-identity-project-router";
import { registerMfaRouter } from "./mfa-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerPkiTemplatesRouter } from "./pki-templates-router";
import { registerDepreciatedProjectMembershipRouter } from "./depreciated-project-membership-router";
import { registerDepreciatedProjectRouter } from "./depreciated-project-router";
import { registerServiceTokenRouter } from "./service-token-router";
import { registerUserRouter } from "./user-router";
import { registerSecretFolderRouter } from "./secret-folder-router";
import { registerSecretImportRouter } from "./secret-import-router";

export const registerV2Routes = async (server: FastifyZodProvider) => {
  await server.register(registerMfaRouter, { prefix: "/auth" });
  await server.register(registerUserRouter, { prefix: "/users" });
  await server.register(registerServiceTokenRouter, { prefix: "/service-token" });
  await server.register(registerPasswordRouter, { prefix: "/password" });

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(registerCaRouter, { prefix: "/ca" });
      await pkiRouter.register(registerPkiTemplatesRouter, { prefix: "/certificate-templates" });
    },
    { prefix: "/pki" }
  );

  await server.register(
    async (orgRouter) => {
      await orgRouter.register(registerOrgRouter);
      await orgRouter.register(registerIdentityOrgRouter);
    },
    { prefix: "/organizations" }
  );

  await server.register(registerSecretFolderRouter, { prefix: "/folders" });
  await server.register(registerSecretImportRouter, { prefix: "/secret-imports" });

  // moved to v1/projects
  await server.register(
    async (projectServer) => {
      await projectServer.register(registerDepreciatedProjectRouter);
      await projectServer.register(registerDepreciatedIdentityProjectRouter);
      await projectServer.register(registerDepreciatedGroupProjectRouter);
      await projectServer.register(registerDepreciatedProjectMembershipRouter);
    },
    { prefix: "/workspace" }
  );
};
