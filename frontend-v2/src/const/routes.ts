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
    PasswordResetPage: setRoute("/password-reset", "/_restrict-login-signup/password-reset")
  },
  Organization: {
    SecretScanning: setRoute(
      "/organization/secret-scanning",
      "/_authenticate/_inject-org-details/organization/_layout/secret-scanning"
    ),
    SettingsPage: setRoute(
      "/organization/settings",
      "/_authenticate/_inject-org-details/organization/_layout/settings"
    ),
    GroupDetailsByIDPage: setRoute(
      "/organization/groups/$groupId",
      "/_authenticate/_inject-org-details/organization/_layout/groups/$groupId"
    ),
    IdentityDetailsByIDPage: setRoute(
      "/organization/identities/$identityId",
      "/_authenticate/_inject-org-details/organization/_layout/identities/$identityId"
    ),
    UserDetailsByIDPage: setRoute(
      "/organization/members/$membershipId",
      "/_authenticate/_inject-org-details/organization/_layout/members/$membershipId"
    ),
    AccessControlPage: setRoute(
      "/organization/access-management",
      "/_authenticate/_inject-org-details/organization/_layout/access-management"
    ),
    RoleByIDPage: setRoute(
      "/organization/roles/$roleId",
      "/_authenticate/_inject-org-details/organization/_layout/roles/$roleId"
    ),
    AppConnections: {
      GithubOauthCallbackPage: setRoute(
        "/organization/app-connections/github/oauth/callback",
        "/_authenticate/_inject-org-details/organization/_layout/app-connections/github/oauth/callback"
      )
    }
  },
  SecretManager: {
    ApprovalPage: setRoute(
      "/secret-manager/$projectId/approval",
      "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/approval"
    ),
    SecretDashboardPage: setRoute(
      "/secret-manager/$projectId/secrets/$envSlug",
      "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/secrets/$envSlug"
    ),
    OverviewPage: setRoute(
      "/secret-manager/$projectId/overview",
      "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/overview"
    ),
    IntegrationDetailsByIDPage: setRoute(
      "/secret-manager/$projectId/integrations/$integrationId",
      "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/$integrationId"
    ),
    Integratons: {
      SelectIntegrationAuth: setRoute(
        "/secret-manager/$projectId/integrations/select-integration-auth",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/select-integration-auth"
      ),
      HerokuOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/heroku/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/heroku/oauth2/callback"
      ),
      HerokuConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/heroku/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/heroku/create"
      ),
      AwsParameterStoreConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/aws-parameter-store/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/aws-parameter-store/create"
      ),
      AwsSecretManagerConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/aws-secret-manager/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/aws-secret-manager/create"
      ),
      AzureAppConfigurationsOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/azure-app-configuration/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-app-configuration/oauth2/callback"
      ),
      AzureAppConfigurationsConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/azure-app-configuration/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-app-configuration/create"
      ),
      AzureDevopsConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/azure-devops/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-devops/create"
      ),
      AzureKeyVaultOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/azure-key-vault/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-key-vault/oauth2/callback"
      ),
      AzureKeyVaultConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/azure-key-vault/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-key-vault/create"
      ),
      BitbucketOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/bitbucket/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/bitbucket/oauth2/callback"
      ),
      BitbucketConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/bitbucket/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/bitbucket/create"
      ),
      ChecklyConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/checkly/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/checkly/create"
      ),
      CircleConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/circleci/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/circleci/create"
      ),
      CloudflarePagesConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/cloudflare-pages/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-pages/create"
      ),
      DigitalOceanAppPlatformConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/digital-ocean-app-platform/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/create"
      ),
      CloudflareWorkersConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/cloudflare-workers/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-workers/create"
      ),
      CodefreshConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/codefresh/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/codefresh/create"
      ),
      GcpSecretManagerConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/gcp-secret-manager/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/create"
      ),
      GcpSecretManagerOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/gcp-secret-manager/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/oauth2/callback"
      ),
      GithubConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/github/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/github/create"
      ),
      GithubOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/github/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/github/oauth2/callback"
      ),
      GitlabConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/gitlab/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gitlab/create"
      ),
      GitlabOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/gitlab/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gitlab/oauth2/callback"
      ),
      VercelOauthCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/vercel/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/vercel/oauth2/callback"
      ),
      VercelConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/vercel/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/vercel/create"
      ),
      FlyioConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/flyio/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/flyio/create"
      ),
      HashicorpVaultConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/hashicorp-vault/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/hashicorp-vault/create"
      ),
      HasuraCloudConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/hasura-cloud/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/hasura-cloud/create"
      ),
      LaravelForgeConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/laravel-forge/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/laravel-forge/create"
      ),
      NorthflankConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/northflank/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/northflank/create"
      ),
      RailwayConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/railway/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/railway/create"
      ),
      RenderConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/render/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/render/create"
      ),
      RundeckConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/rundeck/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/rundeck/create"
      ),
      WindmillConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/windmill/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/windmill/create"
      ),
      TravisCIConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/travisci/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/travisci/create"
      ),
      TerraformCloudConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/terraform-cloud/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/terraform-cloud/create"
      ),
      TeamcityConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/teamcity/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/teamcity/create"
      ),
      SupabaseConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/supabase/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/supabase/create"
      ),
      OctopusDeployCloudConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/octopus-deploy/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/octopus-deploy/create"
      ),
      DatabricksConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/databricks/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/databricks/create"
      ),
      QoveryConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/qovery/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/qovery/create"
      ),
      Cloud66ConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/cloud-66/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloud-66/create"
      ),
      NetlifyConfigurePage: setRoute(
        "/secret-manager/$projectId/integrations/netlify/create",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/netlify/create"
      ),
      NetlifyOuathCallbackPage: setRoute(
        "/secret-manager/$projectId/integrations/netlify/oauth2/callback",
        "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/netlify/oauth2/callback"
      )
    }
  },
  CertManager: {
    CertAuthDetailsByIDPage: setRoute(
      "/cert-manager/$projectId/ca/$caId",
      "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
    ),
    OverviewPage: setRoute(
      "/cert-manager/$projectId/overview",
      "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/overview"
    ),
    PkiCollectionDetailsByIDPage: setRoute(
      "/cert-manager/$projectId/pki-collections/$collectionId",
      "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/pki-collections/$collectionId"
    )
  },
  Ssh: {
    SshCaByIDPage: setRoute(
      "/ssh/$projectId/ca/$caId",
      "/_authenticate/_inject-org-details/ssh/$projectId/_ssh-layout/ca/$caId"
    )
  },
  Public: {
    ViewSharedSecretByIDPage: setRoute("/shared/secret/$secretId", "/shared/secret/$secretId")
  }
});
