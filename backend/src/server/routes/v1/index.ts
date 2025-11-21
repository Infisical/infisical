import {
  APP_CONNECTION_REGISTER_ROUTER_MAP,
  registerAppConnectionRouter
} from "@app/server/routes/v1/app-connection-routers";
import { registerCmekRouter } from "@app/server/routes/v1/cmek-router";
import { registerDashboardRouter } from "@app/server/routes/v1/dashboard-router";
import { registerSecretSyncRouter, SECRET_SYNC_REGISTER_ROUTER_MAP } from "@app/server/routes/v1/secret-sync-routers";

import { registerAdminRouter } from "./admin-router";
import { registerAuthRoutes } from "./auth-router";
import { registerProjectBotRouter } from "./bot-router";
import { registerCaRouter } from "./certificate-authority-router";
import { CERTIFICATE_AUTHORITY_REGISTER_ROUTER_MAP } from "./certificate-authority-routers";
import { registerCertificateProfilesRouter } from "./certificate-profiles-router";
import { registerCertRouter } from "./certificate-router";
import { registerCertificateTemplateRouter } from "./certificate-template-router";
import { registerDeprecatedIdentityProjectMembershipRouter } from "./deprecated-identity-project-membership-router";
import { registerDeprecatedProjectEnvRouter } from "./deprecated-project-env-router";
import { registerDeprecatedProjectMembershipRouter } from "./deprecated-project-membership-router";
import { registerDeprecatedProjectRouter } from "./deprecated-project-router";
import { registerDeprecatedSecretFolderRouter } from "./deprecated-secret-folder-router";
import { registerDeprecatedSecretImportRouter } from "./deprecated-secret-import-router";
import { registerDeprecatedSecretTagRouter } from "./deprecated-secret-tag-router";
import { registerEventRouter } from "./event-router";
import { registerExternalGroupOrgRoleMappingRouter } from "./external-group-org-role-mapping-router";
import { registerGroupProjectRouter } from "./group-project-router";
import { registerIdentityAccessTokenRouter } from "./identity-access-token-router";
import { registerIdentityAliCloudAuthRouter } from "./identity-alicloud-auth-router";
import { registerIdentityAwsAuthRouter } from "./identity-aws-iam-auth-router";
import { registerIdentityAzureAuthRouter } from "./identity-azure-auth-router";
import { registerIdentityGcpAuthRouter } from "./identity-gcp-auth-router";
import { registerIdentityJwtAuthRouter } from "./identity-jwt-auth-router";
import { registerIdentityKubernetesRouter } from "./identity-kubernetes-auth-router";
import { registerIdentityLdapAuthRouter } from "./identity-ldap-auth-router";
import { registerIdentityOciAuthRouter } from "./identity-oci-auth-router";
import { registerIdentityOidcAuthRouter } from "./identity-oidc-auth-router";
import { registerIdentityOrgMembershipRouter } from "./identity-org-membership-router";
import { registerIdentityProjectMembershipRouter } from "./identity-project-membership-router";
import { registerIdentityRouter } from "./identity-router";
import { registerIdentityTlsCertAuthRouter } from "./identity-tls-cert-auth-router";
import { registerIdentityTokenAuthRouter } from "./identity-token-auth-router";
import { registerIdentityUaRouter } from "./identity-universal-auth-router";
import { registerIntegrationAuthRouter } from "./integration-auth-router";
import { registerIntegrationRouter } from "./integration-router";
import { registerInviteOrgRouter } from "./invite-org-router";
import { registerMicrosoftTeamsRouter } from "./microsoft-teams-router";
import { registerNotificationRouter } from "./notification-router";
import { registerOrgAdminRouter } from "./org-admin-router";
import { registerOrgIdentityRouter } from "./org-identity-router";
import { registerOrgRouter } from "./organization-router";
import { registerPasswordRouter } from "./password-router";
import { registerPkiAlertRouter } from "./pki-alert-router";
import { registerPkiCollectionRouter } from "./pki-collection-router";
import { registerPkiSubscriberRouter } from "./pki-subscriber-router";
import { PKI_SYNC_REGISTER_ROUTER_MAP, registerPkiSyncRouter } from "./pki-sync-routers";
import { registerProjectEnvRouter } from "./project-env-router";
import { registerProjectIdentityRouter } from "./project-identity-router";
import { registerProjectKeyRouter } from "./project-key-router";
import { registerProjectMembershipRouter } from "./project-membership-router";
import { registerProjectRouter } from "./project-router";
import { SECRET_REMINDER_REGISTER_ROUTER_MAP } from "./reminder-routers";
import { registerSecretRequestsRouter } from "./secret-requests-router";
import { registerSecretSharingRouter } from "./secret-sharing-router";
import { registerSecretTagRouter } from "./secret-tag-router";
import { registerSlackRouter } from "./slack-router";
import { registerSsoRouter } from "./sso-router";
import { registerUpgradePathRouter } from "./upgrade-path-router";
import { registerUserActionRouter } from "./user-action-router";
import { registerUserEngagementRouter } from "./user-engagement-router";
import { registerUserRouter } from "./user-router";
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
      await authRouter.register(registerIdentityAliCloudAuthRouter);
      await authRouter.register(registerIdentityAwsAuthRouter);
      await authRouter.register(registerIdentityTlsCertAuthRouter, { prefix: "/tls-cert-auth" });
      await authRouter.register(registerIdentityAzureAuthRouter);
      await authRouter.register(registerIdentityOciAuthRouter);
      await authRouter.register(registerIdentityOidcAuthRouter);
      await authRouter.register(registerIdentityJwtAuthRouter);
      await authRouter.register(registerIdentityLdapAuthRouter);
    },
    { prefix: "/auth" }
  );
  await server.register(registerPasswordRouter, { prefix: "/password" });
  await server.register(
    async (orgRouter) => {
      await orgRouter.register(registerOrgRouter);
      await orgRouter.register(registerOrgIdentityRouter);
      await orgRouter.register(registerIdentityOrgMembershipRouter);
    },
    { prefix: "/organization" }
  );
  await server.register(registerAdminRouter, { prefix: "/admin" });
  await server.register(registerOrgAdminRouter, { prefix: "/organization-admin" });
  await server.register(registerUserRouter, { prefix: "/user" });
  await server.register(registerNotificationRouter, { prefix: "/notifications" });
  await server.register(registerInviteOrgRouter, { prefix: "/invite-org" });
  await server.register(registerUserActionRouter, { prefix: "/user-action" });
  await server.register(registerDeprecatedSecretImportRouter, { prefix: "/secret-imports" });
  await server.register(registerDeprecatedSecretFolderRouter, { prefix: "/folders" });

  await server.register(
    async (workflowIntegrationRouter) => {
      await workflowIntegrationRouter.register(registerWorkflowIntegrationRouter);
      await workflowIntegrationRouter.register(registerSlackRouter, { prefix: "/slack" });
      await workflowIntegrationRouter.register(registerMicrosoftTeamsRouter, { prefix: "/microsoft-teams" });
    },
    { prefix: "/workflow-integrations" }
  );

  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerDeprecatedProjectRouter);
      await projectRouter.register(registerDeprecatedProjectEnvRouter);
      // depreciated completed in use
      await projectRouter.register(registerProjectKeyRouter);
      await projectRouter.register(registerDeprecatedProjectMembershipRouter);
      await projectRouter.register(registerDeprecatedSecretTagRouter);
    },
    { prefix: "/workspace" }
  );

  await server.register(
    async (projectRouter) => {
      await projectRouter.register(registerProjectRouter);
      await projectRouter.register(registerProjectMembershipRouter);
      await projectRouter.register(registerProjectIdentityRouter);
      await projectRouter.register(registerProjectEnvRouter);
      await projectRouter.register(registerSecretTagRouter);
      await projectRouter.register(registerGroupProjectRouter);
      await projectRouter.register(registerDeprecatedIdentityProjectMembershipRouter);
    },
    { prefix: "/projects" }
  );

  await server.register(registerIdentityProjectMembershipRouter, {
    prefix: "/projects/:projectId/memberships"
  });

  await server.register(
    async (pkiRouter) => {
      await pkiRouter.register(registerCaRouter, { prefix: "/ca" });
      await pkiRouter.register(
        async (caRouter) => {
          for await (const [caType, router] of Object.entries(CERTIFICATE_AUTHORITY_REGISTER_ROUTER_MAP)) {
            await caRouter.register(router, { prefix: `/${caType}` });
          }
        },
        {
          prefix: "/ca"
        }
      );
      await pkiRouter.register(registerCertRouter, { prefix: "/certificates" });
      await pkiRouter.register(registerCertificateTemplateRouter, { prefix: "/certificate-templates" });
      await pkiRouter.register(registerCertificateProfilesRouter, { prefix: "/certificate-profiles" });
      await pkiRouter.register(registerPkiAlertRouter, { prefix: "/alerts" });
      await pkiRouter.register(registerPkiCollectionRouter, { prefix: "/collections" });
      await pkiRouter.register(registerPkiSubscriberRouter, { prefix: "/subscribers" });
      await pkiRouter.register(
        async (pkiSyncRouter) => {
          await pkiSyncRouter.register(registerPkiSyncRouter);
          for await (const [destination, router] of Object.entries(PKI_SYNC_REGISTER_ROUTER_MAP)) {
            await pkiSyncRouter.register(router, { prefix: `/${destination}` });
          }
        },
        { prefix: "/syncs" }
      );
    },
    { prefix: "/pki" }
  );

  await server.register(registerProjectBotRouter, { prefix: "/bot" });
  await server.register(registerIntegrationRouter, { prefix: "/integration" });
  await server.register(registerIntegrationAuthRouter, { prefix: "/integration-auth" });
  await server.register(registerWebhookRouter, { prefix: "/webhooks" });
  await server.register(registerIdentityRouter, { prefix: "/identities" });

  await server.register(
    async (secretSharingRouter) => {
      await secretSharingRouter.register(registerSecretSharingRouter, { prefix: "/shared" });
      await secretSharingRouter.register(registerSecretRequestsRouter, { prefix: "/requests" });
    },
    { prefix: "/secret-sharing" }
  );

  await server.register(registerUserEngagementRouter, { prefix: "/user-engagement" });
  await server.register(registerDashboardRouter, { prefix: "/dashboard" });
  await server.register(registerCmekRouter, { prefix: "/kms" });
  await server.register(registerExternalGroupOrgRoleMappingRouter, { prefix: "/external-group-mappings" });

  await server.register(
    async (appConnectionRouter) => {
      // register generic app connection endpoints
      await appConnectionRouter.register(registerAppConnectionRouter);

      // register service specific endpoints (app-connections/aws, app-connections/github, etc.)
      for await (const [app, router] of Object.entries(APP_CONNECTION_REGISTER_ROUTER_MAP)) {
        await appConnectionRouter.register(router, { prefix: `/${app}` });
      }
    },
    { prefix: "/app-connections" }
  );

  await server.register(
    async (secretSyncRouter) => {
      // register generic secret sync endpoints
      await secretSyncRouter.register(registerSecretSyncRouter);

      // register service specific secret sync endpoints (secret-syncs/aws-parameter-store, secret-syncs/github, etc.)
      for await (const [destination, router] of Object.entries(SECRET_SYNC_REGISTER_ROUTER_MAP)) {
        await secretSyncRouter.register(router, { prefix: `/${destination}` });
      }
    },
    { prefix: "/secret-syncs" }
  );

  await server.register(
    async (reminderRouter) => {
      // register service specific reminder endpoints (reminders/secret)
      for await (const [reminderType, router] of Object.entries(SECRET_REMINDER_REGISTER_ROUTER_MAP)) {
        await reminderRouter.register(router, { prefix: `/${reminderType}` });
      }
    },
    { prefix: "/reminders" }
  );

  await server.register(registerEventRouter, { prefix: "/events" });
  await server.register(registerUpgradePathRouter, { prefix: "/upgrade-path" });
};
