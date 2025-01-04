import { index, layout, rootRoute, route, VirtualRouteNode } from "@tanstack/virtual-file-routes";

const middleware = (fileName: string, virtualRoutes: VirtualRouteNode[]) =>
  layout(`middlewares/${fileName}`, virtualRoutes);

const adminRoute = route("/admin", [
  layout("admin-layout", "admin/layout.tsx", [index("admin/OverviewPage/route.tsx")])
]);

const organizationRoutes = route("/organization", [
  layout("organization/layout.tsx", [
    route("/secret-manager/overview", "organization/SecretManagerOverviewPage/route.tsx"),
    route("/cert-manager/overview", "organization/CertManagerOverviewPage/route.tsx"),
    route("/ssh/overview", "organization/SshOverviewPage/route.tsx"),
    route("/kms/overview", "organization/KmsOverviewPage/route.tsx"),
    route("/access-management", "organization/AccessManagementPage/route.tsx"),
    route("/admin", "organization/AdminPage/route.tsx"),
    route("/audit-logs", "organization/AuditLogsPage/route.tsx"),
    route("/billing", "organization/BillingPage/route.tsx"),
    route("/none", "organization/NoOrgPage/route.tsx"),
    route("/secret-sharing", "organization/SecretSharingPage/route.tsx"),
    route("/settings", "organization/SettingsPage/route.tsx"),
    route("/secret-scanning", "organization/SecretScanningPage/route.tsx"),
    route("/groups/$groupId", "organization/GroupDetailsByIDPage/route.tsx"),
    route("/members/$membershipId", "organization/UserDetailsByIDPage/route.tsx"),
    route("/roles/$roleId", "organization/RoleByIDPage/route.tsx"),
    route("/identities/$identityId", "organization/IdentityDetailsByIDPage/route.tsx"),
    route(
      "/app-connections/github/oauth/callback",
      "organization/AppConnections/GithubOauthCallbackPage/route.tsx"
    )
  ])
]);

