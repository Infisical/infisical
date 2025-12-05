import { index, layout, rootRoute, route, VirtualRouteNode } from "@tanstack/virtual-file-routes";

const middleware = (fileName: string, virtualRoutes: VirtualRouteNode[]) =>
  layout(`middlewares/${fileName}`, virtualRoutes);

const adminRoute = route("/admin", [
  layout("admin-layout", "admin/layout.tsx", [
    index("admin/GeneralPage/route.tsx"),
    route("/encryption", "admin/EncryptionPage/route.tsx"),
    route("/authentication", "admin/AuthenticationPage/route.tsx"),
    route("/environment", "admin/EnvironmentPage/route.tsx"),
    route("/integrations", "admin/IntegrationsPage/route.tsx"),
    route("/caching", "admin/CachingPage/route.tsx"),
    route("/resources/overview", "admin/ResourceOverviewPage/route.tsx"),
    route("/access-management", "admin/AccessManagementPage/route.tsx")
  ])
]);

const secretManagerRoutes = route("/organizations/$orgId/projects/secret-management/$projectId", [
  layout("secret-manager-layout", "secret-manager/layout.tsx", [
    route("/overview", "secret-manager/OverviewPage/route.tsx"),
    route("/secrets/$envSlug", "secret-manager/SecretDashboardPage/route.tsx"),
    route("/allowlist", "secret-manager/IPAllowlistPage/route.tsx"),
    route("/approval", "secret-manager/SecretApprovalsPage/route.tsx"),
    route("/secret-rotation", "secret-manager/SecretRotationPage/route.tsx"),
    route("/settings", "secret-manager/SettingsPage/route.tsx"),
    route("/commits/$environment/$folderId", [
      index("secret-manager/CommitsPage/route.tsx"),
      route("/$commitId", [
        index("secret-manager/CommitDetailsPage/route.tsx"),
        route(
          "/restore",
          "secret-manager/CommitDetailsPage/components/RollbackPreviewTab/route.tsx"
        )
      ])
    ]),
    route("/audit-logs", "project/AuditLogsPage/route-secret-manager.tsx"),
    route("/access-management", "project/AccessControlPage/route-secret-manager.tsx"),
    route("/app-connections", "project/AppConnectionsPage/route-secret-manager.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-secret-manager.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-secret-manager.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-secret-manager.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-secret-manager.tsx"),
    route("/integrations", [
      index("secret-manager/IntegrationsListPage/route.tsx"),
      route("/$integrationId", "secret-manager/IntegrationsDetailsByIDPage/route.tsx"),
      route(
        "/secret-syncs/$destination/$syncId",
        "secret-manager/SecretSyncDetailsByIDPage/route.tsx"
      ),
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
        "/azure-key-vault/authorize",
        "secret-manager/integrations/AzureKeyVaultAuthorizePage/route.tsx"
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
    ])
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

const certManagerRoutes = route("/organizations/$orgId/projects/cert-management/$projectId", [
  layout("cert-manager-layout", "cert-manager/layout.tsx", [
    route("/policies", "cert-manager/PoliciesPage/route.tsx"),
    route("/subscribers", [
      index("cert-manager/PkiSubscribersPage/route.tsx"),
      route("/$subscriberName", "cert-manager/PkiSubscriberDetailsByIDPage/route.tsx")
    ]),
    route("/certificate-templates", [index("cert-manager/PkiTemplateListPage/route.tsx")]),
    route("/certificate-authorities", "cert-manager/CertificateAuthoritiesPage/route.tsx"),
    route("/alerting", "cert-manager/AlertingPage/route.tsx"),
    route("/ca/$caId", "cert-manager/CertAuthDetailsByIDPage/route.tsx"),
    route("/pki-collections/$collectionId", "cert-manager/PkiCollectionDetailsByIDPage/routes.tsx"),
    route("/integrations", [
      index("cert-manager/IntegrationsListPage/route.tsx"),
      route("/$syncId", "cert-manager/PkiSyncDetailsByIDPage/route.tsx")
    ]),
    route("/settings", "cert-manager/SettingsPage/route.tsx"),
    route("/audit-logs", "project/AuditLogsPage/route-cert-manager.tsx"),
    route("/access-management", "project/AccessControlPage/route-cert-manager.tsx"),
    route("/app-connections", "project/AppConnectionsPage/route-cert-manager.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-cert-manager.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-cert-manager.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-cert-manager.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-cert-manager.tsx")
  ])
]);

const aiRoutes = route("/organizations/$orgId/projects/ai/$projectId", [
  layout("ai-layout", "ai/layout.tsx", [
    route("/mcp-servers/$serverId", "ai/MCPServerDetailPage/route.tsx"),
    route("/overview", "ai/MCPPage/route.tsx"),
    route("/settings", "ai/SettingsPage/route.tsx"),
    route("/audit-logs", "project/AuditLogsPage/route-ai.tsx"),
    route("/access-management", "project/AccessControlPage/route-ai.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-ai.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-ai.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-ai.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-ai.tsx")
  ])
]);

const kmsRoutes = route("/organizations/$orgId/projects/kms/$projectId", [
  layout("kms-layout", "kms/layout.tsx", [
    route("/overview", "kms/OverviewPage/route.tsx"),
    route("/kmip", "kms/KmipPage/route.tsx"),
    route("/settings", "kms/SettingsPage/route.tsx"),
    route("/audit-logs", "project/AuditLogsPage/route-kms.tsx"),
    route("/access-management", "project/AccessControlPage/route-kms.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-kms.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-kms.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-kms.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-kms.tsx")
  ])
]);

const sshRoutes = route("/organizations/$orgId/projects/ssh/$projectId", [
  layout("ssh-layout", "ssh/layout.tsx", [
    route("/overview", "ssh/SshHostsPage/route.tsx"),
    route("/certificates", "ssh/SshCertsPage/route.tsx"),
    route("/cas", "ssh/SshCasPage/route.tsx"),
    route("/ca/$caId", "ssh/SshCaByIDPage/route.tsx"),
    route("/ssh-host-groups/$sshHostGroupId", "ssh/SshHostGroupDetailsByIDPage/route.tsx"),
    route("/settings", "ssh/SettingsPage/route.tsx"),
    route("/audit-logs", "project/AuditLogsPage/route-ssh.tsx"),
    route("/access-management", "project/AccessControlPage/route-ssh.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-ssh.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-ssh.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-ssh.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-ssh.tsx")
  ])
]);

const secretScanningRoutes = route("/organizations/$orgId/projects/secret-scanning/$projectId", [
  layout("secret-scanning-layout", "secret-scanning/layout.tsx", [
    route("/data-sources", [
      index("secret-scanning/SecretScanningDataSourcesPage/route.tsx"),
      route("/$type/$dataSourceId", "secret-scanning/SecretScanningDataSourceByIdPage/route.tsx")
    ]),
    route("/findings", "secret-scanning/SecretScanningFindingsPage/route.tsx"),
    route("/settings", "secret-scanning/SettingsPage/route.tsx"),
    route("/audit-logs", "project/AuditLogsPage/route-secret-scanning.tsx"),
    route("/access-management", "project/AccessControlPage/route-secret-scanning.tsx"),
    route("/app-connections", "project/AppConnectionsPage/route-secret-scanning.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-secret-scanning.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-secret-scanning.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-secret-scanning.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-secret-scanning.tsx")
  ])
]);

const pamRoutes = route("/organizations/$orgId/projects/pam/$projectId", [
  layout("pam-layout", "pam/layout.tsx", [
    route("/accounts", "pam/PamAccountsPage/route.tsx"),
    route("/sessions", [
      index("pam/PamSessionsPage/route.tsx"),
      route("/$sessionId", "pam/PamSessionsByIDPage/route.tsx")
    ]),
    route("/resources", "pam/PamResourcesPage/route.tsx"),
    route("/audit-logs", "project/AuditLogsPage/route-pam.tsx"),
    route("/settings", "pam/SettingsPage/route.tsx"),

    // Access Management
    route("/access-management", "project/AccessControlPage/route-pam.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-pam.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-pam.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-pam.tsx"),
    route("/groups/$groupId", "project/GroupDetailsByIDPage/route-pam.tsx")
  ])
]);

const organizationRoutes = route("/organizations/$orgId", [
  route("/projects", "organization/ProjectsPage/route.tsx"),
  route("/access-management", "organization/AccessManagementPage/route.tsx"),
  route("/audit-logs", "organization/AuditLogsPage/route.tsx"),
  route("/billing", "organization/BillingPage/route.tsx"),
  route("/secret-sharing", [index("organization/SecretSharingPage/route.tsx")]),
  route("/settings", [
    index("organization/SettingsPage/route.tsx"),
    route("/oauth/callback", "organization/SettingsPage/OauthCallbackPage/route.tsx")
  ]),
  route("/groups/$groupId", "organization/GroupDetailsByIDPage/route.tsx"),
  route("/members/$membershipId", "organization/UserDetailsByIDPage/route.tsx"),
  route("/roles/$roleId", "organization/RoleByIDPage/route.tsx"),
  route("/identities/$identityId", "organization/IdentityDetailsByIDPage/route.tsx"),
  route("/app-connections", [
    index("organization/AppConnections/AppConnectionsPage/route.tsx"),
    route(
      "/$appConnection/oauth/callback",
      "organization/AppConnections/OauthCallbackPage/route.tsx"
    )
  ]),
  route("/networking", "organization/NetworkingPage/route.tsx"),

  // Added these dummy routes to avoid errors when navigating from the organization-redirect and project-redirect
  route("/projects/$", ""),
  route("/$", "")
]);

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route("/shared/secret/$secretId", "public/ViewSharedSecretByIDPage/route.tsx"),
  route("/secret-request/secret/$secretRequestId", "public/ViewSecretRequestByIDPage/route.tsx"),
  route("/share-secret", "public/ShareSecretPage/route.tsx"),
  route("/upgrade-path", "public/UpgradePathPage/route.tsx"),
  route("/cli-redirect", "auth/CliRedirectPage/route.tsx"),
  middleware("restrict-login-signup.tsx", [
    route("/admin/signup", "admin/SignUpPage/route.tsx"),
    route("/login", [
      index("auth/LoginPage/route.tsx"),
      route("/admin", "auth/AdminLoginPage/route.tsx"),
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
    route("/password-setup", "auth/PasswordSetupPage/route.tsx"),
    route("/personal-settings", [
      layout("user/layout.tsx", [index("user/PersonalSettingsPage/route.tsx")])
    ]),
    route("/organizations/none", "organization/NoOrgPage/route.tsx"),
    middleware("inject-org-details.tsx", [
      route("/organization/$", "redirects/organization-redirect.tsx"),
      route("/projects/$", "redirects/project-redirect.tsx"),
      adminRoute,
      layout("org-layout", "organization/layout.tsx", [
        organizationRoutes,
        route("/organizations/$orgId/secret-manager/$projectId", [
          route("/approval", "secret-manager/redirects/redirect-approval-page.tsx")
        ]),
        secretManagerRoutes,
        secretManagerIntegrationsRedirect,
        certManagerRoutes,
        kmsRoutes,
        sshRoutes,
        secretScanningRoutes,
        pamRoutes,
        aiRoutes
      ])
    ])
  ])
]);
