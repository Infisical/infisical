import { FileRouteTypes } from "@app/routeTree.gen";

const setRoute = <TFull extends FileRouteTypes["fullPaths"], TId extends FileRouteTypes["id"]>(
  full: TFull,
  id: TId
) => ({ full, id }) as const;

export const ROUTE_PATHS = Object.freeze({
  Auth: {
    LoginSSO: setRoute("/login/sso", "/_restrict-login-signup/login/sso")
  },
  Organization: {
    SecretScanning: setRoute(
      "/organization/secret-scanning",
      "/_authenticate/_inject-org-details/organization/_layout/secret-scanning"
    ),
    SettingsPage: setRoute(
      "/organization/settings",
      "/_authenticate/_inject-org-details/organization/_layout/settings"
    )
  },
  SecretManager: {
    ApprovalPage: setRoute(
      "/secret-manager/$projectId/approval",
      "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/approval"
    ),
    SecretDashboardPage: setRoute(
      "/secret-manager/$projectId/secrets/$envSlug",
      "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/secrets/$envSlug"
    )
  },
  ProviderSuccessPage: setRoute(
    "/login/provider/success",
    "/_restrict-login-signup/login/provider/success"
  ),
  SignUpSsoPage: setRoute("/signup/sso", "/_restrict-login-signup/signup/sso"),
  PasswordResetPage: setRoute("/password-reset", "/_restrict-login-signup/password-reset"),
  ViewSharedSecretByIDPage: setRoute("/shared/secret/$secretId", "/shared/secret/$secretId"),
  OrgGroupDetailsByIDPage: setRoute(
    "/organization/groups/$groupId",
    "/_authenticate/_inject-org-details/organization/_layout/groups/$groupId"
  ),
  OrgIdentityDetailsByIDPage: setRoute(
    "/organization/identities/$identityId",
    "/_authenticate/_inject-org-details/organization/_layout/identities/$identityId"
  ),
  OrgUserDetailsByIDPage: setRoute(
    "/organization/members/$membershipId",
    "/_authenticate/_inject-org-details/organization/_layout/members/$membershipId"
  ),
  OrgAccessControlPage: setRoute(
    "/organization/access-management",
    "/_authenticate/_inject-org-details/organization/_layout/access-management"
  ),
  OrgRoleByIDPage: setRoute(
    "/organization/roles/$roleId",
    "/_authenticate/_inject-org-details/organization/_layout/roles/$roleId"
  ),
  SecretOverviewPage: setRoute(
    "/secret-manager/$projectId/overview",
    "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/overview"
  ),
  SecretDashboardPage: setRoute(
    "/secret-manager/$projectId/secrets/$envSlug",
    "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/secrets/$envSlug"
  ),
  CertAuthDetailsByIDPage: setRoute(
    "/cert-manager/$projectId/ca/$caId",
    "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
  ),
  CertCertificatesPage: setRoute(
    "/cert-manager/$projectId/overview",
    "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/overview"
  ),
  CertPkiCollectionDetailsByIDPage: setRoute(
    "/cert-manager/$projectId/pki-collections/$collectionId",
    "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/pki-collections/$collectionId"
  )
});