const secretManagerRoutes = route("/secret-manager/$projectId", [
  layout("secret-manager-layout", "secret-manager/layout.tsx", [
    route("/overview", "secret-manager/OverviewPage/route.tsx"),
    route("/secrets/$envSlug", "secret-manager/SecretDashboardPage/route.tsx"),
    route("/allowlist", "secret-manager/IPAllowlistPage/route.tsx"),
    route("/approval", "secret-manager/SecretApprovalsPage/route.tsx"),
    route("/secret-rotation", "secret-manager/SecretRotationPage/route.tsx"),
    route("/settings", "secret-manager/SettingsPage/route.tsx"),
    route("/integrations", [
      index("secret-manager/IntegrationsListPage/route.tsx"),
      route("/$integrationId", "secret-manager/IntegrationsDetailsByIDPage/route.tsx"),
      route(
        "/aws-parameter-store/authorize",
        "secret-manager/integrations/AwsParameterStoreAuthorizePage/route.tsx"
      ),
      route(
        "/aws-parameter-store/create",
        "secret-manager/integrations/AwsParameterStoreConfigurePage/route.tsx"
      ),
      route(
        "/aws-secret-manager/authorize",
        "secret-manager/integrations/AwsSecretManagerAuthorizePage/route.tsx"
      ),
      route(
        "/aws-secret-manager/create",
        "secret-manager/integrations/AwsSecretManagerConfigurePage/route.tsx"
      ),
      route(
        "/azure-app-configuration/oauth2/callback",
        "secret-manager/integrations/AzureAppConfigurationOauthCallbackPage/route.tsx"
      ),
      route(
        "/azure-app-configuration/create",
        "secret-manager/integrations/AzureAppConfigurationConfigurePage/route.tsx"
      ),
      route(
        "/azure-devops/authorize",
        "secret-manager/integrations/AzureDevopsAuthorizePage/route.tsx"
      ),
      route(
        "/azure-devops/create",
        "secret-manager/integrations/AzureDevopsConfigurePage/route.tsx"
      ),
      route(
        "/azure-key-vault/oauth2/callback",
        "secret-manager/integrations/AzureKeyVaultOauthCallbackPage/route.tsx"
      ),
      route(
        "/azure-key-vault/create",
        "secret-manager/integrations/AzureKeyVaultConfigurePage/route.tsx"
      ),
      route(
        "/bitbucket/oauth2/callback",
        "secret-manager/integrations/BitbucketOauthCallbackPage/route.tsx"
      ),
      route("/bitbucket/create", "secret-manager/integrations/BitbucketConfigurePage/route.tsx"),
      route("/checkly/authorize", "secret-manager/integrations/ChecklyAuthorizePage/route.tsx"),
      route("/checkly/create", "secret-manager/integrations/ChecklyConfigurePage/route.tsx"),
      route("/circleci/authorize", "secret-manager/integrations/CircleCIAuthorizePage/route.tsx"),
      route("/circleci/create", "secret-manager/integrations/CircleCIConfigurePage/route.tsx"),
      route("/cloud-66/authorize", "secret-manager/integrations/Cloud66AuthorizePage/route.tsx"),
      route("/cloud-66/create", "secret-manager/integrations/Cloud66ConfigurePage/route.tsx"),
      route(
        "/cloudflare-pages/authorize",
        "secret-manager/integrations/CloudflarePagesAuthorizePage/route.tsx"
      ),
      route(
        "/cloudflare-pages/create",
        "secret-manager/integrations/CloudflarePagesConfigurePage/route.tsx"
      ),
      route(
        "/cloudflare-workers/authorize",
        "secret-manager/integrations/CloudflareWorkersAuthorizePage/route.tsx"
      ),
      route(
        "/cloudflare-workers/create",
        "secret-manager/integrations/CloudflareWorkersConfigurePage/route.tsx"
      ),
      route("/codefresh/authorize", "secret-manager/integrations/CodefreshAuthorizePage/route.tsx"),
      route("/codefresh/create", "secret-manager/integrations/CodefreshConfigurePage/route.tsx"),
      route(
        "/databricks/authorize",
        "secret-manager/integrations/DatabricksAuthorizePage/route.tsx"
      ),
      route("/databricks/create", "secret-manager/integrations/DatabricksConfigurePage/route.tsx"),
      route(
        "/digital-ocean-app-platform/authorize",
        "secret-manager/integrations/DigitalOceanAppPlatformAuthorizePage/route.tsx"
      ),
      route(
        "/digital-ocean-app-platform/create",
        "secret-manager/integrations/DigitalOceanAppPlatformConfigurePage/route.tsx"
      ),
      route("/flyio/authorize", "secret-manager/integrations/FlyioAuthorizePage/route.tsx"),
      route("/flyio/create", "secret-manager/integrations/FlyioConfigurePage/route.tsx"),
      route(
        "/gcp-secret-manager/authorize",
        "secret-manager/integrations/GcpSecretManagerAuthorizePage/route.tsx"
      ),
      route(
        "/gcp-secret-manager/create",
        "secret-manager/integrations/GcpSecretManagerConfigurePage/route.tsx"
      ),
      route(
        "/gcp-secret-manager/oauth2/callback",
        "secret-manager/integrations/GcpSecretManagerOauthCallbackPage/route.tsx"
      ),
      route(
        "/github/auth-mode-selection",
        "secret-manager/integrations/GithubAuthorizePage/route.tsx"
      ),
      route("/github/create", "secret-manager/integrations/GithubConfigurePage/route.tsx"),
      route(
        "/select-integration-auth",
        "secret-manager/integrations/SelectIntegrationAuthPage/route.tsx"
      ),
      route(
        "/github/oauth2/callback",
        "secret-manager/integrations/GithubOauthCallbackPage/route.tsx"
      ),
      route("/gitlab/authorize", "secret-manager/integrations/GitlabAuthorizePage/route.tsx"),
      route("/gitlab/create", "secret-manager/integrations/GitlabConfigurePage/route.tsx"),
      route(
        "/gitlab/oauth2/callback",
        "secret-manager/integrations/GitlabOauthCallbackPage/route.tsx"
      ),
      route(
        "/hashicorp-vault/authorize",
        "secret-manager/integrations/HashicorpVaultAuthorizePage/route.tsx"
      ),
      route(
        "/hashicorp-vault/create",
        "secret-manager/integrations/HashicorpVaultConfigurePage/route.tsx"
      ),

      route(
        "/hasura-cloud/authorize",
        "secret-manager/integrations/HasuraCloudAuthorizePage/route.tsx"
      ),
      route(
        "/hasura-cloud/create",
        "secret-manager/integrations/HasuraCloudConfigurePage/route.tsx"
      ),
      route(
        "/laravel-forge/authorize",
        "secret-manager/integrations/LaravelForgeAuthorizePage/route.tsx"
      ),
      route(
        "/laravel-forge/create",
        "secret-manager/integrations/LaravelForgeConfigurePage/route.tsx"
      ),
      route(
        "/netlify/oauth2/callback",
        "secret-manager/integrations/NetlifyOauthCallbackPage/route.tsx"
      ),
      route("/netlify/create", "secret-manager/integrations/NetlifyConfigurePage/route.tsx"),
      route(
        "/northflank/authorize",
        "secret-manager/integrations/NorthflankAuthorizePage/route.tsx"
      ),
      route("/northflank/create", "secret-manager/integrations/NorthflankConfigurePage/route.tsx"),
      route(
        "/octopus-deploy/authorize",
        "secret-manager/integrations/OctopusDeployAuthorizePage/route.tsx"
      ),
      route(
        "/octopus-deploy/create",
        "secret-manager/integrations/OctopusDeployConfigurePage/route.tsx"
      ),
      route("/qovery/authorize", "secret-manager/integrations/QoveryAuthorizePage/route.tsx"),
      route("/qovery/create", "secret-manager/integrations/QoveryConfigurePage/route.tsx"),
      route("/railway/authorize", "secret-manager/integrations/RailwayAuthorizePage/route.tsx"),
      route("/railway/create", "secret-manager/integrations/RailwayConfigurePage/route.tsx"),
      route("/render/authorize", "secret-manager/integrations/RenderAuthorizePage/route.tsx"),
      route("/render/create", "secret-manager/integrations/RenderConfigurePage/route.tsx"),
      route("/rundeck/authorize", "secret-manager/integrations/RundeckAuthorizePage/route.tsx"),
      route("/rundeck/create", "secret-manager/integrations/RundeckConfigurePage/route.tsx"),
      route("/supabase/authorize", "secret-manager/integrations/SupabaseAuthorizePage/route.tsx"),
      route("/supabase/create", "secret-manager/integrations/SupabaseConfigurePage/route.tsx"),
      route("/teamcity/authorize", "secret-manager/integrations/TeamcityAuthorizePage/route.tsx"),
      route("/teamcity/create", "secret-manager/integrations/TeamcityConfigurePage/route.tsx"),
      route(
        "/terraform-cloud/authorize",
        "secret-manager/integrations/TerraformCloudAuthorizePage/route.tsx"
      ),
      route(
        "/terraform-cloud/create",
        "secret-manager/integrations/TerraformCloudConfigurePage/route.tsx"
      ),
      route("/travisci/authorize", "secret-manager/integrations/TravisCIAuthorizePage/route.tsx"),
      route("/travisci/create", "secret-manager/integrations/TravisCIConfigurePage/route.tsx"),
      route("/windmill/authorize", "secret-manager/integrations/WindmillAuthorizePage/route.tsx"),
      route("/windmill/create", "secret-manager/integrations/WindmillConfigurePage/route.tsx"),
      route(
        "/vercel/oauth2/callback",
        "secret-manager/integrations/VercelOauthCallbackPage/route.tsx"
      ),
      route("/vercel/create", "secret-manager/integrations/VercelConfigurePage/route.tsx"),
      route(
        "/heroku/oauth2/callback",
        "secret-manager/integrations/HerokuOauthCallbackPage/route.tsx"
      ),
      route("/heroku/create", "secret-manager/integrations/HerokuConfigurePage/route.tsx")
    ]),
    route("/access-management", "project/AccessControlPage/route-secret-manager.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-secret-manager.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-secret-manager.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-secret-manager.tsx")
  ])
]);

