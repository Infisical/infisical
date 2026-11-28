// The rule that approved the request and what it checked, so an admin can see why access was granted
export type TAutoApprovalAuditMetadata = {
  ruleId: string | null;
  ruleName?: string;
  linkedRecords: { label: string; value: string }[];
  conditions: string[];
};

export type TAuditLogTrustedIp = {
  ipAddress: string;
  type: "ipv4" | "ipv6";
  prefix: number;
};

export type TAuditLogGatewayTransport = "direct" | "relay";

export type TAuditLogCertificateSource = "issued" | "discovered" | "imported";

export type TAuditLogPkiKeystorePasswordChange = "set" | "cleared";

export type TAuditLogScepChallengeType = "static" | "dynamic" | "microsoft-intune";

export type TAuditLogScepEnrollmentStatus = "success" | "pending" | "failure";

export type TAuditLogResourceAuthMethodType = "aws" | "gcp" | "kubernetes" | "token" | "identity";

export type TAuditLogSecretRotation =
  | "postgres-credentials"
  | "mssql-credentials"
  | "mysql-credentials"
  | "oracledb-credentials"
  | "auth0-client-secret"
  | "azure-client-secret"
  | "aws-iam-user-secret"
  | "ldap-password"
  | "okta-client-secret"
  | "redis-credentials"
  | "mongodb-credentials"
  | "databricks-service-principal-secret"
  | "unix-linux-local-account"
  | "dbt-service-token"
  | "windows-local-account"
  | "open-router-api-key"
  | "litellm-api-key"
  | "openai-service-account"
  | "hp-ilo-local-account"
  | "supabase-api-key"
  | "salesforce-oauth-credentials"
  | "datadog-application-key-secret"
  | "datadog-api-key"
  | "convex-access-key"
  | "fireworks-api-key"
  | "snowflake-user-key-pair"
  | "cloudflare-api-token"
  | "cloudflare-r2-access-key"
  | "stripe-api-key"
  | "gcp-service-account-key"
  | "clickhouse-credentials";

export type TAuditLogSecretRotationStatus = "success" | "failed";

export type TAuditLogSecretScanningDataSource = "github" | "bitbucket" | "gitlab";

export type TAuditLogSecretScanningScanStatus = "completed" | "failed" | "queued" | "scanning";

export type TAuditLogSecretScanningScanType = "historical" | "realtime";

export type TAuditLogAppConnection =
  | "github"
  | "github-radar"
  | "aws"
  | "databricks"
  | "gcp"
  | "azure-key-vault"
  | "azure-app-configuration"
  | "azure-client-secrets"
  | "azure-devops"
  | "azure-adcs"
  | "adcs"
  | "azure-dns"
  | "humanitec"
  | "terraform-cloud"
  | "vercel"
  | "postgres"
  | "mssql"
  | "mysql"
  | "camunda"
  | "windmill"
  | "auth0"
  | "hashicorp-vault"
  | "ldap"
  | "teamcity"
  | "oci"
  | "oracledb"
  | "1password"
  | "heroku"
  | "render"
  | "flyio"
  | "trigger-dev"
  | "gitlab"
  | "cloudflare"
  | "dns-made-easy"
  | "ultradns"
  | "zabbix"
  | "railway"
  | "bitbucket"
  | "checkly"
  | "supabase"
  | "digital-ocean"
  | "netlify"
  | "okta"
  | "redis"
  | "mongodb"
  | "laravel-forge"
  | "chef"
  | "northflank"
  | "octopus-deploy"
  | "ssh"
  | "dbt"
  | "smb"
  | "winrm"
  | "open-router"
  | "openai"
  | "circleci"
  | "azure-entra-id"
  | "venafi"
  | "venafi-tpp"
  | "external-infisical"
  | "doppler"
  | "netscaler"
  | "palo-alto-networks"
  | "anthropic"
  | "ovh"
  | "devin"
  | "ona"
  | "digicert"
  | "travis-ci"
  | "salesforce"
  | "snowflake"
  | "datadog"
  | "f5-big-ip"
  | "godaddy"
  | "convex"
  | "rundeck"
  | "portainer"
  | "hasura-cloud"
  | "qovery"
  | "cloud-66"
  | "litellm"
  | "fireworks"
  | "kemp-loadmaster"
  | "imperva"
  | "microsoft-intune"
  | "nutanix-prism-central"
  | "powerdns"
  | "spacelift"
  | "daytona"
  | "stripe"
  | "keeper"
  | "hpe-ilo"
  | "servicenow"
  | "s3-compatible"
  | "jira"
  | "clickhouse"
  | "incident-io"
  | "jenkins"
  | "coolify"
  | "rfc2136";

export type TAuditLogCaCrlRegenerationTrigger =
  | "manual"
  | "revocation"
  | "ca-renewal"
  | "ca-certificate-generation"
  | "ca-certificate-import"
  | "validity-change"
  | "scheduled";

export type TAuditLogCaStatus = "active" | "disabled" | "pending-certificate";

export type TAuditLogCertificateIssuanceOperation = "issue" | "sign" | "order" | "renew";

export type TAuditLogEnrollmentType = "api" | "est" | "acme" | "scep" | "microsoft-autoenrollment";

export type TAuditLogCertificateRequestStatus =
  | "pending_approval"
  | "pending"
  | "pending_validation"
  | "issued"
  | "failed"
  | "rejected";

export type TAuditLogCertificateRenewalKeySource = "new" | "reuse" | "csr";

