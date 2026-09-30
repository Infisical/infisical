export const BillingProduct = {
  SecretsManagement: "secrets_management",
  CertificateManagement: "cert_management",
  Pam: "pam"
} as const;

export const BillingPlan = {
  Pro: "pro",
  Advanced: "advanced",
  Enterprise: "enterprise"
} as const;

export const UpgradeFeature = {
  DynamicSecrets: "dynamic-secrets",
  SecretRotations: "secret-rotations",
  HoneyTokens: "honey-tokens",
  SecretsBrokering: "secrets-brokering",
  PointInTimeRecovery: "point-in-time-recovery",
  FolderAccessControls: "folder-access-controls",
  SecretImportReplication: "secret-import-replication",
  SecretAccessInsights: "secret-access-insights",
  EnterpriseSecretSyncs: "enterprise-secret-syncs",
  SecretApprovalPolicies: "secret-approval-policies",
  SecretAccessRequests: "secret-access-requests",
  CrossProjectSecretSharing: "cross-project-secret-sharing",
  EnvironmentLimit: "environment-limit",
  CertificateManagement: "certificate-management",
  CertificateSyncs: "certificate-syncs",
  CertificateApprovalPolicies: "certificate-approval-policies",
  CertificateRevocationLists: "certificate-revocation-lists",
  CodeSigning: "code-signing",
  CertificateDiscovery: "certificate-discovery",
  CertificateEnrollment: "certificate-enrollment",
  CertificateAuthorities: "certificate-authorities",
  ExternalCertificateAuthorities: "external-certificate-authorities",
  PostQuantumCertificates: "post-quantum-certificates",
  CertificateIssuanceLimits: "certificate-issuance-limits",
  Pam: "pam",
  PamAccountLimit: "pam-account-limit",
  PamSlackNotifications: "pam-slack-notifications",
  EnterprisePamAccounts: "enterprise-pam-accounts"
} as const;

export const UpgradeContinuation = {
  CreateDynamicSecret: "create-dynamic-secret",
  CreateSecretRotation: "create-secret-rotation",
  CreateHoneyToken: "create-honey-token",
  CreateProxiedService: "create-proxied-service",
  ViewCommitHistory: "view-commit-history",
  ManageFolderAccess: "manage-folder-access",
  CreateSecretImport: "create-secret-import",
  ViewSecretAccess: "view-secret-access",
  CreateEnterpriseSecretSync: "create-enterprise-secret-sync",
  CreateSecretApprovalPolicy: "create-secret-approval-policy",
  RequestSecretAccess: "request-secret-access",
  ShareSecretsAcrossProjects: "share-secrets-across-projects",
  CreateEnvironment: "create-environment",
  OpenCertificateManagement: "open-certificate-management",
  CreateCertificateSync: "create-certificate-sync",
  CreateCertificateApprovalPolicy: "create-certificate-approval-policy",
  AddCertificateRevocationListUrl: "add-certificate-revocation-list-url",
  CreateCodeSigner: "create-code-signer",
  CreateCertificateDiscovery: "create-certificate-discovery",
  ManageCertificateEnrollment: "manage-certificate-enrollment",
  CreateCertificateAuthority: "create-certificate-authority",
  ConfigureExternalCertificateAuthority: "configure-external-certificate-authority",
  SelectPostQuantumAlgorithm: "select-post-quantum-algorithm",
  ConfigureCertificateNames: "configure-certificate-names",
  OpenPam: "open-pam",
  CreatePamAccount: "create-pam-account",
  ConfigurePamSlackNotifications: "configure-pam-slack-notifications",
  CreateEnterprisePamAccount: "create-enterprise-pam-account"
} as const;

export type UpgradeIntent = {
  featureKey: (typeof UpgradeFeature)[keyof typeof UpgradeFeature];
  productKey: (typeof BillingProduct)[keyof typeof BillingProduct];
  planKey: (typeof BillingPlan)[keyof typeof BillingPlan];
  continuation: (typeof UpgradeContinuation)[keyof typeof UpgradeContinuation];
  upgradeLabel?: string;
  title: string;
  description: string;
};

export const DynamicSecretsUpgradeIntent = {
  featureKey: UpgradeFeature.DynamicSecrets,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Advanced,
  continuation: UpgradeContinuation.CreateDynamicSecret,
  upgradeLabel: "Unlock Dynamic Secrets",
  title: "Add Dynamic Secrets",
  description:
    "Dynamic secrets are included with Secrets Management Advanced. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const EnvironmentLimitUpgradeIntent = {
  featureKey: UpgradeFeature.EnvironmentLimit,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateEnvironment,
  upgradeLabel: "Unlock More Environments",
  title: "Create Environment",
  description: "Compare Secrets Management plans to increase your project's environment allowance."
} satisfies UpgradeIntent;

