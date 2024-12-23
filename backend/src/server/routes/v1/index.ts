import { APP_CONNECTION_REGISTER_MAP, registerAppConnectionRouter } from "@app/server/routes/v1/app-connection-routers";
import { registerCmekRouter } from "@app/server/routes/v1/cmek-router";
import { registerDashboardRouter } from "@app/server/routes/v1/dashboard-router";

import { registerAdminRouter } from "./admin-router";
import { registerAuthRoutes } from "./auth-router";
import { registerProjectBotRouter } from "./bot-router";
import { registerCaRouter } from "./certificate-authority-router";
import { registerCertRouter } from "./certificate-router";
import { registerCertificateTemplateRouter } from "./certificate-template-router";
import { registerExternalGroupOrgRoleMappingRouter } from "./external-group-org-role-mapping-router";
import { registerIdentityAccessTokenRouter } from "./identity-access-token-router";
import { registerIdentityAwsAuthRouter } from "./identity-aws-iam-auth-router";
import { registerIdentityAzureAuthRouter } from "./identity-azure-auth-router";
import { registerIdentityGcpAuthRouter } from "./identity-gcp-auth-router";
import { registerIdentityJwtAuthRouter } from "./identity-jwt-auth-router";
import { registerIdentityKubernetesRouter } from "./identity-kubernetes-auth-router";
import { registerIdentityOidcAuthRouter } from "./identity-oidc-auth-router";
import { registerIdentityRouter } from "./identity-router";
import { registerIdentityTokenAuthRouter } from "./identity-token-auth-router";
import { registerIdentityUaRouter } from "./identity-universal-auth-router";
import { registerIntegrationAuthRouter } from "./integration-auth-router";
import { registerIntegrationRouter } from "./integration-router";
import { registerInviteOrgRouter } from "./invite-org-router";
import { registerOrgAdminRouter } from "./org-admin-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerPkiAlertRouter } from "./pki-alert-router";
import { registerPkiCollectionRouter } from "./pki-collection-router";
import { registerProjectEnvRouter } from "./project-env-router";
import { registerProjectKeyRouter } from "./project-key-router";
import { registerProjectMembershipRouter } from "./project-membership-router";
import { registerProjectRouter } from "./project-router";
import { registerSecretFolderRouter } from "./secret-folder-router";
import { registerSecretImportRouter } from "./secret-import-router";
import { registerSecretSharingRouter } from "./secret-sharing-router";
import { registerSecretTagRouter } from "./secret-tag-router";
import { registerSlackRouter } from "./slack-router";
import { registerSsoRouter } from "./sso-router";
import { registerUserActionRouter } from "./user-action-router";
import { registerUserEngagementRouter } from "./user-engagement-router";
import { registerUserRouter } from "./user-router";
import { registerUserSecretsRouter } from "./user-secrets-router";
import { registerWebhookRouter } from "./webhook-router";
import { registerWorkflowIntegrationRouter } from "./workflow-integration-router";

export const registerV1Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSsoRouter, { prefix: "/sso" });
  await server.register(
    async (authRouter) => {
      await authRouter.register(registerAuthRoutes);
      await authRouter.register(registerIdentityTokenAuthRouter);
      await authRouter.register(registerIdentityUaRouter);
      await authRouter.register(registerIdentityKubernetesRouter);
      await authRouter.register(registerIdentityGcpAuthRouter);
      await authRouter.register(registerIdentityAccessTokenRouter);
      await authRouter.register(registerIdentityAwsAuthRouter);
      await authRouter.register(registerIdentityAzureAuthRouter);
      await authRouter.register(registerIdentityOidcAuthRouter);
      await authRouter.register(registerIdentityJwtAuthRouter);
    },
    { prefix: "/auth" }
  );
  await server.register(registerPasswordRouter, { prefix: "/password" });
  await server.register(registerOrgRouter, { prefix: "/organization" });
  await server.register(registerAdminRouter, { prefix: "/admin" });
  await server.register(registerOrgAdminRouter, { prefix: "/organization-admin" });
  await server.register(registerUserRouter, { prefix: "/user" });
  await server.register(registerInviteOrgRouter, { prefix: "/invite-org" });
  await server.register(registerUserActionRouter, { prefix: "/user-action" });
  await server.register(registerSecretImportRouter, { prefix: "/secret-imports" });
  await server.register(registerSecretFolderRouter, { prefix: "/folders" });

  await server.register(
    async (workflowIntegrationRouter) => {
      await workflowIntegrationRouter.register(registerWorkflowIntegrationRouter);
      await workflowIntegrationRouter.register(registerSlackRouter, { prefix: "/slack" });
    },
    { prefix: "/workflow-integrations" }
  );

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
      await pkiRouter.register(registerCertificateTemplateRouter, { prefix: "/certificate-templates" });
      await pkiRouter.register(registerPkiAlertRouter, { prefix: "/alerts" });
      await pkiRouter.register(registerPkiCollectionRouter, { prefix: "/collections" });
    },
    { prefix: "/pki" }
  );

  await server.register(registerProjectBotRouter, { prefix: "/bot" });
  await server.register(registerIntegrationRouter, { prefix: "/integration" });
  await server.register(registerIntegrationAuthRouter, { prefix: "/integration-auth" });
  await server.register(registerWebhookRouter, { prefix: "/webhooks" });
  await server.register(registerIdentityRouter, { prefix: "/identities" });
  await server.register(registerSecretSharingRouter, { prefix: "/secret-sharing" });
  await server.register(registerUserSecretsRouter, { prefix: "/user-secrets" });
  await server.register(registerUserEngagementRouter, { prefix: "/user-engagement" });
  await server.register(registerDashboardRouter, { prefix: "/dashboard" });
  await server.register(registerCmekRouter, { prefix: "/kms" });
  await server.register(registerExternalGroupOrgRoleMappingRouter, { prefix: "/external-group-mappings" });

  await server.register(
    async (appConnectionsRouter) => {
      await appConnectionsRouter.register(registerAppConnectionRouter);
      for await (const [app, router] of Object.entries(APP_CONNECTION_REGISTER_MAP)) {
        await appConnectionsRouter.register(router, { prefix: `/${app}` });
      }
    },
    { prefix: "/app-connections" }
  );
};
