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
    route("/access-management", "project/AccessControlPage/route-secret-manager.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-secret-manager.tsx"),
    route("/identities/$identityId", "project/IdentityDetailsByIDPage/route-secret-manager.tsx"),
    route("/members/$membershipId", "project/MemberDetailsByIDPage/route-secret-manager.tsx")
  ])
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
    route("/verify-email", "auth/VerifyEmailPage/route.tsx"),
    route("/cli-redirect", "auth/CliRedirectPage/route.tsx")
  ]),
  middleware("authenticate.tsx", [
    route("/personal-settings", [
      layout("user/layout.tsx", [index("user/PersonalSettingsPage/route.tsx")])
    ]),
    adminRoute,
    middleware("inject-org-details.tsx", [
      organizationRoutes,
      secretManagerRoutes,
      certManagerRoutes,
      kmsRoutes,
      sshRoutes
    ])
  ])
]);