export const SecretRotationsUpgradeIntent = {
  featureKey: UpgradeFeature.SecretRotations,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateSecretRotation,
  upgradeLabel: "Unlock Secret Rotations",
  title: "Add Secret Rotation",
  description:
    "Secret rotations are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const HoneyTokensUpgradeIntent = {
  featureKey: UpgradeFeature.HoneyTokens,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateHoneyToken,
  upgradeLabel: "Unlock Honey Tokens",
  title: "Add Honey Token",
  description:
    "Honey tokens are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretsBrokeringUpgradeIntent = {
  featureKey: UpgradeFeature.SecretsBrokering,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateProxiedService,
  upgradeLabel: "Unlock Secrets Brokering",
  title: "Add Proxied Service",
  description:
    "Secrets brokering is included with Secrets Management Enterprise. Review the plan to continue."
} satisfies UpgradeIntent;

export const PointInTimeRecoveryUpgradeIntent = {
  featureKey: UpgradeFeature.PointInTimeRecovery,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ViewCommitHistory,
  upgradeLabel: "Unlock Point-in-Time Recovery",
  title: "View Commit History",
  description:
    "Point-in-time recovery is included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const FolderAccessControlsUpgradeIntent = {
  featureKey: UpgradeFeature.FolderAccessControls,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ManageFolderAccess,
  upgradeLabel: "Unlock Folder Access Controls",
  title: "Manage Folder Access",
  description:
    "Folder-level access controls are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretImportReplicationUpgradeIntent = {
  featureKey: UpgradeFeature.SecretImportReplication,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateSecretImport,
  upgradeLabel: "Unlock Secret Import Replication",
  title: "Replicate Secret Import",
  description:
    "Secret import replication is included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const SecretAccessInsightsUpgradeIntent = {
  featureKey: UpgradeFeature.SecretAccessInsights,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ViewSecretAccess,
  upgradeLabel: "Unlock Secret Access Insights",
  title: "View Secret Access",
  description:
    "Secret access insights are included with Secrets Management Pro. Review the plan or start a free trial to continue."
} satisfies UpgradeIntent;

export const EnterpriseSecretSyncsUpgradeIntent = {
  featureKey: UpgradeFeature.EnterpriseSecretSyncs,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateEnterpriseSecretSync,
  upgradeLabel: "Unlock Enterprise Secret Syncs",
  title: "Choose Enterprise Secret Sync",
  description:
    "Enterprise Secret Sync destinations are included with Secrets Management Enterprise. Review the plan to continue."
} satisfies UpgradeIntent;

export const SecretApprovalPoliciesUpgradeIntent = {
  featureKey: UpgradeFeature.SecretApprovalPolicies,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateSecretApprovalPolicy,
  upgradeLabel: "Unlock Approval Policies",
  title: "Add Approval Policy",
  description:
    "Approval policies are included with Secrets Management Pro. Review the plans to continue."
} satisfies UpgradeIntent;

export const SecretAccessRequestsUpgradeIntent = {
  featureKey: UpgradeFeature.SecretAccessRequests,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.RequestSecretAccess,
  upgradeLabel: "Unlock Access Requests",
  title: "Request Secret Access",
  description:
    "Access requests are included with Secrets Management Pro. Review the plans to continue."
} satisfies UpgradeIntent;

export const CrossProjectSecretSharingUpgradeIntent = {
  featureKey: UpgradeFeature.CrossProjectSecretSharing,
  productKey: BillingProduct.SecretsManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ShareSecretsAcrossProjects,
  upgradeLabel: "Unlock Cross-Project Secret Sharing",
  title: "Share Secrets Across Projects",
  description:
    "Cross-project secret sharing is included with Secrets Management Pro. Review the plans to continue."
} satisfies UpgradeIntent;

export const CertificateManagementUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateManagement,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.OpenCertificateManagement,
  upgradeLabel: "Unlock Certificate Management",
  title: "Open Certificate Management",
  description:
    "Certificate Management is included with the Pro plan. Review the plans or start a free trial to continue."
} satisfies UpgradeIntent;