const secretManagerIntegrationsRedirect = route("/integrations", [
  route("/heroku/oauth2/callback", "secret-manager/integrations/route-heroku-oauth-redirect.tsx"),
  route(
    "/gcp-secret-manager/oauth2/callback",
    "secret-manager/integrations/route-gcp-oauth-redirect.tsx"
  ),
  route(
    "/bitbucket/oauth2/callback",
    "secret-manager/integrations/route-bitbucket-oauth-redirect.tsx"
  ),
  route("/vercel/oauth2/callback", "secret-manager/integrations/route-vercel-oauth-redirect.tsx"),
  route("/netlify/oauth2/callback", "secret-manager/integrations/route-netlify-oauth-redirect.tsx"),
  route("/gitlab/oauth2/callback", "secret-manager/integrations/route-gitlab-oauth-redirect.tsx"),
  route("/github/oauth2/callback", "secret-manager/integrations/route-github-oauth-redirect.tsx"),
  route(
    "/azure-key-vault/oauth2/callback",
    "secret-manager/integrations/route-azure-key-vault-oauth-redirect.tsx"
  ),
  route(
    "/azure-app-configuration/oauth2/callback",
    "secret-manager/integrations/route-azure-app-configurations-oauth-redirect.tsx"
  )
]);

const certManagerRoutes = route("/cert-manager/$projectId", [
  layout("cert-manager-layout", "cert-manager/layout.tsx", [
    route("/overview", "cert-manager/CertificatesPage/route.tsx"),
    route("/ca/$caId", "cert-manager/CertAuthDetailsByIDPage/route.tsx"),
    route("/pki-collections/$collectionId", "cert-manager/PkiCollectionDetailsByIDPage/routes.tsx"),
    route("/settings", "cert-manager/SettingsPage/route.tsx"),
    route("/access-management", "project/AccessControlPage/route-cert-manager.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-cert-manager.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-cert-manager.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-cert-manager.tsx")
  ])
]);