export type TAuditLogCertExtendedKeyUsage =
  | "clientAuth"
  | "serverAuth"
  | "codeSigning"
  | "emailProtection"
  | "timeStamping"
  | "ocspSigning"
  | "smartCardLogon"
  | "anyExtendedKeyUsage";

export type TAuditLogCertificateRevocationSource = "microsoft-intune" | "same-certificate";

export type TAuditLogCertKeyAlgorithm =
  | "RSA_2048"
  | "RSA_3072"
  | "RSA_4096"
  | "EC_prime256v1"
  | "EC_secp384r1"
  | "EC_secp521r1"
  | "ML-DSA-44"
  | "ML-DSA-65"
  | "ML-DSA-87"
  | "SLH-DSA-SHA2-128f"
  | "SLH-DSA-SHA2-128s"
  | "SLH-DSA-SHA2-192f"
  | "SLH-DSA-SHA2-192s"
  | "SLH-DSA-SHA2-256f"
  | "SLH-DSA-SHA2-256s"
  | "SLH-DSA-SHAKE-128f"
  | "SLH-DSA-SHAKE-128s"
  | "SLH-DSA-SHAKE-192f"
  | "SLH-DSA-SHAKE-192s"
  | "SLH-DSA-SHAKE-256f"
  | "SLH-DSA-SHAKE-256s";

export type TAuditLogCertKeyUsage =
  | "digitalSignature"
  | "keyEncipherment"
  | "nonRepudiation"
  | "dataEncipherment"
  | "keyAgreement"
  | "keyCertSign"
  | "cRLSign"
  | "encipherOnly"
  | "decipherOnly";

export type TAuditLogCertStatus = "active" | "expired" | "revoked" | "renewed" | "deleted";

export type TAuditLogCrlReason =
  | "UNSPECIFIED"
  | "KEY_COMPROMISE"
  | "CA_COMPROMISE"
  | "AFFILIATION_CHANGED"
  | "SUPERSEDED"
  | "CESSATION_OF_OPERATION"
  | "CERTIFICATE_HOLD"
  | "PRIVILEGE_WITHDRAWN"
  | "A_A_COMPROMISE";

export type TAuditLogExternalMigrationImportStatus = "imported" | "approval-required";

export type TAuditLogObjectStorageType = "default" | "external";

export type TAuditLogOrgAccessRemovalCause =
  | "removed-from-group"
  | "group-unlinked-from-org"
  | "group-deleted"
  | "removed-from-org";

export type TAuditLogPkiAlertEventType = "expiration" | "renewal" | "issuance" | "revocation";

export type TAuditLogPkiItemType = "certificate" | "ca";

export type TAuditLogSecretSync =
  | "aws-parameter-store"
  | "aws-secrets-manager"
  | "github"
  | "gcp-secret-manager"
  | "azure-key-vault"
  | "azure-app-configuration"
  | "azure-devops"
  | "databricks"
  | "humanitec"
  | "terraform-cloud"
  | "camunda"
  | "vercel"
  | "windmill"
  | "hashicorp-vault"
  | "teamcity"
  | "oci-vault"
  | "1password"
  | "heroku"
  | "render"
  | "flyio"
  | "trigger-dev"
  | "gitlab"
  | "cloudflare-pages"
  | "cloudflare-workers"
  | "cloudflare-secrets-store"
  | "convex"
  | "supabase"
  | "zabbix"
  | "railway"
  | "checkly"
  | "digital-ocean-app-platform"
  | "netlify"
  | "northflank"
  | "bitbucket"
  | "laravel-forge"
  | "chef"
  | "octopus-deploy"
  | "circleci"
  | "azure-entra-id-scim"
  | "external-infisical"
  | "ovh"
  | "devin"
  | "ona"
  | "travis-ci"
  | "snowflake"
  | "rundeck"
  | "portainer"
  | "hasura-cloud"
  | "qovery"
  | "cloud-66"
  | "spacelift"
  | "daytona"
  | "keeper-password-manager"
  | "jenkins"
  | "coolify";

export type TAuditLogSecretSyncImportBehavior = "prioritize-source" | "prioritize-destination";

export type TAuditLogCertKeySource = "infisical" | "hsm" | "aws-kms";

export type TAuditLogWorkflowIntegration = "slack" | "microsoft-teams";

export type TAuditLogKmipPermission =
  | "create"
  | "locate"
  | "check"
  | "get"
  | "get-attributes"
  | "activate"
  | "revoke"
  | "destroy"
  | "register";

export type TAuditLogAcmeChallengeType = "http-01" | "dns-01" | "tls-alpn-01";

export type TAuditLogAcmeIdentifierType = "dns" | "ip";

export type TAuditLogApprovalStatus = "pending" | "approved" | "rejected";

export type TAuditLogSettableAuthMethod = "aws" | "gcp" | "kubernetes" | "token";

export type TAuditLogHoneyTokenType = "aws";

export type TAuditLogHoneyTokenManagedBy = "instance" | "organization";

export type TAuditLogSecretScanningFindingStatus = "resolved" | "unresolved" | "false-positive" | "ignore";

export type TAuditLogMicrosoftAutoenrollmentKeytabSource = "uploaded" | "reused" | "unchanged";

export type TAuditLogMicrosoftAutoenrollmentIssuanceResult = "issued" | "pending";

export type TAuditLogMicrosoftAutoenrollmentFailureReason =
  | "not-in-allowed-group"
  | "computer-not-found"
  | "computer-disabled"
  | "no-dns-host-name"
  | "directory-unreachable"
  | "directory-lookup-failed"
  | "renewal-refused"
  | "channel-binding-unverifiable"
  | "profile-misconfigured";
