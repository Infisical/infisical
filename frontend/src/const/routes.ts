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
    SsoPage: setRoute(
      "/organization/sso",
      "/_authenticate/_inject-org-details/_org-layout/organization/sso"
    ),
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
      "/projects/$projectId/secret-manager/approval",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/approval"
    ),
    SecretDashboardPage: setRoute(
      "/projects/$projectId/secret-manager/secrets/$envSlug",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/secrets/$envSlug"
    ),
    RollbackPreviewPage: setRoute(
      "/projects/$projectId/secret-manager/commits/$environment/$folderId/$commitId/restore",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/commits/$environment/$folderId/$commitId/restore"
    ),
    CommitDetailsPage: setRoute(
      "/projects/$projectId/secret-manager/commits/$environment/$folderId/$commitId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/commits/$environment/$folderId/$commitId"
    ),
    CommitsPage: setRoute(
      "/projects/$projectId/secret-manager/commits/$environment/$folderId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/commits/$environment/$folderId"
    ),
    OverviewPage: setRoute(
      "/projects/$projectId/secret-manager/overview",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/overview"
    ),
    IntegrationsListPage: setRoute(
      "/projects/$projectId/secret-manager/integrations",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/"
    ),
    IntegrationDetailsByIDPage: setRoute(
      "/projects/$projectId/secret-manager/integrations/$integrationId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/$integrationId"
    ),
    SecretSyncDetailsByIDPage: setRoute(
      "/projects/$projectId/secret-manager/integrations/secret-syncs/$destination/$syncId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/secret-syncs/$destination/$syncId"
    ),
    Integratons: {
      SelectIntegrationAuth: setRoute(
        "/projects/$projectId/secret-manager/integrations/select-integration-auth",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/select-integration-auth"
      ),
      HerokuOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/heroku/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/heroku/oauth2/callback"
      ),
      HerokuConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/heroku/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/heroku/create"
      ),
      AwsParameterStoreConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/aws-parameter-store/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/aws-parameter-store/create"
      ),
      AwsSecretManagerConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/aws-secret-manager/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/aws-secret-manager/create"
      ),
      AzureAppConfigurationsOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/azure-app-configuration/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/azure-app-configuration/oauth2/callback"
      ),
      AzureAppConfigurationsConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/azure-app-configuration/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/azure-app-configuration/create"
      ),
      AzureDevopsConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/azure-devops/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/azure-devops/create"
      ),
      AzureKeyVaultAuthorizePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/azure-key-vault/authorize",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/azure-key-vault/authorize"
      ),
      AzureKeyVaultOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/azure-key-vault/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/azure-key-vault/oauth2/callback"
      ),
      AzureKeyVaultConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/azure-key-vault/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/azure-key-vault/create"
      ),
      BitbucketOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/bitbucket/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/bitbucket/oauth2/callback"
      ),
      BitbucketConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/bitbucket/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/bitbucket/create"
      ),
      ChecklyConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/checkly/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/checkly/create"
      ),
      CircleConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/circleci/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/circleci/create"
      ),
      CloudflarePagesConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/cloudflare-pages/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/cloudflare-pages/create"
      ),
      DigitalOceanAppPlatformConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/digital-ocean-app-platform/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/digital-ocean-app-platform/create"
      ),
      CloudflareWorkersConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/cloudflare-workers/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/cloudflare-workers/create"
      ),
      CodefreshConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/codefresh/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/codefresh/create"
      ),
      GcpSecretManagerConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/gcp-secret-manager/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/gcp-secret-manager/create"
      ),
      GcpSecretManagerOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/gcp-secret-manager/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/gcp-secret-manager/oauth2/callback"
      ),
      GithubConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/github/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/github/create"
      ),
      GithubOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/github/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/github/oauth2/callback"
      ),
      GitlabConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/gitlab/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/gitlab/create"
      ),
      GitlabOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/gitlab/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/gitlab/oauth2/callback"
      ),
      VercelOauthCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/vercel/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/vercel/oauth2/callback"
      ),
      VercelConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/vercel/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/vercel/create"
      ),
      FlyioConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/flyio/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/flyio/create"
      ),
      HashicorpVaultConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/hashicorp-vault/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/hashicorp-vault/create"
      ),
      HasuraCloudConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/hasura-cloud/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/hasura-cloud/create"
      ),
      LaravelForgeConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/laravel-forge/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/laravel-forge/create"
      ),
      NorthflankConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/northflank/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/northflank/create"
      ),
      RailwayConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/railway/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/railway/create"
      ),
      RenderConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/render/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/render/create"
      ),
      RundeckConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/rundeck/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/rundeck/create"
      ),
      WindmillConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/windmill/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/windmill/create"
      ),
      TravisCIConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/travisci/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/travisci/create"
      ),
      TerraformCloudConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/terraform-cloud/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/terraform-cloud/create"
      ),
      TeamcityConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/teamcity/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/teamcity/create"
      ),
      SupabaseConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/supabase/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/supabase/create"
      ),
      OctopusDeployCloudConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/octopus-deploy/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/octopus-deploy/create"
      ),
      DatabricksConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/databricks/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/databricks/create"
      ),
      QoveryConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/qovery/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/qovery/create"
      ),
      Cloud66ConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/cloud-66/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/cloud-66/create"
      ),
      NetlifyConfigurePage: setRoute(
        "/projects/$projectId/secret-manager/integrations/netlify/create",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/netlify/create"
      ),
      NetlifyOuathCallbackPage: setRoute(
        "/projects/$projectId/secret-manager/integrations/netlify/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/netlify/oauth2/callback"
      )
    }
  },
  CertManager: {
    CertAuthDetailsByIDPage: setRoute(
      "/projects/$projectId/cert-manager/ca/$caName",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/ca/$caName"
    ),
    SubscribersPage: setRoute(
      "/projects/$projectId/cert-manager/subscribers",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/subscribers"
    ),
    CertificatesPage: setRoute(
      "/projects/$projectId/cert-manager/certificates",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/certificates"
    ),
    CertificateAuthoritiesPage: setRoute(
      "/projects/$projectId/cert-manager/certificate-authorities",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/certificate-authorities"
    ),
    AlertingPage: setRoute(
      "/projects/$projectId/cert-manager/alerting",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/alerting"
    ),
    PkiCollectionDetailsByIDPage: setRoute(
      "/projects/$projectId/cert-manager/pki-collections/$collectionId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/pki-collections/$collectionId"
    ),
    PkiSubscriberDetailsByIDPage: setRoute(
      "/projects/$projectId/cert-manager/subscribers/$subscriberName",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout/subscribers/$subscriberName"
    )
  },
  Ssh: {
    SshCaByIDPage: setRoute(
      "/projects/$projectId/ssh/ca/$caId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/ssh/_ssh-layout/ca/$caId"
    ),
    SshHostGroupDetailsByIDPage: setRoute(
      "/projects/$projectId/ssh/ssh-host-groups/$sshHostGroupId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/ssh/_ssh-layout/ssh-host-groups/$sshHostGroupId"
    )
  },
  SecretScanning: {
    DataSourceByIdPage: setRoute(
      "/projects/$projectId/secret-scanning/data-sources/$type/$dataSourceId",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-scanning/_secret-scanning-layout/data-sources/$type/$dataSourceId"
    ),
    FindingsPage: setRoute(
      "/projects/$projectId/secret-scanning/findings",
      "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-scanning/_secret-scanning-layout/findings"
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