export const CertificateSyncsUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateSyncs,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateCertificateSync,
  upgradeLabel: "Unlock Certificate Syncs",
  title: "Add Certificate Sync",
  description:
    "Certificate Syncs are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CertificateApprovalPoliciesUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateApprovalPolicies,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateCertificateApprovalPolicy,
  upgradeLabel: "Unlock Approval Policies",
  title: "Create Approval Policy",
  description:
    "Certificate approval policies are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CertificateRevocationListsUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateRevocationLists,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.AddCertificateRevocationListUrl,
  upgradeLabel: "Unlock CRL Distribution Points",
  title: "Add CRL Distribution Point",
  description:
    "Custom CRL distribution points are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CodeSigningUpgradeIntent = {
  featureKey: UpgradeFeature.CodeSigning,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateCodeSigner,
  upgradeLabel: "Unlock Code Signing",
  title: "Create Code Signer",
  description: "Code signing is included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CertificateDiscoveryUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateDiscovery,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateCertificateDiscovery,
  upgradeLabel: "Unlock Certificate Discovery",
  title: "Add Discovery Job",
  description:
    "Certificate discovery is included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CertificateEnrollmentUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateEnrollment,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.ManageCertificateEnrollment,
  upgradeLabel: "Unlock Certificate Enrollment",
  title: "Manage Certificate Enrollment",
  description:
    "Advanced certificate enrollment methods are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CertificateAuthoritiesUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateAuthorities,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreateCertificateAuthority,
  upgradeLabel: "Unlock More Certificate Authorities",
  title: "Create Certificate Authority",
  description:
    "Compare Certificate Management plans to increase your certificate authority allowance."
} satisfies UpgradeIntent;

export const ExternalCertificateAuthoritiesUpgradeIntent = {
  featureKey: UpgradeFeature.ExternalCertificateAuthorities,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.ConfigureExternalCertificateAuthority,
  upgradeLabel: "Unlock External Certificate Authorities",
  title: "Configure External Certificate Authority",
  description:
    "External certificate authority integrations are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const PostQuantumCertificatesUpgradeIntent = {
  featureKey: UpgradeFeature.PostQuantumCertificates,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.SelectPostQuantumAlgorithm,
  upgradeLabel: "Unlock Post-Quantum Certificates",
  title: "Select Post-Quantum Algorithm",
  description:
    "Post-quantum certificate algorithms are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const CertificateIssuanceLimitsUpgradeIntent = {
  featureKey: UpgradeFeature.CertificateIssuanceLimits,
  productKey: BillingProduct.CertificateManagement,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.ConfigureCertificateNames,
  upgradeLabel: "Unlock Certificate Issuance",
  title: "Configure Certificate Names",
  description:
    "Compare Certificate Management plans to increase certificate and subject alternative name allowances."
} satisfies UpgradeIntent;

export const PamUpgradeIntent = {
  featureKey: UpgradeFeature.Pam,
  productKey: BillingProduct.Pam,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.OpenPam,
  upgradeLabel: "Unlock Privileged Access Management",
  title: "Open Privileged Access Management",
  description:
    "Privileged Access Management is included with the Pro plan. Review the plans or start a free trial to continue."
} satisfies UpgradeIntent;

export const PamAccountLimitUpgradeIntent = {
  featureKey: UpgradeFeature.PamAccountLimit,
  productKey: BillingProduct.Pam,
  planKey: BillingPlan.Pro,
  continuation: UpgradeContinuation.CreatePamAccount,
  upgradeLabel: "Unlock More PAM Accounts",
  title: "Add PAM Account",
  description: "Compare PAM plans to increase your organization-wide account allowance."
} satisfies UpgradeIntent;

export const PamSlackNotificationsUpgradeIntent = {
  featureKey: UpgradeFeature.PamSlackNotifications,
  productKey: BillingProduct.Pam,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.ConfigurePamSlackNotifications,
  upgradeLabel: "Unlock Slack Notifications",
  title: "Configure Slack Notifications",
  description:
    "PAM Slack notifications are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const EnterprisePamAccountsUpgradeIntent = {
  featureKey: UpgradeFeature.EnterprisePamAccounts,
  productKey: BillingProduct.Pam,
  planKey: BillingPlan.Enterprise,
  continuation: UpgradeContinuation.CreateEnterprisePamAccount,
  upgradeLabel: "Unlock Enterprise Accounts",
  title: "Add Enterprise Account",
  description:
    "Enterprise account types are included with the Enterprise plan. Review the plan to continue."
} satisfies UpgradeIntent;

export const buildUpgradeReturnPath = (intent: UpgradeIntent, location: Location) => {
  const search = new URLSearchParams(location.search);
  search.set("upgradeContinuation", intent.continuation);
  return `${location.pathname}?${search.toString()}${location.hash}`;
};

export const getSafeUpgradeReturnPath = (returnPath: string | null, origin: string) => {
  if (!returnPath || returnPath.length > 2048 || !returnPath.startsWith("/")) {
    return null;
  }

  const hasUnsafeCharacter = [...returnPath].some((character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint <= 31 || codePoint === 127 || character === "\\";
  });
  if (hasUnsafeCharacter) {
    return null;
  }

  try {
    return new URL(returnPath, origin).origin === new URL(origin).origin ? returnPath : null;
  } catch {
    return null;
  }
};
