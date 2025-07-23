import { FileRouteTypes } from "@app/routeTree.gen";

const setRoute = <TFull extends FileRouteTypes["fullPaths"], TId extends FileRouteTypes["id"]>(
  path: TFull,
  id: TId
) => ({ path, id }) as const;

export const ROUTE_PATHS = Object.freeze({
  Auth: {
    LoginSSO: setRoute("/login/sso", "/_restrict-login-signup/login/sso"),
    ProviderSuccessPage: setRoute(
      "/login/provider/success",
      "/_restrict-login-signup/login/provider/success"
    ),
    SignUpSsoPage: setRoute("/signup/sso", "/_restrict-login-signup/signup/sso"),
    PasswordResetPage: setRoute("/password-reset", "/_restrict-login-signup/password-reset"),
    PasswordSetupPage: setRoute("/password-setup", "/_authenticate/password-setup")
  },
  Admin: {
    IntegrationsPage: setRoute(
      "/admin/integrations",
      "/_authenticate/_inject-org-details/admin/_admin-layout/integrations"
    )
  },
  Organization: {
    Settings: {
      OauthCallbackPage: setRoute(
        "/organization/settings/oauth/callback",
        "/_authenticate/_inject-org-details/_org-layout/organization/settings/oauth/callback"
      )
    },
    SecretSharing: setRoute(
      "/organization/secret-sharing",
      "/_authenticate/_inject-org-details/_org-layout/organization/secret-sharing/"
    ),
    SecretSharingSettings: setRoute(
      "/organization/secret-sharing/settings",
      "/_authenticate/_inject-org-details/_org-layout/organization/secret-sharing/settings"
    ),
    SettingsPage: setRoute(
      "/organization/settings",
      "/_authenticate/_inject-org-details/_org-layout/organization/settings/"
    ),
    GroupDetailsByIDPage: setRoute(
      "/organization/groups/$groupId",
      "/_authenticate/_inject-org-details/_org-layout/organization/groups/$groupId"
    ),
    IdentityDetailsByIDPage: setRoute(
      "/organization/identities/$identityId",
      "/_authenticate/_inject-org-details/_org-layout/organization/identities/$identityId"
    ),
    UserDetailsByIDPage: setRoute(
      "/organization/members/$membershipId",
      "/_authenticate/_inject-org-details/_org-layout/organization/members/$membershipId"
    ),
    AccessControlPage: setRoute(
      "/organization/access-management",
      "/_authenticate/_inject-org-details/_org-layout/organization/access-management"
    ),
    RoleByIDPage: setRoute(
      "/organization/roles/$roleId",
      "/_authenticate/_inject-org-details/_org-layout/organization/roles/$roleId"
    ),
    AppConnections: {
      OauthCallbackPage: setRoute(
        "/organization/app-connections/$appConnection/oauth/callback",
        "/_authenticate/_inject-org-details/_org-layout/organization/app-connections/$appConnection/oauth/callback"
      )
    }
  },
  SecretManager: {
    ApprovalPage: setRoute(
      "/projects/secret-management/$projectId/approval",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/approval"
    ),
    SecretDashboardPage: setRoute(
      "/projects/secret-management/$projectId/secrets/$envSlug",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/secrets/$envSlug"
    ),
    RollbackPreviewPage: setRoute(
      "/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId/restore",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId/$commitId/restore"
    ),
    CommitDetailsPage: setRoute(
      "/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId/$commitId"
    ),
    CommitsPage: setRoute(
      "/projects/secret-management/$projectId/commits/$environment/$folderId",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId"
    ),
    OverviewPage: setRoute(
      "/projects/secret-management/$projectId/overview",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/overview"
    ),
    IntegrationsListPage: setRoute(
      "/projects/secret-management/$projectId/integrations",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/"
    ),
    IntegrationDetailsByIDPage: setRoute(
      "/projects/secret-management/$projectId/integrations/$integrationId",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/$integrationId"
    ),
    SecretSyncDetailsByIDPage: setRoute(
      "/projects/secret-management/$projectId/integrations/secret-syncs/$destination/$syncId",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/secret-syncs/$destination/$syncId"
    ),
    Integratons: {
      SelectIntegrationAuth: setRoute(
        "/projects/secret-management/$projectId/integrations/select-integration-auth",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/select-integration-auth"
      ),
      HerokuOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/heroku/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/heroku/oauth2/callback"
      ),
      HerokuConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/heroku/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/heroku/create"
      ),
      AwsParameterStoreConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/aws-parameter-store/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/aws-parameter-store/create"
      ),
      AwsSecretManagerConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/aws-secret-manager/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/aws-secret-manager/create"
      ),
      AzureAppConfigurationsOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/azure-app-configuration/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-app-configuration/oauth2/callback"
      ),
      AzureAppConfigurationsConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/azure-app-configuration/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-app-configuration/create"
      ),
      AzureDevopsConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/azure-devops/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-devops/create"
      ),
      AzureKeyVaultAuthorizePage: setRoute(
        "/projects/secret-management/$projectId/integrations/azure-key-vault/authorize",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/authorize"
      ),
      AzureKeyVaultOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/azure-key-vault/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/oauth2/callback"
      ),
      AzureKeyVaultConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/azure-key-vault/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/create"
      ),
      BitbucketOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/bitbucket/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/bitbucket/oauth2/callback"
      ),
      BitbucketConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/bitbucket/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/bitbucket/create"
      ),
      ChecklyConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/checkly/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/checkly/create"
      ),
      CircleConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/circleci/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/circleci/create"
      ),
      CloudflarePagesConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/cloudflare-pages/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/cloudflare-pages/create"
      ),
      DigitalOceanAppPlatformConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/digital-ocean-app-platform/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/create"
      ),
      CloudflareWorkersConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/cloudflare-workers/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/cloudflare-workers/create"
      ),
      CodefreshConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/codefresh/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/codefresh/create"
      ),
      GcpSecretManagerConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/gcp-secret-manager/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/create"
      ),
      GcpSecretManagerOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/gcp-secret-manager/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/oauth2/callback"
      ),
      GithubConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/github/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/github/create"
      ),
      GithubOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/github/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/github/oauth2/callback"
      ),
      GitlabConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/gitlab/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/gitlab/create"
      ),
      GitlabOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/gitlab/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/gitlab/oauth2/callback"
      ),
      VercelOauthCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/vercel/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/vercel/oauth2/callback"
      ),
      VercelConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/vercel/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/vercel/create"
      ),
      FlyioConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/flyio/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/flyio/create"
      ),
      HashicorpVaultConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/hashicorp-vault/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/hashicorp-vault/create"
      ),
      HasuraCloudConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/hasura-cloud/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/hasura-cloud/create"
      ),
      LaravelForgeConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/laravel-forge/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/laravel-forge/create"
      ),
      NorthflankConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/northflank/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/northflank/create"
      ),
      RailwayConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/railway/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/railway/create"
      ),
      RenderConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/render/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/render/create"
      ),
      RundeckConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/rundeck/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/rundeck/create"
      ),
      WindmillConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/windmill/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/windmill/create"
      ),
      TravisCIConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/travisci/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/travisci/create"
      ),
      TerraformCloudConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/terraform-cloud/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/terraform-cloud/create"
      ),
      TeamcityConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/teamcity/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/teamcity/create"
      ),
      SupabaseConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/supabase/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/supabase/create"
      ),
      OctopusDeployCloudConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/octopus-deploy/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/octopus-deploy/create"
      ),
      DatabricksConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/databricks/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/databricks/create"
      ),
      QoveryConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/qovery/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/qovery/create"
      ),
      Cloud66ConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/cloud-66/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/cloud-66/create"
      ),
      NetlifyConfigurePage: setRoute(
        "/projects/secret-management/$projectId/integrations/netlify/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/netlify/create"
      ),
      NetlifyOuathCallbackPage: setRoute(
        "/projects/secret-management/$projectId/integrations/netlify/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/integrations/netlify/oauth2/callback"
      )
    }
  },
  CertManager: {
    CertAuthDetailsByIDPage: setRoute(
      "/projects/cert-management/$projectId/ca/$caName",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/ca/$caName"
    ),
    SubscribersPage: setRoute(
      "/projects/cert-management/$projectId/subscribers",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/subscribers"
    ),
    CertificatesPage: setRoute(
      "/projects/cert-management/$projectId/certificates",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/certificates"
    ),
    CertificateAuthoritiesPage: setRoute(
      "/projects/cert-management/$projectId/certificate-authorities",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/certificate-authorities"
    ),
    AlertingPage: setRoute(
      "/projects/cert-management/$projectId/alerting",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/alerting"
    ),
    PkiCollectionDetailsByIDPage: setRoute(
      "/projects/cert-management/$projectId/pki-collections/$collectionId",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/pki-collections/$collectionId"
    ),
    PkiSubscriberDetailsByIDPage: setRoute(
      "/projects/cert-management/$projectId/subscribers/$subscriberName",
      "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/subscribers/$subscriberName"
    )
  },
  Ssh: {
    SshCaByIDPage: setRoute(
      "/projects/ssh/$projectId/ca/$caId",
      "/_authenticate/_inject-org-details/_org-layout/projects/ssh/$projectId/_ssh-layout/ca/$caId"
    ),
    SshHostGroupDetailsByIDPage: setRoute(
      "/projects/ssh/$projectId/ssh-host-groups/$sshHostGroupId",
      "/_authenticate/_inject-org-details/_org-layout/projects/ssh/$projectId/_ssh-layout/ssh-host-groups/$sshHostGroupId"
    )
  },
  SecretScanning: {
    DataSourceByIdPage: setRoute(
      "/projects/secret-scanning/$projectId/data-sources/$type/$dataSourceId",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-scanning/$projectId/_secret-scanning-layout/data-sources/$type/$dataSourceId"
    ),
    FindingsPage: setRoute(
      "/projects/secret-scanning/$projectId/findings",
      "/_authenticate/_inject-org-details/_org-layout/projects/secret-scanning/$projectId/_secret-scanning-layout/findings"
    )
  },
  Public: {
    ViewSharedSecretByIDPage: setRoute("/shared/secret/$secretId", "/shared/secret/$secretId"),
    ViewSecretRequestByIDPage: setRoute(
      "/secret-request/secret/$secretRequestId",
      "/secret-request/secret/$secretRequestId"
    )
  }
});
