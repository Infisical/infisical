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
    ]),
    route("/signupinvite", "v4/auth/SignUpInvitePage/route.tsx"),
    route("/requestnewinvite", "v4/auth/RequestNewInvitePage/route.tsx"),
    route("/email-not-verified", "v4/auth/EmailNotVerifiedPage/route.tsx"),
    route("/account-recovery", "v4/auth/AccountRecoveryEmailPage/route.tsx"),
    route("/account-recovery-reset", "v4/auth/AccountRecoveryResetPage/route.tsx"),
    route("/admin/signup", "v4/auth/AdminSignUpPage/route.tsx")
  ]),
  layout("v4-public", "v4/secret-sharing/public/route.tsx", [
    route("/shared/secret/$secretId", "v4/secret-sharing/public/ViewSharedSecretPage/route.tsx"),
    route("/shared/new", "v4/secret-sharing/public/ShareSecretPage/route.tsx"),
    route(
      "/secret-request/secret/$secretRequestId",
      "v4/secret-sharing/public/ViewSecretRequestPage/route.tsx"
    )
  ]),
  route("/organizations/onboarding", "v4/auth/OrgOnboardingPage/route.tsx"),
  route("/organizations/none", "v4/auth/NoOrgPage/route.tsx"),
  route("/password-setup", "v4/auth/PasswordSetupPage/route.tsx"),
  route("/mfa-session/$mfaSessionId", "v4/auth/MfaSessionPage/route.tsx"),
  route("/admin", "v4/admin/route.tsx", [
    route("/welcome", "v4/admin/WelcomePage/route.tsx"),
    route("/setup", "v4/admin/SetupPage/route.tsx"),
    layout("v4-admin-shell", "v4/admin/AdminShell/route.tsx", [
      index("v4/admin/GeneralPage/route.tsx"),
      route("/encryption", "v4/admin/EncryptionPage/route.tsx"),
      route("/authentication", "v4/admin/AuthenticationPage/route.tsx"),
      route("/environment", "v4/admin/EnvironmentPage/route.tsx"),
      route("/integrations", "v4/admin/IntegrationsPage/route.tsx"),
      route("/caching", "v4/admin/CachingPage/route.tsx"),
      route("/resources/overview", "v4/admin/ResourceOverviewPage/route.tsx"),
      route("/access-management", "v4/admin/AccessManagementPage/route.tsx")
    ])
  ]),
  route("/personal-settings", "v4/user/route.tsx", [
    index("v4/user/PersonalSettingsPage/route.tsx")
  ]),
  route("/organizations/$orgId", "v4/organization/route.tsx", [
    route("/projects", [
      index("v4/organization/ProjectsPage/route.tsx"),
      route("/kms/kmip-servers/", "v4/kms/KmipServersPage/route.tsx"),
      route("/kms/kmip-servers/$kmipServerId", "v4/kms/KmipServerDetailsByIDPage/route.tsx"),
      route("/kms/$projectId/overview", "v4/kms/OverviewPage/route.tsx"),
      route("/kms/$projectId/kmip", "v4/kms/KmipPage/route.tsx"),
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
      route("/kms/$projectId/audit-logs", "v4/project/AuditLogsPage/kms/route.tsx"),
      route("/kms/$projectId/settings", "v4/kms/SettingsPage/route.tsx"),
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
      route("/secret-management/secret-sharing", "v4/secret-sharing/SecretSharingPage/route.tsx"),
      route("/secret-management/$projectId/audit-logs", "v4/project/AuditLogsPage/route.tsx"),
      route("/secret-management/$projectId/settings", "v4/secret-manager/SettingsPage/route.tsx"),
      route("/agent-vault/$projectId/", "v4/redirects/AgentVaultIndexRedirect/route.tsx"),
      route("/agent-vault/$projectId/sessions", "v4/agent-vault/AgentVaultSessionsPage/route.tsx"),
      route("/agent-vault/$projectId/audit-logs", "v4/project/AuditLogsPage/agent-vault/route.tsx"),
      route(
        "/agent-vault/$projectId/access-management",
        "v4/project/AccessControlPage/agent-vault/route.tsx"
      ),
      route(
        "/agent-vault/$projectId/members/$membershipId",
        "v4/project/MemberDetailsByIDPage/agent-vault/route.tsx"
      ),
      route(
        "/agent-vault/$projectId/identities/$identityId",
        "v4/project/IdentityDetailsByIDPage/agent-vault/route.tsx"
      ),
      route(
        "/agent-vault/$projectId/groups/$groupId",
        "v4/project/GroupDetailsByIDPage/agent-vault/route.tsx"
      ),
      route(
        "/agent-vault/$projectId/roles/$roleSlug",
        "v4/project/RoleDetailsBySlugPage/agent-vault/route.tsx"
      ),
      route("/agent-vault/$projectId/settings", "v4/agent-vault/AgentVaultSettingsPage/route.tsx"),
      route("/$type/", "v4/organization/ProjectsPage/ProjectTypePage/route.tsx"),
      route("/$", "v4/organization/NotPortedPage/projects/route.tsx")
    ]),
    route("/settings", "v4/organization/SettingsPage/route.tsx"),
    route("/billing", "v4/organization/BillingPage/route.tsx"),
    route("/sso", "v4/organization/SsoPage/route.tsx"),
    route("/oauth-applications", "v4/organization/OauthApplicationsPage/route.tsx"),
    route("/audit-logs", "v4/organization/AuditLogsPage/route.tsx"),
    route("/integrations", "v4/organization/IntegrationsPage/route.tsx"),
    route(
      "/app-connections/$appConnection/callback",
      "v4/organization/AppConnectionCallbackPage/route.tsx"
    ),
    route("/networking/", "v4/organization/NetworkingPage/route.tsx"),
    route("/networking/gateways/$gatewayId", "v4/organization/GatewayDetailsByIDPage/route.tsx"),
    route("/networking/relays/$relayId", "v4/organization/RelayDetailsByIDPage/route.tsx"),
    route("/access-management", "v4/organization/AccessManagementPage/route.tsx"),
    route("/members/$membershipId", "v4/organization/UserDetailsByIDPage/route.tsx"),
    route("/identities/$identityId", "v4/organization/IdentityDetailsByIDPage/route.tsx"),
    route("/groups/$groupId", "v4/organization/GroupDetailsByIDPage/route.tsx"),
    route("/roles/$roleId", "v4/organization/RoleByIDPage/route.tsx"),
    route(
      "/secret-scanning/data-sources/",
      "v4/secret-scanning/SecretScanningDataSourcesPage/route.tsx"
    ),
    route(
      "/secret-scanning/data-sources/$type/$dataSourceId",
      "v4/secret-scanning/SecretScanningDataSourceByIdPage/route.tsx"
    ),
    route("/secret-scanning/findings", "v4/secret-scanning/SecretScanningFindingsPage/route.tsx"),
    route("/cert-manager/", "v4/cert-manager/IndexPage/route.tsx"),
    route("/cert-manager/overview", "v4/cert-manager/DashboardPage/route.tsx"),
    route("/cert-manager/inventory", "v4/cert-manager/InventoryPage/route.tsx"),
    route(
      "/cert-manager/certificates/$certificateId",
      "v4/cert-manager/CertificateDetailsByIDPage/route.tsx"
    ),
    route("/cert-manager/requests", "v4/cert-manager/RequestsPage/route.tsx"),
    route("/cert-manager/approvals/", "v4/cert-manager/ApprovalsPage/route.tsx"),
    route(
      "/cert-manager/approvals/$approvalRequestId",
      "v4/cert-manager/ApprovalRequestDetailPage/route.tsx"
    ),
    route("/cert-manager/audit-logs", "v4/project/AuditLogsPage/cert-manager/route.tsx"),
    route("/cert-manager/settings", "v4/cert-manager/SettingsPage/route.tsx"),
    route("/pam/accounts/", "v4/pam/PamAccountsPage/route.tsx"),
    route("/pam/approval-requests", "v4/pam/PamApprovalRequestsPage/route.tsx"),
    route("/pam/audit-logs", "v4/project/AuditLogsPage/pam/route.tsx"),
    route("/pam/access", "v4/redirects/PamAccessRedirect/route.tsx"),
    route("/cert-manager/access-management", "v4/project/AccessControlPage/cert-manager/route.tsx"),
    route(
      "/cert-manager/members/$membershipId",
      "v4/project/MemberDetailsByIDPage/cert-manager/route.tsx"
    ),
    route(
      "/cert-manager/identities/$identityId",
      "v4/project/IdentityDetailsByIDPage/cert-manager/route.tsx"
    ),
    route(
      "/cert-manager/groups/$groupId",
      "v4/project/GroupDetailsByIDPage/cert-manager/route.tsx"
    ),
    route(
      "/cert-manager/roles/$roleSlug",
      "v4/project/RoleDetailsBySlugPage/cert-manager/route.tsx"
    ),
    route(
      "/secret-scanning/access-management",
      "v4/project/AccessControlPage/secret-scanning/route.tsx"
    ),
    route(
      "/secret-scanning/members/$membershipId",
      "v4/project/MemberDetailsByIDPage/secret-scanning/route.tsx"
    ),
    route(
      "/secret-scanning/identities/$identityId",
      "v4/project/IdentityDetailsByIDPage/secret-scanning/route.tsx"
    ),
    route(
      "/secret-scanning/groups/$groupId",
      "v4/project/GroupDetailsByIDPage/secret-scanning/route.tsx"
    ),
    route(
      "/secret-scanning/roles/$roleSlug",
      "v4/project/RoleDetailsBySlugPage/secret-scanning/route.tsx"
    ),
    route("/pam/access-management", "v4/project/AccessControlPage/pam/route.tsx"),
    route("/pam/members/$membershipId", "v4/project/MemberDetailsByIDPage/pam/route.tsx"),
    route("/pam/identities/$identityId", "v4/project/IdentityDetailsByIDPage/pam/route.tsx"),
    route("/pam/groups/$groupId", "v4/project/GroupDetailsByIDPage/pam/route.tsx"),
    route("/pam/roles/$roleSlug", "v4/project/RoleDetailsBySlugPage/pam/route.tsx"),
    route("/secret-scanning/", "v4/redirects/SecretScanningIndexRedirect/route.tsx"),
    route("/$", "v4/organization/NotPortedPage/route.tsx")
  ])
]);
