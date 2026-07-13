import { FileRouteTypes } from "@app/routeTree.gen";

const setRoute = <TFull extends FileRouteTypes["fullPaths"], TId extends FileRouteTypes["id"]>(
  path: TFull,
  id: TId
) => ({ path, id }) as const;

export const ROUTE_PATHS = Object.freeze({
  Auth: {
    SelectOrgPage: setRoute(
      "/login/select-organization",
      "/_restrict-login-signup/login/select-organization"
    ),
    SignUpSsoPage: setRoute("/signup/sso", "/_restrict-login-signup/signup/sso"),
    AccountRecoveryResetPage: setRoute(
      "/account-recovery-reset",
      "/_restrict-login-signup/account-recovery-reset"
    ),
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
        "/organizations/$orgId/settings/oauth/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/settings/oauth/callback"
      )
    },
    SecretSharing: setRoute(
      "/organizations/$orgId/projects/secret-management/secret-sharing",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/secret-sharing/"
    ),
    ProjectsPage: setRoute(
      "/organizations/$orgId/projects",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects"
    ),
    SettingsPage: setRoute(
      "/organizations/$orgId/settings",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/settings/"
    ),
    GroupDetailsByIDPage: setRoute(
      "/organizations/$orgId/groups/$groupId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/groups/$groupId"
    ),
    IdentityDetailsByIDPage: setRoute(
      "/organizations/$orgId/identities/$identityId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/identities/$identityId"
    ),
    UserDetailsByIDPage: setRoute(
      "/organizations/$orgId/members/$membershipId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/members/$membershipId"
    ),
    AccessControlPage: setRoute(
      "/organizations/$orgId/access-management",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/access-management"
    ),
    RoleByIDPage: setRoute(
      "/organizations/$orgId/roles/$roleId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/roles/$roleId"
    ),
    IntegrationsPage: setRoute(
      "/organizations/$orgId/integrations",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/integrations"
    ),
    AuditLogsPage: setRoute(
      "/organizations/$orgId/audit-logs",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/audit-logs"
    ),
    SsoPage: setRoute(
      "/organizations/$orgId/sso",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sso"
    ),
    AppConnections: {
      OauthCallbackPage: setRoute(
        "/organizations/$orgId/app-connections/$appConnection/oauth/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/$appConnection/oauth/callback"
      ),
      GitHubManifestCallbackPage: setRoute(
        "/organizations/$orgId/app-connections/github/manifest/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/app-connections/github/manifest/callback"
      )
    },
    NetworkingPage: setRoute(
      "/organizations/$orgId/networking/",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/networking/"
    ),
    GatewayDetailsByIDPage: setRoute(
      "/organizations/$orgId/networking/gateways/$gatewayId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/networking/gateways/$gatewayId"
    ),
    RelayDetailsByIDPage: setRoute(
      "/organizations/$orgId/networking/relays/$relayId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/networking/relays/$relayId"
    ),
    KmipServerDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId"
    )
  },
  SecretManager: {
    ApprovalPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/approval",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/approval"
    ),
    SecretDashboardPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/secrets/$envSlug"
    ),
    RollbackPreviewPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId/restore",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId/$commitId/restore"
    ),
    CommitDetailsPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId/$commitId"
    ),
    CommitsPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId"
    ),
    OverviewPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/overview",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/overview"
    ),
    IntegrationsListPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/integrations",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/"
    ),
    SettingsPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/settings",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/settings"
    ),
    InsightsPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/insights",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/insights"
    ),
    IntegrationDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/integrations/$integrationId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/$integrationId"
    ),
    SecretSyncDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/secret-management/$projectId/integrations/secret-syncs/$destination/$syncId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/secret-syncs/$destination/$syncId"
    ),
    Integratons: {
      SelectIntegrationAuth: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/select-integration-auth",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/select-integration-auth"
      ),
      HerokuOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/heroku/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/heroku/oauth2/callback"
      ),
      HerokuConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/heroku/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/heroku/create"
      ),
      AwsParameterStoreConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/aws-parameter-store/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/aws-parameter-store/create"
      ),
      AwsSecretManagerConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/aws-secret-manager/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/aws-secret-manager/create"
      ),
      AzureAppConfigurationsOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-app-configuration/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-app-configuration/oauth2/callback"
      ),
      AzureAppConfigurationsConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-app-configuration/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-app-configuration/create"
      ),
      AzureDevopsConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-devops/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-devops/create"
      ),
      AzureKeyVaultAuthorizePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-key-vault/authorize",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/authorize"
      ),
      AzureKeyVaultOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-key-vault/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/oauth2/callback"
      ),
      AzureKeyVaultConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/azure-key-vault/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/create"
      ),
      BitbucketOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/bitbucket/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/bitbucket/oauth2/callback"
      ),
      BitbucketConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/bitbucket/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/bitbucket/create"
      ),
      ChecklyConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/checkly/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/checkly/create"
      ),
      CircleConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/circleci/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/circleci/create"
      ),
      CloudflarePagesConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/cloudflare-pages/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/cloudflare-pages/create"
      ),
      DigitalOceanAppPlatformConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/digital-ocean-app-platform/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/create"
      ),
      CloudflareWorkersConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/cloudflare-workers/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/cloudflare-workers/create"
      ),
      CodefreshConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/codefresh/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/codefresh/create"
      ),
      GcpSecretManagerConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/gcp-secret-manager/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/create"
      ),
      GcpSecretManagerOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/gcp-secret-manager/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/oauth2/callback"
      ),
      GithubConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/github/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/github/create"
      ),
      GithubOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/github/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/github/oauth2/callback"
      ),
      GitlabConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/gitlab/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/gitlab/create"
      ),
      GitlabOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/gitlab/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/gitlab/oauth2/callback"
      ),
      VercelOauthCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/vercel/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/vercel/oauth2/callback"
      ),
      VercelConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/vercel/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/vercel/create"
      ),
      FlyioConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/flyio/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/flyio/create"
      ),
      HashicorpVaultConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/hashicorp-vault/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/hashicorp-vault/create"
      ),
      HasuraCloudConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/hasura-cloud/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/hasura-cloud/create"
      ),
      LaravelForgeConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/laravel-forge/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/laravel-forge/create"
      ),
      NorthflankConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/northflank/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/northflank/create"
      ),
      RailwayConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/railway/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/railway/create"
      ),
      RenderConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/render/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/render/create"
      ),
      RundeckConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/rundeck/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/rundeck/create"
      ),
      WindmillConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/windmill/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/windmill/create"
      ),
      TravisCIConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/travisci/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/travisci/create"
      ),
      TerraformCloudConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/terraform-cloud/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/terraform-cloud/create"
      ),
      TeamcityConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/teamcity/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/teamcity/create"
      ),
      SupabaseConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/supabase/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/supabase/create"
      ),
      OctopusDeployCloudConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/octopus-deploy/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/octopus-deploy/create"
      ),
      DatabricksConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/databricks/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/databricks/create"
      ),
      QoveryConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/qovery/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/qovery/create"
      ),
      Cloud66ConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/cloud-66/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/cloud-66/create"
      ),
      NetlifyConfigurePage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/netlify/create",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/netlify/create"
      ),
      NetlifyOuathCallbackPage: setRoute(
        "/organizations/$orgId/projects/secret-management/$projectId/integrations/netlify/oauth2/callback",
        "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/netlify/oauth2/callback"
      )
    }
  },
  CertManager: {
    CertAuthDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
    ),
    CertificateProfilesPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-profiles/"
    ),
    CertificateProfileDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles/$profileId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-profiles/$profileId"
    ),
    CertificatePoliciesPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-policies/"
    ),
    CertificatePolicyDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies/$policyId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-policies/$policyId"
    ),
    HsmConnectorDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/hsm-connectors/$connectorId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/hsm-connectors/$connectorId"
    ),
    SubscribersPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/subscribers",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/subscribers"
    ),
    CertificateAuthoritiesPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-authorities"
    ),
    AlertingPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/alerting",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/alerting"
    ),
    PkiCollectionDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/pki-collections/$collectionId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/pki-collections/$collectionId"
    ),
    PkiSubscriberDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/subscribers/$subscriberName",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/subscribers/$subscriberName"
    ),
    IntegrationsListPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/integrations",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/integrations/"
    ),
    PkiSyncDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/integrations/$syncId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/integrations/$syncId"
    ),
    CertificateDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificates/$certificateId"
    ),
    SignerDetailByIDPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/code-signing/$signerId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/$signerId"
    ),
    CodeSigningPage: setRoute(
      "/organizations/$orgId/projects/cert-manager/$projectId/code-signing",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing"
    )
  },
  Ssh: {
    SshCaByIDPage: setRoute(
      "/organizations/$orgId/projects/ssh/$projectId/ca/$caId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ssh/$projectId/_ssh-layout/ca/$caId"
    ),
    SshHostGroupDetailsByIDPage: setRoute(
      "/organizations/$orgId/projects/ssh/$projectId/ssh-host-groups/$sshHostGroupId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ssh/$projectId/_ssh-layout/ssh-host-groups/$sshHostGroupId"
    )
  },
  SecretScanning: {
    DataSourceByIdPage: setRoute(
      "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources/$type/$dataSourceId",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout/data-sources/$type/$dataSourceId"
    ),
    FindingsPage: setRoute(
      "/organizations/$orgId/projects/secret-scanning/$projectId/findings",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout/findings"
    )
  },
  Pam: {
    AccessPage: setRoute(
      "/organizations/$orgId/pam/access",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/access/"
    ),
    PamAccountAccessPage: setRoute(
      "/organizations/$orgId/pam/accounts/$accountType/$accountId/access",
      "/_authenticate/_inject-org-details/organizations/$orgId/pam/accounts/$accountType/$accountId/access"
    ),
    AccountsPage: setRoute(
      "/organizations/$orgId/pam/accounts",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/accounts"
    ),
    TemplatesPage: setRoute(
      "/organizations/$orgId/pam/templates",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/templates"
    ),
    DiscoveryPage: setRoute(
      "/organizations/$orgId/pam/discovery",
      "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/discovery"
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