const kmsRoutes = route("/kms/$projectId", [
  layout("kms-layout", "kms/layout.tsx", [
    route("/overview", "kms/OverviewPage/route.tsx"),
    route("/settings", "kms/SettingsPage/route.tsx"),
    route("/access-management", "project/AccessControlPage/route-kms.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-kms.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-kms.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-kms.tsx")
  ])
]);

const sshRoutes = route("/ssh/$projectId", [
  layout("ssh-layout", "ssh/layout.tsx", [
    route("/overview", "ssh/OverviewPage/route.tsx"),
    route("/ca/$caId", "ssh/SshCaByIDPage/route.tsx"),
    route("/settings", "ssh/SettingsPage/route.tsx"),
    route("/access-management", "project/AccessControlPage/route-ssh.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-ssh.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-ssh.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-ssh.tsx")
  ])
]);

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route("/shared/secret/$secretId", "public/ViewSharedSecretByIDPage/route.tsx"),
  route("/share-secret", "public/ShareSecretPage/route.tsx"),
  route("/cli-redirect", "auth/CliRedirectPage/route.tsx"),
  middleware("restrict-login-signup.tsx", [
    route("/admin/signup", "admin/SignUpPage/route.tsx"),
    route("/login", [
      index("auth/LoginPage/route.tsx"),
      route("/select-organization", "auth/SelectOrgPage/route.tsx"),
      route("/sso", "auth/LoginSsoPage/route.tsx"),
      route("/ldap", "auth/LoginLdapPage/route.tsx"),
      route("/provider/success", "auth/ProviderSuccessPage/route.tsx"),
      route("/provider/error", "auth/ProviderErrorPage/route.tsx")
    ]),
    route("/signup", [
      index("auth/SignUpPage/route.tsx"),
      route("/sso", "auth/SignUpSsoPage/route.tsx")
    ]),
    route("/email-not-verified", "auth/EmailNotVerifiedPage/route.tsx"),
    route("/password-reset", "auth/PasswordResetPage/route.tsx"),
    route("/requestnewinvite", "auth/RequestNewInvitePage/route.tsx"),
    route("/signupinvite", "auth/SignUpInvitePage/route.tsx"),
    route("/verify-email", "auth/VerifyEmailPage/route.tsx")
  ]),
  middleware("authenticate.tsx", [
    route("/personal-settings", [
      layout("user/layout.tsx", [index("user/PersonalSettingsPage/route.tsx")])
    ]),
    middleware("inject-org-details.tsx", [
      adminRoute,
      organizationRoutes,
      secretManagerRoutes,
      secretManagerIntegrationsRedirect,
      certManagerRoutes,
      kmsRoutes,
      sshRoutes
    ])
  ])
]);
