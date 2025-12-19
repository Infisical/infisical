import { registerCaRouter } from "./certificate-authority-router";
import { registerCertificateTemplatesV2Router } from "./deprecated-certificate-templates-v2-router";
import { registerDeprecatedGroupProjectRouter } from "./deprecated-group-project-router";
import { registerDeprecatedIdentityProjectRouter } from "./deprecated-identity-project-router";
import { registerDeprecatedProjectMembershipRouter } from "./deprecated-project-membership-router";
import { registerDeprecatedProjectRouter } from "./deprecated-project-router";
import { registerIdentityOrgRouter } from "./identity-org-router";
import { registerMfaRouter } from "./mfa-router";
import { registerMfaSessionRouter } from "./mfa-session-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerPkiAlertRouter } from "./pki-alert-router";
import { registerPkiTemplatesRouter } from "./pki-templates-router";
import { registerSecretFolderRouter } from "./secret-folder-router";
import { registerSecretImportRouter } from "./secret-import-router";
import { registerServiceTokenRouter } from "./service-token-router";
import { registerUserRouter } from "./user-router";

export const registerV2Routes = async (server: FastifyZodProvider) => {
  await server.register(registerMfaRouter, { prefix: "/auth" });
  await server.register(registerMfaSessionRouter, { prefix: "/mfa-sessions" });
  await server.register(registerUserRouter, { prefix: "/users" });
  await server.register(registerServiceTokenRouter, { prefix: "/service-token" });
  await server.register(registerPasswordRouter, { prefix: "/password" });

  await server.register(registerCertificateTemplatesV2Router, { prefix: "/certificate-templates" });

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(registerCaRouter, { prefix: "/ca" });
      await pkiRouter.register(registerPkiTemplatesRouter, { prefix: "/certificate-templates" });
      await pkiRouter.register(registerPkiAlertRouter, { prefix: "/alerts" });
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
      await projectServer.register(registerDeprecatedProjectRouter);
      await projectServer.register(registerDeprecatedIdentityProjectRouter);
      await projectServer.register(registerDeprecatedGroupProjectRouter);
      await projectServer.register(registerDeprecatedProjectMembershipRouter);
    },
    { prefix: "/workspace" }
  );
};
