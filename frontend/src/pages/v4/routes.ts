import { index, layout, route } from "@tanstack/virtual-file-routes";

export const v4Routes = route("/v4", "v4/route.tsx", [
  layout("v4-auth", "v4/auth/route.tsx", [
    route("/login", [
      index("v4/auth/LoginPage/route.tsx"),
      route("/admin", "v4/auth/LoginPage/admin/route.tsx"),
      route("/select-organization", "v4/auth/SelectOrgPage/route.tsx"),
      route("/ldap", "v4/auth/LdapLoginPage/route.tsx"),
      route("/oidc", "v4/auth/SsoLoginPage/oidc/route.tsx"),
      route("/saml", "v4/auth/SsoLoginPage/saml/route.tsx"),
      route("/provider/error", "v4/auth/ProviderErrorPage/route.tsx")
    ]),
    route("/signup", [
      index("v4/auth/SignUpPage/route.tsx"),
      route("/sso", "v4/auth/SignUpSsoPage/route.tsx")
    ])
  ]),
  route("/mfa-session/$mfaSessionId", "v4/auth/MfaSessionPage/route.tsx"),
  route("/organizations/$orgId", "v4/organization/route.tsx", [
    route("/projects", [
      index("v4/organization/ProjectsPage/route.tsx"),
      route("/kms/$projectId/overview", "v4/kms/OverviewPage/route.tsx"),
      route("/kms/$projectId/access-management", "v4/project/AccessControlPage/kms/route.tsx"),
      route(
        "/kms/$projectId/members/$membershipId",
        "v4/project/MemberDetailsByIDPage/kms/route.tsx"
      ),
      route(
        "/kms/$projectId/identities/$identityId",
        "v4/project/IdentityDetailsByIDPage/kms/route.tsx"
      ),
      route("/kms/$projectId/groups/$groupId", "v4/project/GroupDetailsByIDPage/kms/route.tsx"),
      route("/kms/$projectId/roles/$roleSlug", "v4/project/RoleDetailsBySlugPage/kms/route.tsx"),
      route("/secret-management/$projectId/overview", "v4/secret-manager/OverviewPage/route.tsx"),
      route(
        "/secret-management/$projectId/secrets/$envSlug",
        "v4/secret-manager/SecretDashboardPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/approval",
        "v4/secret-manager/SecretApprovalsPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/access-management",
        "v4/project/AccessControlPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/members/$membershipId",
        "v4/project/MemberDetailsByIDPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/identities/$identityId",
        "v4/project/IdentityDetailsByIDPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/groups/$groupId",
        "v4/project/GroupDetailsByIDPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/roles/$roleSlug",
        "v4/project/RoleDetailsBySlugPage/route.tsx"
      ),
      route("/agent-vault/$projectId/", "v4/redirects/AgentVaultIndexRedirect/route.tsx"),
      route("/agent-vault/$projectId/sessions", "v4/agent-vault/AgentVaultSessionsPage/route.tsx"),
      route("/$type/", "v4/organization/ProjectsPage/ProjectTypePage/route.tsx"),
      route("/$", "v4/organization/NotPortedPage/projects/route.tsx")
    ]),
    route("/settings", "v4/organization/SettingsPage/route.tsx"),
    route("/audit-logs", "v4/organization/AuditLogsPage/route.tsx"),
    route("/integrations", "v4/organization/IntegrationsPage/route.tsx"),
    route("/access-management", "v4/organization/AccessManagementPage/route.tsx"),
    route("/members/$membershipId", "v4/organization/UserDetailsByIDPage/route.tsx"),
    route("/identities/$identityId", "v4/organization/IdentityDetailsByIDPage/route.tsx"),
    route("/groups/$groupId", "v4/organization/GroupDetailsByIDPage/route.tsx"),
    route("/roles/$roleId", "v4/organization/RoleByIDPage/route.tsx"),
    route(
      "/secret-scanning/data-sources/",
      "v4/secret-scanning/SecretScanningDataSourcesPage/route.tsx"
    ),
    route("/secret-scanning/findings", "v4/secret-scanning/SecretScanningFindingsPage/route.tsx"),
    route("/cert-manager/", "v4/cert-manager/IndexPage/route.tsx"),
    route("/cert-manager/overview", "v4/cert-manager/DashboardPage/route.tsx"),
    route("/cert-manager/inventory", "v4/cert-manager/InventoryPage/route.tsx"),
    route(
      "/cert-manager/certificates/$certificateId",
      "v4/cert-manager/CertificateDetailsByIDPage/route.tsx"
    ),
    route("/pam/accounts/", "v4/pam/PamAccountsPage/route.tsx"),
    route("/pam/access", "v4/redirects/PamAccessRedirect/route.tsx"),
    route("/secret-scanning/", "v4/redirects/SecretScanningIndexRedirect/route.tsx"),
    route("/$", "v4/organization/NotPortedPage/route.tsx")
  ])
]);
