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
    )
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
