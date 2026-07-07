package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// DBReadReplica represents a single parsed DB read replica from DB_READ_REPLICAS JSON.
type DBReadReplica struct {
	DBConnectionURI string `json:"DB_CONNECTION_URI"`
	DBRootCert      string `json:"DB_ROOT_CERT,omitempty"`
}

// RedisHostPort represents a parsed host:port pair for Redis Sentinel/Cluster/Replica nodes.
type RedisHostPort struct {
	Host string
	Port int
}

type NodeEnv string

const (
	NodeEnvDevelopment NodeEnv = "development"
	NodeEnvTest        NodeEnv = "test"
	NodeEnvProduction  NodeEnv = "production"
)

type Config struct {
	// Server
	InfisicalPlatformVersion               string
	KubernetesAutoFetchServiceAccountToken bool
	NodeEnv                                NodeEnv
	Port                                   int
	Host                                   string
	StandaloneMode                         bool
	InfisicalCloud                         bool
	MaintenanceMode                        bool
	DisableSecretScanning                  bool

	// Logging
	LogLevel string

	// Database
	DBConnectionURI          string
	DBRootCert               string
	DBHost                   string
	DBPort                   string
	DBUser                   string
	DBPassword               string
	DBName                   string
	DBReadReplicasRaw        string
	AuditLogsDBConnectionURI string
	AuditLogsDBRootCert      string

	// ClickHouse
	ClickhouseURL                    string
	ClickhouseAuditLogEngine         string
	ClickhouseAuditLogTableName      string
	ClickhouseAuditLogEnabled        bool
	ClickhouseAuditLogQueryEnabled   bool
	ClickhouseAuditLogInsertSettings string

	// Redis
	RedisURL                                string
	RedisUsername                           string
	RedisPassword                           string
	RedisSentinelHosts                      string
	RedisSentinelMasterName                 string
	RedisSentinelEnableTLS                  bool
	RedisSentinelUsername                   string
	RedisSentinelPassword                   string
	RedisClusterHosts                       string
	RedisClusterEnableTLS                   bool
	RedisClusterAWSElastiCacheDNSLookupMode bool
	RedisReadReplicas                       string

	// Encryption
	EncryptionKey     string
	RootEncryptionKey string
	FipsEnabled       bool

	// Auth
	AuthSecret              string
	CookieSecretSignKey     string
	JWTAuthLifetime         string
	JWTSignupLifetime       string
	JWTRefreshLifetime      string
	JWTInviteLifetime       string
	JWTMfaLifetime          string
	JWTProviderAuthLifetime string

	// Site
	SiteURL      string
	HTTPSEnabled bool

	// Telemetry
	TelemetryEnabled bool

	// PostHog
	PosthogHost          string
	PosthogProjectAPIKey string

	// OpenTelemetry
	OTELTelemetryCollectionEnabled bool
	OTELExportOTLPEndpoint         string
	OTELOTLPPushInterval           int
	OTELCollectorBasicAuthUsername string
	OTELCollectorBasicAuthPassword string
	OTELExportType                 string

	// SMTP
	SMTPHost                  string
	SMTPPort                  int
	SMTPUsername              string
	SMTPPassword              string
	SMTPFromAddress           string
	SMTPFromName              string
	SMTPIgnoreTLS             bool
	SMTPRequireTLS            bool
	SMTPTLSRejectUnauthorized bool
	SMTPCustomCACert          string

	// Crypto
	SaltRounds int

	// Queue
	QueueWorkersEnabled bool
	QueueWorkerProfile  string
	UsePGQueue          bool
	ShouldInitPGQueue   bool

	// SSO - Google
	ClientIDGoogleLogin     string
	ClientSecretGoogleLogin string

	// SSO - GitHub
	ClientIDGithubLogin     string
	ClientSecretGithubLogin string

	// SSO - GitLab
	ClientIDGitlabLogin     string
	ClientSecretGitlabLogin string
	ClientGitlabLoginURL    string
	DefaultSAMLOrgSlug      string

	// Integration - Heroku
	ClientIDHeroku     string
	ClientSecretHeroku string

	// Integration - Vercel
	ClientIDVercel     string
	ClientSecretVercel string
	ClientSlugVercel   string

	// Integration - Netlify
	ClientIDNetlify     string
	ClientSecretNetlify string

	// Integration - Bitbucket
	ClientIDBitbucket     string
	ClientSecretBitbucket string

	// Integration - GCP Secret Manager
	ClientIDGCPSecretManager     string
	ClientSecretGCPSecretManager string

	// Integration - GitHub OAuth
	ClientIDGithub     string
	ClientSecretGithub string

	// Integration - GitHub App
	ClientIDGithubApp         string
	ClientSecretGithubApp     string
	ClientPrivateKeyGithubApp string
	ClientAppIDGithubApp      int
	ClientSlugGithubApp       string

	// Integration - Azure
	ClientIDAzure     string
	ClientSecretAzure string

	// Integration - AWS
	ClientIDAWSIntegration     string
	ClientSecretAWSIntegration string

	// Integration - GitLab
	ClientIDGitlab     string
	ClientSecretGitlab string
	URLGitlabURL       string

	// Secret Scanning
	SecretScanningWebhookProxy  string
	SecretScanningWebhookSecret string
	SecretScanningGitAppID      string
	SecretScanningPrivateKey    string
	SecretScanningOrgWhitelist  string
	SecretScanningGitAppSlug    string

	// Cross-project secret sharing
	CrossProjectSecretSharing string

	// License
	LicenseServerURL  string
	LicenseServerKey  string
	LicenseKey        string
	LicenseKeyOffline string

	// Captcha
	CaptchaSecret  string
	CaptchaSiteKey string

	// Misc
	InitialOrganizationName   string
	MaxLeaseLimit             int
	IntercomID                string
	CDNHost                   string
	LoopsAPIKey               string
	GithubAPIToken            string
	PylonAPIKey               string
	DisableAuditLogGeneration bool
	DisableAuditLogStorage    bool
	GenerateSanitizedSchema   bool
	SanitizedSchemaRole       string

	// TLS / Certificates
	SSLClientCertificateHeaderKey                 string
	IdentityTLSCertAuthClientCertificateHeaderKey string

	// Slack
	WorkflowSlackClientID     string
	WorkflowSlackClientSecret string

	// MSSQL
	EnableMSSQLSecretRotationEncrypt bool

	// Secret Detection
	ParamsFolderSecretDetectionPaths   string
	ParamsFolderSecretDetectionEntropy float64

	// Secondary Instance
	InfisicalPrimaryInstanceURL string

	// HSM
	HSMLibPath  string
	HSMPin      string
	HSMKeyLabel string
	HSMSlot     int

	// Gateway
	GatewayInfisicalStaticIPAddress string
	GatewayRelayAddress             string
	GatewayRelayRealm               string
	GatewayRelayAuthSecret          string
	RelayAuthSecret                 string

	// Dynamic Secrets
	DynamicSecretAllowInternalIP    bool
	DynamicSecretAWSAccessKeyID     string
	DynamicSecretAWSSecretAccessKey string

	// PAM AWS
	PAMAWSAccessKeyID     string
	PAMAWSSecretAccessKey string

	// App Connections
	AllowInternalIPConnections bool

	// App Connection - AWS
	InfAppConnectionAWSAccessKeyID     string
	InfAppConnectionAWSSecretAccessKey string

	// App Connection - GitHub OAuth
	InfAppConnectionGithubOAuthClientID     string
	InfAppConnectionGithubOAuthClientSecret string

	// App Connection - GitHub App
	InfAppConnectionGithubAppClientID     string
	InfAppConnectionGithubAppClientSecret string
	InfAppConnectionGithubAppPrivateKey   string
	InfAppConnectionGithubAppSlug         string
	InfAppConnectionGithubAppID           string

	// App Connection - GitHub Radar App
	InfAppConnectionGithubRadarAppClientID      string
	InfAppConnectionGithubRadarAppClientSecret  string
	InfAppConnectionGithubRadarAppPrivateKey    string
	InfAppConnectionGithubRadarAppSlug          string
	InfAppConnectionGithubRadarAppID            string
	InfAppConnectionGithubRadarAppWebhookSecret string

	// App Connection - GitLab OAuth
	InfAppConnectionGitlabOAuthClientID     string
	InfAppConnectionGitlabOAuthClientSecret string

	// App Connection - GCP
	InfAppConnectionGCPServiceAccountCredential string

	// App Connection - Azure (Legacy)
	InfAppConnectionAzureClientID     string
	InfAppConnectionAzureClientSecret string

	// App Connection - Azure App Configuration
	InfAppConnectionAzureAppConfigurationClientID     string
	InfAppConnectionAzureAppConfigurationClientSecret string

	// App Connection - Azure Key Vault
	InfAppConnectionAzureKeyVaultClientID     string
	InfAppConnectionAzureKeyVaultClientSecret string

	// App Connection - Azure Client Secrets
	InfAppConnectionAzureClientSecretsClientID     string
	InfAppConnectionAzureClientSecretsClientSecret string

	// App Connection - Azure DevOps
	InfAppConnectionAzureDevOpsClientID     string
	InfAppConnectionAzureDevOpsClientSecret string

	// App Connection - Heroku
	InfAppConnectionHerokuOAuthClientID     string
	InfAppConnectionHerokuOAuthClientSecret string

	// Datadog
	ShouldUseDatadogTracer  bool
	DatadogProfilingEnabled bool
	DatadogEnv              string
	DatadogService          string
	DatadogHostname         string

	// PIT (Point-in-Time)
	PITCheckpointWindow     string
	PITTreeCheckpointWindow string

	// CORS
	CORSAllowedOrigins string
	CORSAllowedHeaders string

	// OracleDB
	TNSAdmin string

	// Internal
	InternalRegion string

	// Development flags
	RotationDevelopmentMode                     bool
	DailyResourceCleanUpDevelopmentMode         bool
	BDDNockAPIEnabled                           bool
	ACMEDevelopmentMode                         bool
	ACMESkipUpstreamValidation                  bool
	ACMEDevelopmentHTTP01ChallengeHostOverrides string
	ACMEDNSResolverServers                      string
	ACMEDNSResolveResolverServersHostEnabled    bool
	DNSMadeEasySandboxEnabled                   bool

	// Derived (not from env)
	IsCloud                      bool
	IsSmtpConfigured             bool
	IsRedisConfigured            bool
	IsClickHouseConfigured       bool
	IsDevelopmentMode            bool
	IsTestMode                   bool
	IsProductionMode             bool
	IsRedisSentinelMode          bool
	IsSecondaryInstance          bool
	IsHsmConfigured              bool
	IsSecretScanningConfigured   bool
	IsSecretScanningV2Configured bool
	DBReadReplicas               []DBReadReplica
	ParsedRedisSentinelHosts     []RedisHostPort
	ParsedRedisClusterHosts      []RedisHostPort
	ParsedRedisReadReplicas      []RedisHostPort
}

