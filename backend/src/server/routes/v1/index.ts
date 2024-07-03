import { registerAdminRouter } from "./admin-router";
import { registerAuthRoutes } from "./auth-router";
import { registerProjectBotRouter } from "./bot-router";
import { registerCaRouter } from "./certificate-authority-router";
import { registerCertRouter } from "./certificate-router";
import { registerConsumerSecretsRouter } from "./consumer-secrets-router";
import { registerIdentityAccessTokenRouter } from "./identity-access-token-router";
import { registerIdentityAwsAuthRouter } from "./identity-aws-iam-auth-router";
import { registerIdentityAzureAuthRouter } from "./identity-azure-auth-router";
import { registerIdentityGcpAuthRouter } from "./identity-gcp-auth-router";
import { registerIdentityKubernetesRouter } from "./identity-kubernetes-auth-router";
import { registerIdentityRouter } from "./identity-router";
import { registerIdentityUaRouter } from "./identity-universal-auth-router";
import { registerIntegrationAuthRouter } from "./integration-auth-router";
import { registerIntegrationRouter } from "./integration-router";
import { registerInviteOrgRouter } from "./invite-org-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerProjectEnvRouter } from "./project-env-router";
import { registerProjectKeyRouter } from "./project-key-router";
import { registerProjectMembershipRouter } from "./project-membership-router";
import { registerProjectRouter } from "./project-router";
import { registerSecretFolderRouter } from "./secret-folder-router";
import { registerSecretImportRouter } from "./secret-import-router";
import { registerSecretSharingRouter } from "./secret-sharing-router";
import { registerSecretTagRouter } from "./secret-tag-router";
import { registerSsoRouter } from "./sso-router";
import { registerUserActionRouter } from "./user-action-router";
import { registerUserRouter } from "./user-router";
import { registerWebhookRouter } from "./webhook-router";

export const registerV1Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSsoRouter, { prefix: "/sso" });
  await server.register(
    async (authRouter) => {
      await authRouter.register(registerAuthRoutes);
      await authRouter.register(registerIdentityUaRouter);
      await authRouter.register(registerIdentityKubernetesRouter);
      await authRouter.register(registerIdentityGcpAuthRouter);
      await authRouter.register(registerIdentityAccessTokenRouter);
      await authRouter.register(registerIdentityAwsAuthRouter);
      await authRouter.register(registerIdentityAzureAuthRouter);
    },
    { prefix: "/auth" }
  );
  await server.register(registerPasswordRouter, { prefix: "/password" });
  await server.register(registerOrgRouter, { prefix: "/organization" });
  await server.register(registerAdminRouter, { prefix: "/admin" });
  await server.register(registerUserRouter, { prefix: "/user" });
  await server.register(registerInviteOrgRouter, { prefix: "/invite-org" });
  await server.register(registerUserActionRouter, { prefix: "/user-action" });
  await server.register(registerSecretImportRouter, { prefix: "/secret-imports" });
  await server.register(registerSecretFolderRouter, { prefix: "/folders" });

  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerProjectRouter);
      await projectRouter.register(registerProjectEnvRouter);
      await projectRouter.register(registerProjectKeyRouter);
      await projectRouter.register(registerProjectMembershipRouter);
      await projectRouter.register(registerSecretTagRouter);
    },

    { prefix: "/workspace" }
  );

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(registerCaRouter, { prefix: "/ca" });
      await pkiRouter.register(registerCertRouter, { prefix: "/certificates" });
    },
    { prefix: "/pki" }
  );

  await server.register(registerProjectBotRouter, { prefix: "/bot" });
  await server.register(registerIntegrationRouter, { prefix: "/integration" });
  await server.register(registerIntegrationAuthRouter, { prefix: "/integration-auth" });
  await server.register(registerWebhookRouter, { prefix: "/webhooks" });
  await server.register(registerIdentityRouter, { prefix: "/identities" });
  await server.register(registerSecretSharingRouter, { prefix: "/secret-sharing" });
  await server.register(registerConsumerSecretsRouter, { prefix: "/consumer-secrets" });
};