func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func GetConfiguredSlogLevel() slog.Level {
	switch strings.ToLower(os.Getenv("LOG_LEVEL")) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func LoadConfig() (*Config, error) {
	cfg := &Config{}
	l := &Loader{}

	// Load all env vars using the builder pattern
	l.
		// Server
		Optional(&cfg.InfisicalPlatformVersion, "INFISICAL_PLATFORM_VERSION", "").
		OptionalBool(&cfg.KubernetesAutoFetchServiceAccountToken, "KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN", false).
		OptionalInt(&cfg.Port, "PORT", 4040).
		Optional(&cfg.Host, "HOST", "0.0.0.0").
		OptionalBool(&cfg.StandaloneMode, "STANDALONE_MODE", false).
		OptionalBool(&cfg.InfisicalCloud, "INFISICAL_CLOUD", false).
		OptionalBool(&cfg.MaintenanceMode, "MAINTENANCE_MODE", false).
		OptionalBool(&cfg.DisableSecretScanning, "DISABLE_SECRET_SCANNING", false).

		// Logging
		Optional(&cfg.LogLevel, "LOG_LEVEL", "info").

		// Database
		Optional(&cfg.DBConnectionURI, "DB_CONNECTION_URI", "").
		Optional(&cfg.DBRootCert, "DB_ROOT_CERT", "").
		Optional(&cfg.DBHost, "DB_HOST", "").
		Optional(&cfg.DBPort, "DB_PORT", "5432").
		Optional(&cfg.DBUser, "DB_USER", "").
		Optional(&cfg.DBPassword, "DB_PASSWORD", "").
		Optional(&cfg.DBName, "DB_NAME", "").
		Optional(&cfg.DBReadReplicasRaw, "DB_READ_REPLICAS", "").
		Optional(&cfg.AuditLogsDBConnectionURI, "AUDIT_LOGS_DB_CONNECTION_URI", "").
		Optional(&cfg.AuditLogsDBRootCert, "AUDIT_LOGS_DB_ROOT_CERT", "").

		// ClickHouse
		Optional(&cfg.ClickhouseURL, "CLICKHOUSE_URL", "").
		Optional(&cfg.ClickhouseAuditLogEngine, "CLICKHOUSE_AUDIT_LOG_ENGINE", "ReplacingMergeTree").
		Optional(&cfg.ClickhouseAuditLogTableName, "CLICKHOUSE_AUDIT_LOG_TABLE_NAME", "audit_logs").
		OptionalBool(&cfg.ClickhouseAuditLogEnabled, "CLICKHOUSE_AUDIT_LOG_ENABLED", true).
		OptionalBool(&cfg.ClickhouseAuditLogQueryEnabled, "CLICKHOUSE_AUDIT_LOG_QUERY_ENABLED", false).
		Optional(&cfg.ClickhouseAuditLogInsertSettings, "CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS", "").

		// Redis
		Optional(&cfg.RedisURL, "REDIS_URL", "").
		Optional(&cfg.RedisUsername, "REDIS_USERNAME", "").
		Optional(&cfg.RedisPassword, "REDIS_PASSWORD", "").
		Optional(&cfg.RedisSentinelHosts, "REDIS_SENTINEL_HOSTS", "").
		Optional(&cfg.RedisSentinelMasterName, "REDIS_SENTINEL_MASTER_NAME", "mymaster").
		OptionalBool(&cfg.RedisSentinelEnableTLS, "REDIS_SENTINEL_ENABLE_TLS", false).
		Optional(&cfg.RedisSentinelUsername, "REDIS_SENTINEL_USERNAME", "").
		Optional(&cfg.RedisSentinelPassword, "REDIS_SENTINEL_PASSWORD", "").
		Optional(&cfg.RedisClusterHosts, "REDIS_CLUSTER_HOSTS", "").
		OptionalBool(&cfg.RedisClusterEnableTLS, "REDIS_CLUSTER_ENABLE_TLS", false).
		OptionalBool(&cfg.RedisClusterAWSElastiCacheDNSLookupMode, "REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE", false).
		Optional(&cfg.RedisReadReplicas, "REDIS_READ_REPLICAS", "").

		// Encryption
		Optional(&cfg.EncryptionKey, "ENCRYPTION_KEY", "").
		Optional(&cfg.RootEncryptionKey, "ROOT_ENCRYPTION_KEY", "").
		OptionalBool(&cfg.FipsEnabled, "FIPS_ENABLED", false).

		// Auth
		Optional(&cfg.AuthSecret, "AUTH_SECRET", "").
		Optional(&cfg.CookieSecretSignKey, "COOKIE_SECRET_SIGN_KEY", "").
		Optional(&cfg.JWTAuthLifetime, "JWT_AUTH_LIFETIME", "10d").
		Optional(&cfg.JWTSignupLifetime, "JWT_SIGNUP_LIFETIME", "15m").
		Optional(&cfg.JWTRefreshLifetime, "JWT_REFRESH_LIFETIME", "90d").
		Optional(&cfg.JWTInviteLifetime, "JWT_INVITE_LIFETIME", "1d").
		Optional(&cfg.JWTMfaLifetime, "JWT_MFA_LIFETIME", "5m").
		Optional(&cfg.JWTProviderAuthLifetime, "JWT_PROVIDER_AUTH_LIFETIME", "15m").

		// Site
		Optional(&cfg.SiteURL, "SITE_URL", "").
		OptionalBool(&cfg.HTTPSEnabled, "HTTPS_ENABLED", false).

		// Telemetry
		OptionalBool(&cfg.TelemetryEnabled, "TELEMETRY_ENABLED", true).

		// PostHog
		Optional(&cfg.PosthogHost, "POSTHOG_HOST", "https://app.posthog.com").
		Optional(&cfg.PosthogProjectAPIKey, "POSTHOG_PROJECT_API_KEY", "phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE").

		// OpenTelemetry
		OptionalBool(&cfg.OTELTelemetryCollectionEnabled, "OTEL_TELEMETRY_COLLECTION_ENABLED", false).
		Optional(&cfg.OTELExportOTLPEndpoint, "OTEL_EXPORT_OTLP_ENDPOINT", "").
		OptionalInt(&cfg.OTELOTLPPushInterval, "OTEL_OTLP_PUSH_INTERVAL", 30000).
		Optional(&cfg.OTELCollectorBasicAuthUsername, "OTEL_COLLECTOR_BASIC_AUTH_USERNAME", "").
		Optional(&cfg.OTELCollectorBasicAuthPassword, "OTEL_COLLECTOR_BASIC_AUTH_PASSWORD", "").
		Optional(&cfg.OTELExportType, "OTEL_EXPORT_TYPE", "").

		// SMTP
		Optional(&cfg.SMTPHost, "SMTP_HOST", "").
		OptionalInt(&cfg.SMTPPort, "SMTP_PORT", 587).
		Optional(&cfg.SMTPUsername, "SMTP_USERNAME", "").
		Optional(&cfg.SMTPPassword, "SMTP_PASSWORD", "").
		Optional(&cfg.SMTPFromAddress, "SMTP_FROM_ADDRESS", "").
		Optional(&cfg.SMTPFromName, "SMTP_FROM_NAME", "Infisical").
		OptionalBool(&cfg.SMTPIgnoreTLS, "SMTP_IGNORE_TLS", false).
		OptionalBool(&cfg.SMTPRequireTLS, "SMTP_REQUIRE_TLS", true).
		OptionalBool(&cfg.SMTPTLSRejectUnauthorized, "SMTP_TLS_REJECT_UNAUTHORIZED", true).
		Optional(&cfg.SMTPCustomCACert, "SMTP_CUSTOM_CA_CERT", "").

		// Crypto
		OptionalInt(&cfg.SaltRounds, "SALT_ROUNDS", 10).

		// Queue
		OptionalBool(&cfg.QueueWorkersEnabled, "QUEUE_WORKERS_ENABLED", true).
		Optional(&cfg.QueueWorkerProfile, "QUEUE_WORKER_PROFILE", "").
		OptionalBool(&cfg.UsePGQueue, "USE_PG_QUEUE", false).
		OptionalBool(&cfg.ShouldInitPGQueue, "SHOULD_INIT_PG_QUEUE", false).

		// SSO - Google
		Optional(&cfg.ClientIDGoogleLogin, "CLIENT_ID_GOOGLE_LOGIN", "").
		Optional(&cfg.ClientSecretGoogleLogin, "CLIENT_SECRET_GOOGLE_LOGIN", "").

		// SSO - GitHub
		Optional(&cfg.ClientIDGithubLogin, "CLIENT_ID_GITHUB_LOGIN", "").
		Optional(&cfg.ClientSecretGithubLogin, "CLIENT_SECRET_GITHUB_LOGIN", "").

		// SSO - GitLab
		Optional(&cfg.ClientIDGitlabLogin, "CLIENT_ID_GITLAB_LOGIN", "").
		Optional(&cfg.ClientSecretGitlabLogin, "CLIENT_SECRET_GITLAB_LOGIN", "").
		Optional(&cfg.ClientGitlabLoginURL, "CLIENT_GITLAB_LOGIN_URL", "").
		Optional(&cfg.DefaultSAMLOrgSlug, "DEFAULT_SAML_ORG_SLUG", "").

		// Integration - Heroku
		Optional(&cfg.ClientIDHeroku, "CLIENT_ID_HEROKU", "").
		Optional(&cfg.ClientSecretHeroku, "CLIENT_SECRET_HEROKU", "").

		// Integration - Vercel
		Optional(&cfg.ClientIDVercel, "CLIENT_ID_VERCEL", "").
		Optional(&cfg.ClientSecretVercel, "CLIENT_SECRET_VERCEL", "").
		Optional(&cfg.ClientSlugVercel, "CLIENT_SLUG_VERCEL", "").

		// Integration - Netlify
		Optional(&cfg.ClientIDNetlify, "CLIENT_ID_NETLIFY", "").
		Optional(&cfg.ClientSecretNetlify, "CLIENT_SECRET_NETLIFY", "").

		// Integration - Bitbucket
		Optional(&cfg.ClientIDBitbucket, "CLIENT_ID_BITBUCKET", "").
		Optional(&cfg.ClientSecretBitbucket, "CLIENT_SECRET_BITBUCKET", "").

		// Integration - GCP Secret Manager
		Optional(&cfg.ClientIDGCPSecretManager, "CLIENT_ID_GCP_SECRET_MANAGER", "").
		Optional(&cfg.ClientSecretGCPSecretManager, "CLIENT_SECRET_GCP_SECRET_MANAGER", "").

		// Integration - GitHub OAuth
		Optional(&cfg.ClientIDGithub, "CLIENT_ID_GITHUB", "").
		Optional(&cfg.ClientSecretGithub, "CLIENT_SECRET_GITHUB", "").

		// Integration - GitHub App
		Optional(&cfg.ClientIDGithubApp, "CLIENT_ID_GITHUB_APP", "").
		Optional(&cfg.ClientSecretGithubApp, "CLIENT_SECRET_GITHUB_APP", "").
		Optional(&cfg.ClientPrivateKeyGithubApp, "CLIENT_PRIVATE_KEY_GITHUB_APP", "").
		OptionalInt(&cfg.ClientAppIDGithubApp, "CLIENT_APP_ID_GITHUB_APP", 0).
		Optional(&cfg.ClientSlugGithubApp, "CLIENT_SLUG_GITHUB_APP", "").

		// Integration - Azure
		Optional(&cfg.ClientIDAzure, "CLIENT_ID_AZURE", "").
		Optional(&cfg.ClientSecretAzure, "CLIENT_SECRET_AZURE", "").

		// Integration - AWS
		Optional(&cfg.ClientIDAWSIntegration, "CLIENT_ID_AWS_INTEGRATION", "").
		Optional(&cfg.ClientSecretAWSIntegration, "CLIENT_SECRET_AWS_INTEGRATION", "").

		// Integration - GitLab
		Optional(&cfg.ClientIDGitlab, "CLIENT_ID_GITLAB", "").
		Optional(&cfg.ClientSecretGitlab, "CLIENT_SECRET_GITLAB", "").
		Optional(&cfg.URLGitlabURL, "URL_GITLAB_URL", "https://gitlab.com").

		// Secret Scanning
		Optional(&cfg.SecretScanningWebhookProxy, "SECRET_SCANNING_WEBHOOK_PROXY", "").
		Optional(&cfg.SecretScanningWebhookSecret, "SECRET_SCANNING_WEBHOOK_SECRET", "").
		Optional(&cfg.SecretScanningGitAppID, "SECRET_SCANNING_GIT_APP_ID", "").
		Optional(&cfg.SecretScanningPrivateKey, "SECRET_SCANNING_PRIVATE_KEY", "").
		Optional(&cfg.SecretScanningOrgWhitelist, "SECRET_SCANNING_ORG_WHITELIST", "").
		Optional(&cfg.SecretScanningGitAppSlug, "SECRET_SCANNING_GIT_APP_SLUG", "infisical-radar").

		// Cross-project secret sharing
		Optional(&cfg.CrossProjectSecretSharing, "CROSS_PROJECT_SECRET_SHARING_ORG_WHITELIST", "").

		// License
		Optional(&cfg.LicenseServerURL, "LICENSE_SERVER_URL", "https://portal.infisical.com").
		Optional(&cfg.LicenseServerKey, "LICENSE_SERVER_KEY", "").
		Optional(&cfg.LicenseKey, "LICENSE_KEY", "").
		Optional(&cfg.LicenseKeyOffline, "LICENSE_KEY_OFFLINE", "").

		// Captcha
		Optional(&cfg.CaptchaSecret, "CAPTCHA_SECRET", "").
		Optional(&cfg.CaptchaSiteKey, "CAPTCHA_SITE_KEY", "").

		// Misc
		Optional(&cfg.InitialOrganizationName, "INITIAL_ORGANIZATION_NAME", "").
		OptionalInt(&cfg.MaxLeaseLimit, "MAX_LEASE_LIMIT", 10000).
		Optional(&cfg.IntercomID, "INTERCOM_ID", "").
		Optional(&cfg.CDNHost, "CDN_HOST", "").
		Optional(&cfg.LoopsAPIKey, "LOOPS_API_KEY", "").
		Optional(&cfg.GithubAPIToken, "GITHUB_API_TOKEN", "").
		Optional(&cfg.PylonAPIKey, "PYLON_API_KEY", "").
		OptionalBool(&cfg.DisableAuditLogGeneration, "DISABLE_AUDIT_LOG_GENERATION", false).
		OptionalBool(&cfg.DisableAuditLogStorage, "DISABLE_AUDIT_LOG_STORAGE", false).
		OptionalBool(&cfg.GenerateSanitizedSchema, "GENERATE_SANITIZED_SCHEMA", false).
		Optional(&cfg.SanitizedSchemaRole, "SANITIZED_SCHEMA_ROLE", "").

		// TLS / Certificates
		Optional(&cfg.SSLClientCertificateHeaderKey, "SSL_CLIENT_CERTIFICATE_HEADER_KEY", "x-ssl-client-cert").
		Optional(&cfg.IdentityTLSCertAuthClientCertificateHeaderKey, "IDENTITY_TLS_CERT_AUTH_CLIENT_CERTIFICATE_HEADER_KEY", "x-identity-tls-cert-auth-client-cert").

		// Slack
		Optional(&cfg.WorkflowSlackClientID, "WORKFLOW_SLACK_CLIENT_ID", "").
		Optional(&cfg.WorkflowSlackClientSecret, "WORKFLOW_SLACK_CLIENT_SECRET", "").

		// MSSQL
		OptionalBool(&cfg.EnableMSSQLSecretRotationEncrypt, "ENABLE_MSSQL_SECRET_ROTATION_ENCRYPT", true).

		// Secret Detection
		Optional(&cfg.ParamsFolderSecretDetectionPaths, "PARAMS_FOLDER_SECRET_DETECTION_PATHS", "").
		OptionalFloat(&cfg.ParamsFolderSecretDetectionEntropy, "PARAMS_FOLDER_SECRET_DETECTION_ENTROPY", 3.7).

		// Secondary Instance
		Optional(&cfg.InfisicalPrimaryInstanceURL, "INFISICAL_PRIMARY_INSTANCE_URL", "").

		// HSM
		Optional(&cfg.HSMLibPath, "HSM_LIB_PATH", "").
		Optional(&cfg.HSMPin, "HSM_PIN", "").
		Optional(&cfg.HSMKeyLabel, "HSM_KEY_LABEL", "").
		OptionalInt(&cfg.HSMSlot, "HSM_SLOT", 0).

		// Gateway
		Optional(&cfg.GatewayInfisicalStaticIPAddress, "GATEWAY_INFISICAL_STATIC_IP_ADDRESS", "").
		Optional(&cfg.GatewayRelayAddress, "GATEWAY_RELAY_ADDRESS", "").
		Optional(&cfg.GatewayRelayRealm, "GATEWAY_RELAY_REALM", "").
		Optional(&cfg.GatewayRelayAuthSecret, "GATEWAY_RELAY_AUTH_SECRET", "").
		Optional(&cfg.RelayAuthSecret, "RELAY_AUTH_SECRET", "").

		// Dynamic Secrets
		OptionalBool(&cfg.DynamicSecretAllowInternalIP, "DYNAMIC_SECRET_ALLOW_INTERNAL_IP", false).
		Optional(&cfg.DynamicSecretAWSAccessKeyID, "DYNAMIC_SECRET_AWS_ACCESS_KEY_ID", "").
		Optional(&cfg.DynamicSecretAWSSecretAccessKey, "DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY", "").

		// PAM AWS
		Optional(&cfg.PAMAWSAccessKeyID, "PAM_AWS_ACCESS_KEY_ID", "").
		Optional(&cfg.PAMAWSSecretAccessKey, "PAM_AWS_SECRET_ACCESS_KEY", "").

		// App Connections
		OptionalBool(&cfg.AllowInternalIPConnections, "ALLOW_INTERNAL_IP_CONNECTIONS", false).

		// App Connection - AWS
		Optional(&cfg.InfAppConnectionAWSAccessKeyID, "INF_APP_CONNECTION_AWS_ACCESS_KEY_ID", "").
		Optional(&cfg.InfAppConnectionAWSSecretAccessKey, "INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY", "").

		// App Connection - GitHub OAuth
		Optional(&cfg.InfAppConnectionGithubOAuthClientID, "INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionGithubOAuthClientSecret, "INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET", "").

		// App Connection - GitHub App
		Optional(&cfg.InfAppConnectionGithubAppClientID, "INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionGithubAppClientSecret, "INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET", "").
		Optional(&cfg.InfAppConnectionGithubAppPrivateKey, "INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY", "").
		Optional(&cfg.InfAppConnectionGithubAppSlug, "INF_APP_CONNECTION_GITHUB_APP_SLUG", "").
		Optional(&cfg.InfAppConnectionGithubAppID, "INF_APP_CONNECTION_GITHUB_APP_ID", "").

		// App Connection - GitHub Radar App
		Optional(&cfg.InfAppConnectionGithubRadarAppClientID, "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionGithubRadarAppClientSecret, "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET", "").
		Optional(&cfg.InfAppConnectionGithubRadarAppPrivateKey, "INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY", "").
		Optional(&cfg.InfAppConnectionGithubRadarAppSlug, "INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG", "").
		Optional(&cfg.InfAppConnectionGithubRadarAppID, "INF_APP_CONNECTION_GITHUB_RADAR_APP_ID", "").
		Optional(&cfg.InfAppConnectionGithubRadarAppWebhookSecret, "INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET", "").

		// App Connection - GitLab OAuth
		Optional(&cfg.InfAppConnectionGitlabOAuthClientID, "INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionGitlabOAuthClientSecret, "INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET", "").

		// App Connection - GCP
		Optional(&cfg.InfAppConnectionGCPServiceAccountCredential, "INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL", "").

		// App Connection - Azure (Legacy)
		Optional(&cfg.InfAppConnectionAzureClientID, "INF_APP_CONNECTION_AZURE_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionAzureClientSecret, "INF_APP_CONNECTION_AZURE_CLIENT_SECRET", "").

		// App Connection - Azure App Configuration
		Optional(&cfg.InfAppConnectionAzureAppConfigurationClientID, "INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionAzureAppConfigurationClientSecret, "INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET", "").

		// App Connection - Azure Key Vault
		Optional(&cfg.InfAppConnectionAzureKeyVaultClientID, "INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionAzureKeyVaultClientSecret, "INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET", "").

		// App Connection - Azure Client Secrets
		Optional(&cfg.InfAppConnectionAzureClientSecretsClientID, "INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionAzureClientSecretsClientSecret, "INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET", "").

		// App Connection - Azure DevOps
		Optional(&cfg.InfAppConnectionAzureDevOpsClientID, "INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionAzureDevOpsClientSecret, "INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET", "").

		// App Connection - Heroku
		Optional(&cfg.InfAppConnectionHerokuOAuthClientID, "INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID", "").
		Optional(&cfg.InfAppConnectionHerokuOAuthClientSecret, "INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET", "").

		// Datadog
		OptionalBool(&cfg.ShouldUseDatadogTracer, "SHOULD_USE_DATADOG_TRACER", false).
		OptionalBool(&cfg.DatadogProfilingEnabled, "DATADOG_PROFILING_ENABLED", false).
		Optional(&cfg.DatadogEnv, "DATADOG_ENV", "prod").
		Optional(&cfg.DatadogService, "DATADOG_SERVICE", "infisical-core").
		Optional(&cfg.DatadogHostname, "DATADOG_HOSTNAME", "").

		// PIT
		Optional(&cfg.PITCheckpointWindow, "PIT_CHECKPOINT_WINDOW", "100").
		Optional(&cfg.PITTreeCheckpointWindow, "PIT_TREE_CHECKPOINT_WINDOW", "200").

		// CORS
		Optional(&cfg.CORSAllowedOrigins, "CORS_ALLOWED_ORIGINS", "").
		Optional(&cfg.CORSAllowedHeaders, "CORS_ALLOWED_HEADERS", "").

		// OracleDB
		Optional(&cfg.TNSAdmin, "TNS_ADMIN", "").

		// Internal
		Optional(&cfg.InternalRegion, "INTERNAL_REGION", "").

		// Development flags
		OptionalBool(&cfg.RotationDevelopmentMode, "ROTATION_DEVELOPMENT_MODE", false).
		OptionalBool(&cfg.DailyResourceCleanUpDevelopmentMode, "DAILY_RESOURCE_CLEAN_UP_DEVELOPMENT_MODE", false).
		OptionalBool(&cfg.BDDNockAPIEnabled, "BDD_NOCK_API_ENABLED", false).
		OptionalBool(&cfg.ACMEDevelopmentMode, "ACME_DEVELOPMENT_MODE", false).
		OptionalBool(&cfg.ACMESkipUpstreamValidation, "ACME_SKIP_UPSTREAM_VALIDATION", false).
		Optional(&cfg.ACMEDevelopmentHTTP01ChallengeHostOverrides, "ACME_DEVELOPMENT_HTTP01_CHALLENGE_HOST_OVERRIDES", "").
		Optional(&cfg.ACMEDNSResolverServers, "ACME_DNS_RESOLVER_SERVERS", "").
		OptionalBool(&cfg.ACMEDNSResolveResolverServersHostEnabled, "ACME_DNS_RESOLVE_RESOLVER_SERVERS_HOST_ENABLED", false).
		OptionalBool(&cfg.DNSMadeEasySandboxEnabled, "DNS_MADE_EASY_SANDBOX_ENABLED", false)

	if err := l.Err(); err != nil {
		return nil, err
	}

	// Parse NODE_ENV
	nodeEnvStr := os.Getenv("NODE_ENV")
	if nodeEnvStr == "" {
		nodeEnvStr = string(NodeEnvProduction)
	}
	cfg.NodeEnv = NodeEnv(nodeEnvStr)

	// Validate required fields and constraints
	if issues := cfg.validate(); len(issues) > 0 {
		return nil, &ValidationError{Issues: issues}
	}

	// Compute derived fields
	cfg.IsDevelopmentMode = cfg.NodeEnv == NodeEnvDevelopment
	cfg.IsTestMode = cfg.NodeEnv == NodeEnvTest
	cfg.IsProductionMode = cfg.NodeEnv == NodeEnvProduction
	cfg.IsRedisConfigured = cfg.RedisURL != "" || cfg.RedisSentinelHosts != "" || cfg.RedisClusterHosts != ""
	cfg.IsRedisSentinelMode = cfg.RedisSentinelHosts != ""
	cfg.IsSmtpConfigured = cfg.SMTPHost != ""
	cfg.IsCloud = cfg.LicenseServerKey != ""
	cfg.IsClickHouseConfigured = cfg.ClickhouseURL != ""
	cfg.IsSecondaryInstance = cfg.InfisicalPrimaryInstanceURL != ""
	cfg.IsHsmConfigured = cfg.HSMLibPath != "" && cfg.HSMPin != "" && cfg.HSMKeyLabel != ""
	cfg.IsSecretScanningConfigured = cfg.SecretScanningGitAppID != "" &&
		cfg.SecretScanningPrivateKey != "" &&
		cfg.SecretScanningWebhookSecret != ""
	cfg.IsSecretScanningV2Configured = cfg.InfAppConnectionGithubRadarAppID != "" &&
		cfg.InfAppConnectionGithubRadarAppPrivateKey != "" &&
		cfg.InfAppConnectionGithubRadarAppSlug != "" &&
		cfg.InfAppConnectionGithubRadarAppClientID != "" &&
		cfg.InfAppConnectionGithubRadarAppClientSecret != "" &&
		cfg.InfAppConnectionGithubRadarAppWebhookSecret != ""

	// Azure fallbacks (legacy single app → per-service apps)
	if cfg.InfAppConnectionAzureDevOpsClientID == "" {
		cfg.InfAppConnectionAzureDevOpsClientID = cfg.InfAppConnectionAzureClientID
	}
	if cfg.InfAppConnectionAzureDevOpsClientSecret == "" {
		cfg.InfAppConnectionAzureDevOpsClientSecret = cfg.InfAppConnectionAzureClientSecret
	}
	if cfg.InfAppConnectionAzureClientSecretsClientID == "" {
		cfg.InfAppConnectionAzureClientSecretsClientID = cfg.InfAppConnectionAzureClientID
	}
	if cfg.InfAppConnectionAzureClientSecretsClientSecret == "" {
		cfg.InfAppConnectionAzureClientSecretsClientSecret = cfg.InfAppConnectionAzureClientSecret
	}
	if cfg.InfAppConnectionAzureKeyVaultClientID == "" {
		cfg.InfAppConnectionAzureKeyVaultClientID = cfg.InfAppConnectionAzureClientID
	}
	if cfg.InfAppConnectionAzureKeyVaultClientSecret == "" {
		cfg.InfAppConnectionAzureKeyVaultClientSecret = cfg.InfAppConnectionAzureClientSecret
	}
	if cfg.InfAppConnectionAzureAppConfigurationClientID == "" {
		cfg.InfAppConnectionAzureAppConfigurationClientID = cfg.InfAppConnectionAzureClientID
	}
	if cfg.InfAppConnectionAzureAppConfigurationClientSecret == "" {
		cfg.InfAppConnectionAzureAppConfigurationClientSecret = cfg.InfAppConnectionAzureClientSecret
	}

	// Heroku fallback
	if cfg.InfAppConnectionHerokuOAuthClientID == "" {
		cfg.InfAppConnectionHerokuOAuthClientID = cfg.ClientIDHeroku
	}
	if cfg.InfAppConnectionHerokuOAuthClientSecret == "" {
		cfg.InfAppConnectionHerokuOAuthClientSecret = cfg.ClientSecretHeroku
	}

	// Parse DB_READ_REPLICAS JSON
	if cfg.DBReadReplicasRaw != "" {
		if err := json.Unmarshal([]byte(cfg.DBReadReplicasRaw), &cfg.DBReadReplicas); err != nil {
			return nil, fmt.Errorf("parsing DB_READ_REPLICAS: %w", err)
		}
	}

	// Parse comma-separated host:port lists
	var parseIssues []string
	if cfg.RedisSentinelHosts != "" {
		var issues []string
		cfg.ParsedRedisSentinelHosts, issues = parseHostPortList(cfg.RedisSentinelHosts, "REDIS_SENTINEL_HOSTS")
		parseIssues = append(parseIssues, issues...)
	}
	if cfg.RedisClusterHosts != "" {
		var issues []string
		cfg.ParsedRedisClusterHosts, issues = parseHostPortList(cfg.RedisClusterHosts, "REDIS_CLUSTER_HOSTS")
		parseIssues = append(parseIssues, issues...)
	}
	if cfg.RedisReadReplicas != "" {
		var issues []string
		cfg.ParsedRedisReadReplicas, issues = parseHostPortList(cfg.RedisReadReplicas, "REDIS_READ_REPLICAS")
		parseIssues = append(parseIssues, issues...)
	}
	if len(parseIssues) > 0 {
		return nil, &ValidationError{Issues: parseIssues}
	}

	return cfg, nil
}

// ValidationError holds a list of config validation issues.
type ValidationError struct {
	Issues []string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("invalid environment variables:\n  - %s", strings.Join(e.Issues, "\n  - "))
}

// parseHostPortList parses a comma-separated "host:port" string into []RedisHostPort.
func parseHostPortList(raw, envVar string) (result []RedisHostPort, issues []string) {
	for entry := range strings.SplitSeq(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		host, portStr, found := strings.Cut(entry, ":")
		hp := RedisHostPort{Host: strings.TrimSpace(host)}
		if found {
			portStr = strings.TrimSpace(portStr)
			if portStr == "" {
				issues = append(issues, fmt.Sprintf("%s: empty port in %q", envVar, entry))
			} else if _, err := fmt.Sscanf(portStr, "%d", &hp.Port); err != nil {
				issues = append(issues, fmt.Sprintf("%s: invalid port %q in %q", envVar, portStr, entry))
			}
		}
		result = append(result, hp)
	}
	return
}

func (c *Config) validate() []string {
	var issues []string

	switch c.NodeEnv {
	case NodeEnvDevelopment, NodeEnvTest, NodeEnvProduction:
	default:
		issues = append(issues, fmt.Sprintf("NODE_ENV must be one of: development, test, production (got %q)", c.NodeEnv))
	}

	if c.Port <= 0 || c.Port > 65535 {
		issues = append(issues, fmt.Sprintf("PORT must be between 1 and 65535 (got %d)", c.Port))
	}

	if c.DBConnectionURI == "" {
		if c.DBHost == "" || c.DBUser == "" || c.DBName == "" {
			issues = append(issues, "DB_CONNECTION_URI is required (or set DB_HOST, DB_USER, and DB_NAME)")
		}
	}

	if c.RedisURL == "" && c.RedisSentinelHosts == "" && c.RedisClusterHosts == "" {
		issues = append(issues, "Either REDIS_URL, REDIS_SENTINEL_HOSTS, or REDIS_CLUSTER_HOSTS is required")
	}

	if c.EncryptionKey == "" && c.RootEncryptionKey == "" {
		issues = append(issues, "Either ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY is required")
	}

	if c.AuthSecret == "" {
		issues = append(issues, "AUTH_SECRET is required")
	}

	return issues
}
