package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/knadh/koanf/parsers/dotenv"
	envprovider "github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

// ParsedDBReadReplica represents a single parsed DB read replica from DB_READ_REPLICAS JSON.
type ParsedDBReadReplica struct {
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
	InfisicalPlatformVersion              string  `koanf:"INFISICAL_PLATFORM_VERSION"`
	KubernetesAutoFetchServiceAccountToken bool   `koanf:"KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN"`
	NodeEnv                                NodeEnv `koanf:"NODE_ENV"`
	Port                                   int     `koanf:"PORT"`
	Host                                   string  `koanf:"HOST"`
	StandaloneMode                         bool    `koanf:"STANDALONE_MODE"`
	InfisicalCloud                         bool    `koanf:"INFISICAL_CLOUD"`
	MaintenanceMode                        bool    `koanf:"MAINTENANCE_MODE"`
	DisableSecretScanning                  bool    `koanf:"DISABLE_SECRET_SCANNING"`

	// Logging
	LogLevel string `koanf:"LOG_LEVEL"`

	// Database
	DBConnectionURI         string `koanf:"DB_CONNECTION_URI"`
	DBRootCert              string `koanf:"DB_ROOT_CERT"`
	DBHost                  string `koanf:"DB_HOST"`
	DBPort                  string `koanf:"DB_PORT"`
	DBUser                  string `koanf:"DB_USER"`
	DBPassword              string `koanf:"DB_PASSWORD"`
	DBName                  string `koanf:"DB_NAME"`
	DBReadReplicas          string `koanf:"DB_READ_REPLICAS"`
	AuditLogsDBConnectionURI string `koanf:"AUDIT_LOGS_DB_CONNECTION_URI"`
	AuditLogsDBRootCert     string `koanf:"AUDIT_LOGS_DB_ROOT_CERT"`

	// ClickHouse
	ClickhouseURL                   string `koanf:"CLICKHOUSE_URL"`
	ClickhouseAuditLogEngine        string `koanf:"CLICKHOUSE_AUDIT_LOG_ENGINE"`
	ClickhouseAuditLogTableName     string `koanf:"CLICKHOUSE_AUDIT_LOG_TABLE_NAME"`
	ClickhouseAuditLogEnabled       bool   `koanf:"CLICKHOUSE_AUDIT_LOG_ENABLED"`
	ClickhouseAuditLogQueryEnabled  bool   `koanf:"CLICKHOUSE_AUDIT_LOG_QUERY_ENABLED"`
	ClickhouseAuditLogInsertSettings string `koanf:"CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS"`

	// Redis
	RedisURL                                  string `koanf:"REDIS_URL"`
	RedisUsername                              string `koanf:"REDIS_USERNAME"`
	RedisPassword                              string `koanf:"REDIS_PASSWORD"`
	RedisSentinelHosts                         string `koanf:"REDIS_SENTINEL_HOSTS"`
	RedisSentinelMasterName                    string `koanf:"REDIS_SENTINEL_MASTER_NAME"`
	RedisSentinelEnableTLS                     bool   `koanf:"REDIS_SENTINEL_ENABLE_TLS"`
	RedisSentinelUsername                      string `koanf:"REDIS_SENTINEL_USERNAME"`
	RedisSentinelPassword                      string `koanf:"REDIS_SENTINEL_PASSWORD"`
	RedisClusterHosts                          string `koanf:"REDIS_CLUSTER_HOSTS"`
	RedisClusterEnableTLS                      bool   `koanf:"REDIS_CLUSTER_ENABLE_TLS"`
	RedisClusterAWSElastiCacheDNSLookupMode    bool   `koanf:"REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE"`
	RedisReadReplicas                          string `koanf:"REDIS_READ_REPLICAS"`

	// Encryption
	EncryptionKey     string `koanf:"ENCRYPTION_KEY"`
	RootEncryptionKey string `koanf:"ROOT_ENCRYPTION_KEY"`

	// Auth
	AuthSecret            string `koanf:"AUTH_SECRET"`
	CookieSecretSignKey   string `koanf:"COOKIE_SECRET_SIGN_KEY"`
	JWTAuthLifetime       string `koanf:"JWT_AUTH_LIFETIME"`
	JWTSignupLifetime     string `koanf:"JWT_SIGNUP_LIFETIME"`
	JWTRefreshLifetime    string `koanf:"JWT_REFRESH_LIFETIME"`
	JWTInviteLifetime     string `koanf:"JWT_INVITE_LIFETIME"`
	JWTMfaLifetime        string `koanf:"JWT_MFA_LIFETIME"`
	JWTProviderAuthLifetime string `koanf:"JWT_PROVIDER_AUTH_LIFETIME"`

	// Site
	SiteURL      string `koanf:"SITE_URL"`
	HTTPSEnabled bool   `koanf:"HTTPS_ENABLED"`

	// Telemetry
	TelemetryEnabled bool `koanf:"TELEMETRY_ENABLED"`

	// PostHog
	PosthogHost          string `koanf:"POSTHOG_HOST"`
	PosthogProjectAPIKey string `koanf:"POSTHOG_PROJECT_API_KEY"`

	// OpenTelemetry
	OTELTelemetryCollectionEnabled bool   `koanf:"OTEL_TELEMETRY_COLLECTION_ENABLED"`
	OTELExportOTLPEndpoint         string `koanf:"OTEL_EXPORT_OTLP_ENDPOINT"`
	OTELOTLPPushInterval           int    `koanf:"OTEL_OTLP_PUSH_INTERVAL"`
	OTELCollectorBasicAuthUsername  string `koanf:"OTEL_COLLECTOR_BASIC_AUTH_USERNAME"`
	OTELCollectorBasicAuthPassword  string `koanf:"OTEL_COLLECTOR_BASIC_AUTH_PASSWORD"`
	OTELExportType                  string `koanf:"OTEL_EXPORT_TYPE"`

	// SMTP
	SMTPHost                 string `koanf:"SMTP_HOST"`
	SMTPPort                 int    `koanf:"SMTP_PORT"`
	SMTPUsername             string `koanf:"SMTP_USERNAME"`
	SMTPPassword             string `koanf:"SMTP_PASSWORD"`
	SMTPFromAddress          string `koanf:"SMTP_FROM_ADDRESS"`
	SMTPFromName             string `koanf:"SMTP_FROM_NAME"`
	SMTPIgnoreTLS            bool   `koanf:"SMTP_IGNORE_TLS"`
	SMTPRequireTLS           bool   `koanf:"SMTP_REQUIRE_TLS"`
	SMTPTLSRejectUnauthorized bool  `koanf:"SMTP_TLS_REJECT_UNAUTHORIZED"`
	SMTPCustomCACert         string `koanf:"SMTP_CUSTOM_CA_CERT"`

	// Crypto
	SaltRounds int `koanf:"SALT_ROUNDS"`

	// Queue
	QueueWorkersEnabled bool   `koanf:"QUEUE_WORKERS_ENABLED"`
	QueueWorkerProfile  string `koanf:"QUEUE_WORKER_PROFILE"`
	UsePGQueue          bool   `koanf:"USE_PG_QUEUE"`
	ShouldInitPGQueue   bool   `koanf:"SHOULD_INIT_PG_QUEUE"`

	// SSO - Google
	ClientIDGoogleLogin     string `koanf:"CLIENT_ID_GOOGLE_LOGIN"`
	ClientSecretGoogleLogin string `koanf:"CLIENT_SECRET_GOOGLE_LOGIN"`

	// SSO - GitHub
	ClientIDGithubLogin     string `koanf:"CLIENT_ID_GITHUB_LOGIN"`
	ClientSecretGithubLogin string `koanf:"CLIENT_SECRET_GITHUB_LOGIN"`

	// SSO - GitLab
	ClientIDGitlabLogin     string `koanf:"CLIENT_ID_GITLAB_LOGIN"`
	ClientSecretGitlabLogin string `koanf:"CLIENT_SECRET_GITLAB_LOGIN"`
	ClientGitlabLoginURL    string `koanf:"CLIENT_GITLAB_LOGIN_URL"`
	DefaultSAMLOrgSlug      string `koanf:"DEFAULT_SAML_ORG_SLUG"`

	// Integration - Heroku
	ClientIDHeroku     string `koanf:"CLIENT_ID_HEROKU"`
	ClientSecretHeroku string `koanf:"CLIENT_SECRET_HEROKU"`

	// Integration - Vercel
	ClientIDVercel     string `koanf:"CLIENT_ID_VERCEL"`
	ClientSecretVercel string `koanf:"CLIENT_SECRET_VERCEL"`
	ClientSlugVercel   string `koanf:"CLIENT_SLUG_VERCEL"`

	// Integration - Netlify
	ClientIDNetlify     string `koanf:"CLIENT_ID_NETLIFY"`
	ClientSecretNetlify string `koanf:"CLIENT_SECRET_NETLIFY"`

	// Integration - Bitbucket
	ClientIDBitbucket     string `koanf:"CLIENT_ID_BITBUCKET"`
	ClientSecretBitbucket string `koanf:"CLIENT_SECRET_BITBUCKET"`

	// Integration - GCP Secret Manager
	ClientIDGCPSecretManager     string `koanf:"CLIENT_ID_GCP_SECRET_MANAGER"`
	ClientSecretGCPSecretManager string `koanf:"CLIENT_SECRET_GCP_SECRET_MANAGER"`

	// Integration - GitHub OAuth
	ClientIDGithub     string `koanf:"CLIENT_ID_GITHUB"`
	ClientSecretGithub string `koanf:"CLIENT_SECRET_GITHUB"`

	// Integration - GitHub App
	ClientIDGithubApp         string `koanf:"CLIENT_ID_GITHUB_APP"`
	ClientSecretGithubApp     string `koanf:"CLIENT_SECRET_GITHUB_APP"`
	ClientPrivateKeyGithubApp string `koanf:"CLIENT_PRIVATE_KEY_GITHUB_APP"`
	ClientAppIDGithubApp      int    `koanf:"CLIENT_APP_ID_GITHUB_APP"`
	ClientSlugGithubApp       string `koanf:"CLIENT_SLUG_GITHUB_APP"`

	// Integration - Azure
	ClientIDAzure     string `koanf:"CLIENT_ID_AZURE"`
	ClientSecretAzure string `koanf:"CLIENT_SECRET_AZURE"`

	// Integration - AWS
	ClientIDAWSIntegration     string `koanf:"CLIENT_ID_AWS_INTEGRATION"`
	ClientSecretAWSIntegration string `koanf:"CLIENT_SECRET_AWS_INTEGRATION"`

	// Integration - GitLab
	ClientIDGitlab     string `koanf:"CLIENT_ID_GITLAB"`
	ClientSecretGitlab string `koanf:"CLIENT_SECRET_GITLAB"`
	URLGitlabURL       string `koanf:"URL_GITLAB_URL"`

	// Secret Scanning
	SecretScanningWebhookProxy  string `koanf:"SECRET_SCANNING_WEBHOOK_PROXY"`
	SecretScanningWebhookSecret string `koanf:"SECRET_SCANNING_WEBHOOK_SECRET"`
	SecretScanningGitAppID      string `koanf:"SECRET_SCANNING_GIT_APP_ID"`
	SecretScanningPrivateKey    string `koanf:"SECRET_SCANNING_PRIVATE_KEY"`
	SecretScanningOrgWhitelist  string `koanf:"SECRET_SCANNING_ORG_WHITELIST"`
	SecretScanningGitAppSlug    string `koanf:"SECRET_SCANNING_GIT_APP_SLUG"`

	// License
	LicenseServerURL string `koanf:"LICENSE_SERVER_URL"`
	LicenseServerKey string `koanf:"LICENSE_SERVER_KEY"`
	LicenseKey       string `koanf:"LICENSE_KEY"`
	LicenseKeyOffline string `koanf:"LICENSE_KEY_OFFLINE"`

	// Captcha
	CaptchaSecret  string `koanf:"CAPTCHA_SECRET"`
	CaptchaSiteKey string `koanf:"CAPTCHA_SITE_KEY"`

	// Misc
	InitialOrganizationName string `koanf:"INITIAL_ORGANIZATION_NAME"`
	MaxLeaseLimit           int    `koanf:"MAX_LEASE_LIMIT"`
	IntercomID              string `koanf:"INTERCOM_ID"`
	CDNHost                 string `koanf:"CDN_HOST"`
	LoopsAPIKey             string `koanf:"LOOPS_API_KEY"`
	GithubAPIToken          string `koanf:"GITHUB_API_TOKEN"`
	PylonAPIKey             string `koanf:"PYLON_API_KEY"`
	DisableAuditLogGeneration bool `koanf:"DISABLE_AUDIT_LOG_GENERATION"`
	DisableAuditLogStorage    bool `koanf:"DISABLE_AUDIT_LOG_STORAGE"`
	GenerateSanitizedSchema   bool `koanf:"GENERATE_SANITIZED_SCHEMA"`
	SanitizedSchemaRole       string `koanf:"SANITIZED_SCHEMA_ROLE"`

	// TLS / Certificates
	SSLClientCertificateHeaderKey               string `koanf:"SSL_CLIENT_CERTIFICATE_HEADER_KEY"`
	IdentityTLSCertAuthClientCertificateHeaderKey string `koanf:"IDENTITY_TLS_CERT_AUTH_CLIENT_CERTIFICATE_HEADER_KEY"`

	// Slack
	WorkflowSlackClientID     string `koanf:"WORKFLOW_SLACK_CLIENT_ID"`
	WorkflowSlackClientSecret string `koanf:"WORKFLOW_SLACK_CLIENT_SECRET"`

	// MSSQL
	EnableMSSQLSecretRotationEncrypt bool `koanf:"ENABLE_MSSQL_SECRET_ROTATION_ENCRYPT"`

	// Secret Detection
	ParamsFolderSecretDetectionPaths   string  `koanf:"PARAMS_FOLDER_SECRET_DETECTION_PATHS"`
	ParamsFolderSecretDetectionEntropy float64 `koanf:"PARAMS_FOLDER_SECRET_DETECTION_ENTROPY"`

	// Secondary Instance
	InfisicalPrimaryInstanceURL string `koanf:"INFISICAL_PRIMARY_INSTANCE_URL"`

	// HSM
	HSMLibPath  string `koanf:"HSM_LIB_PATH"`
	HSMPin      string `koanf:"HSM_PIN"`
	HSMKeyLabel string `koanf:"HSM_KEY_LABEL"`
	HSMSlot     int    `koanf:"HSM_SLOT"`

	// Gateway
	GatewayInfisicalStaticIPAddress string `koanf:"GATEWAY_INFISICAL_STATIC_IP_ADDRESS"`
	GatewayRelayAddress             string `koanf:"GATEWAY_RELAY_ADDRESS"`
	GatewayRelayRealm               string `koanf:"GATEWAY_RELAY_REALM"`
	GatewayRelayAuthSecret          string `koanf:"GATEWAY_RELAY_AUTH_SECRET"`
	RelayAuthSecret                 string `koanf:"RELAY_AUTH_SECRET"`

	// Dynamic Secrets
	DynamicSecretAllowInternalIP      bool   `koanf:"DYNAMIC_SECRET_ALLOW_INTERNAL_IP"`
	DynamicSecretAWSAccessKeyID       string `koanf:"DYNAMIC_SECRET_AWS_ACCESS_KEY_ID"`
	DynamicSecretAWSSecretAccessKey   string `koanf:"DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY"`

	// PAM AWS
	PAMAWSAccessKeyID     string `koanf:"PAM_AWS_ACCESS_KEY_ID"`
	PAMAWSSecretAccessKey string `koanf:"PAM_AWS_SECRET_ACCESS_KEY"`

	// App Connections
	AllowInternalIPConnections bool `koanf:"ALLOW_INTERNAL_IP_CONNECTIONS"`

	// App Connection - AWS
	InfAppConnectionAWSAccessKeyID     string `koanf:"INF_APP_CONNECTION_AWS_ACCESS_KEY_ID"`
	InfAppConnectionAWSSecretAccessKey string `koanf:"INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY"`

	// App Connection - GitHub OAuth
	InfAppConnectionGithubOAuthClientID     string `koanf:"INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID"`
	InfAppConnectionGithubOAuthClientSecret string `koanf:"INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET"`

	// App Connection - GitHub App
	InfAppConnectionGithubAppClientID     string `koanf:"INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID"`
	InfAppConnectionGithubAppClientSecret string `koanf:"INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET"`
	InfAppConnectionGithubAppPrivateKey   string `koanf:"INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY"`
	InfAppConnectionGithubAppSlug         string `koanf:"INF_APP_CONNECTION_GITHUB_APP_SLUG"`
	InfAppConnectionGithubAppID           string `koanf:"INF_APP_CONNECTION_GITHUB_APP_ID"`

	// App Connection - GitHub Radar App
	InfAppConnectionGithubRadarAppClientID     string `koanf:"INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID"`
	InfAppConnectionGithubRadarAppClientSecret string `koanf:"INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET"`
	InfAppConnectionGithubRadarAppPrivateKey   string `koanf:"INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY"`
	InfAppConnectionGithubRadarAppSlug         string `koanf:"INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG"`
	InfAppConnectionGithubRadarAppID           string `koanf:"INF_APP_CONNECTION_GITHUB_RADAR_APP_ID"`
	InfAppConnectionGithubRadarAppWebhookSecret string `koanf:"INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET"`

	// App Connection - GitLab OAuth
	InfAppConnectionGitlabOAuthClientID     string `koanf:"INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID"`
	InfAppConnectionGitlabOAuthClientSecret string `koanf:"INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET"`

	// App Connection - GCP
	InfAppConnectionGCPServiceAccountCredential string `koanf:"INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL"`

	// App Connection - Azure (Legacy)
	InfAppConnectionAzureClientID     string `koanf:"INF_APP_CONNECTION_AZURE_CLIENT_ID"`
	InfAppConnectionAzureClientSecret string `koanf:"INF_APP_CONNECTION_AZURE_CLIENT_SECRET"`

	// App Connection - Azure App Configuration
	InfAppConnectionAzureAppConfigurationClientID     string `koanf:"INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID"`
	InfAppConnectionAzureAppConfigurationClientSecret string `koanf:"INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET"`

	// App Connection - Azure Key Vault
	InfAppConnectionAzureKeyVaultClientID     string `koanf:"INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID"`
	InfAppConnectionAzureKeyVaultClientSecret string `koanf:"INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET"`

	// App Connection - Azure Client Secrets
	InfAppConnectionAzureClientSecretsClientID     string `koanf:"INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID"`
	InfAppConnectionAzureClientSecretsClientSecret string `koanf:"INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET"`

	// App Connection - Azure DevOps
	InfAppConnectionAzureDevOpsClientID     string `koanf:"INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID"`
	InfAppConnectionAzureDevOpsClientSecret string `koanf:"INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET"`

	// App Connection - Heroku
	InfAppConnectionHerokuOAuthClientID     string `koanf:"INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID"`
	InfAppConnectionHerokuOAuthClientSecret string `koanf:"INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET"`

	// Datadog
	ShouldUseDatadogTracer bool   `koanf:"SHOULD_USE_DATADOG_TRACER"`
	DatadogProfilingEnabled bool  `koanf:"DATADOG_PROFILING_ENABLED"`
	DatadogEnv              string `koanf:"DATADOG_ENV"`
	DatadogService          string `koanf:"DATADOG_SERVICE"`
	DatadogHostname         string `koanf:"DATADOG_HOSTNAME"`

	// PIT (Point-in-Time)
	PITCheckpointWindow     string `koanf:"PIT_CHECKPOINT_WINDOW"`
	PITTreeCheckpointWindow string `koanf:"PIT_TREE_CHECKPOINT_WINDOW"`

	// CORS
	CORSAllowedOrigins string `koanf:"CORS_ALLOWED_ORIGINS"`
	CORSAllowedHeaders string `koanf:"CORS_ALLOWED_HEADERS"`

	// OracleDB
	TNSAdmin string `koanf:"TNS_ADMIN"`

	// Internal
	InternalRegion string `koanf:"INTERNAL_REGION"`

	// Development flags
	RotationDevelopmentMode                  bool `koanf:"ROTATION_DEVELOPMENT_MODE"`
	DailyResourceCleanUpDevelopmentMode      bool `koanf:"DAILY_RESOURCE_CLEAN_UP_DEVELOPMENT_MODE"`
	BDDNockAPIEnabled                        bool `koanf:"BDD_NOCK_API_ENABLED"`
	ACMEDevelopmentMode                      bool `koanf:"ACME_DEVELOPMENT_MODE"`
	ACMESkipUpstreamValidation               bool `koanf:"ACME_SKIP_UPSTREAM_VALIDATION"`
	ACMEDevelopmentHTTP01ChallengeHostOverrides string `koanf:"ACME_DEVELOPMENT_HTTP01_CHALLENGE_HOST_OVERRIDES"`
	ACMEDNSResolverServers                   string `koanf:"ACME_DNS_RESOLVER_SERVERS"`
	ACMEDNSResolveResolverServersHostEnabled bool   `koanf:"ACME_DNS_RESOLVE_RESOLVER_SERVERS_HOST_ENABLED"`
	DNSMadeEasySandboxEnabled                bool   `koanf:"DNS_MADE_EASY_SANDBOX_ENABLED"`

	// Derived (not from env)
	IsCloud                        bool
	IsSmtpConfigured               bool
	IsRedisConfigured              bool
	IsClickHouseConfigured         bool
	IsDevelopmentMode              bool
	IsTestMode                     bool
	IsProductionMode               bool
	IsRedisSentinelMode            bool
	IsSecondaryInstance            bool
	IsHsmConfigured                bool
	IsSecretScanningConfigured     bool
	IsSecretScanningV2Configured   bool
	ParsedDBReadReplicas           []ParsedDBReadReplica
	ParsedRedisSentinelHosts       []RedisHostPort
	ParsedRedisClusterHosts        []RedisHostPort
	ParsedRedisReadReplicas        []RedisHostPort
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
	k := koanf.New("")

	// Defaults matching the Node.js backend.
	k.Set("NODE_ENV", string(NodeEnvProduction))
	k.Set("PORT", 4000)
	k.Set("HOST", "localhost")
	k.Set("LOG_LEVEL", "info")
	k.Set("DB_PORT", "5432")
	k.Set("SMTP_PORT", 587)
	k.Set("SMTP_FROM_NAME", "Infisical")
	k.Set("SMTP_REQUIRE_TLS", true)
	k.Set("SMTP_TLS_REJECT_UNAUTHORIZED", true)
	k.Set("TELEMETRY_ENABLED", true)
	k.Set("POSTHOG_HOST", "https://app.posthog.com")
	k.Set("POSTHOG_PROJECT_API_KEY", "phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE")
	k.Set("SALT_ROUNDS", 10)
	k.Set("MAX_LEASE_LIMIT", 10000)
	k.Set("QUEUE_WORKERS_ENABLED", true)
	k.Set("JWT_AUTH_LIFETIME", "10d")
	k.Set("JWT_SIGNUP_LIFETIME", "15m")
	k.Set("JWT_REFRESH_LIFETIME", "90d")
	k.Set("JWT_INVITE_LIFETIME", "1d")
	k.Set("JWT_MFA_LIFETIME", "5m")
	k.Set("JWT_PROVIDER_AUTH_LIFETIME", "15m")
	k.Set("REDIS_SENTINEL_MASTER_NAME", "mymaster")
	k.Set("LICENSE_SERVER_URL", "https://portal.infisical.com")
	k.Set("SECRET_SCANNING_GIT_APP_SLUG", "infisical-radar")
	k.Set("URL_GITLAB_URL", "https://gitlab.com")
	k.Set("OTEL_OTLP_PUSH_INTERVAL", 30000)
	k.Set("SSL_CLIENT_CERTIFICATE_HEADER_KEY", "x-ssl-client-cert")
	k.Set("IDENTITY_TLS_CERT_AUTH_CLIENT_CERTIFICATE_HEADER_KEY", "x-identity-tls-cert-auth-client-cert")
	k.Set("ENABLE_MSSQL_SECRET_ROTATION_ENCRYPT", true)
	k.Set("CLICKHOUSE_AUDIT_LOG_ENGINE", "ReplacingMergeTree")
	k.Set("CLICKHOUSE_AUDIT_LOG_TABLE_NAME", "audit_logs")
	k.Set("CLICKHOUSE_AUDIT_LOG_ENABLED", true)
	k.Set("DATADOG_ENV", "prod")
	k.Set("DATADOG_SERVICE", "infisical-core")
	k.Set("PIT_CHECKPOINT_WINDOW", "100")
	k.Set("PIT_TREE_CHECKPOINT_WINDOW", "200")
	k.Set("PARAMS_FOLDER_SECRET_DETECTION_ENTROPY", 3.7)
	k.Set("HSM_SLOT", 0)

	// In non-production, load .env file if it exists.
	nodeEnv := os.Getenv("NODE_ENV")
	if nodeEnv != string(NodeEnvProduction) {
		if err := k.Load(file.Provider(".env"), dotenv.Parser()); err != nil {
			if !os.IsNotExist(err) {
				slog.Debug("could not load .env file", "error", err)
			}
		}
	}

	// Load environment variables (no prefix, matching Node.js backend).
	err := k.Load(envprovider.Provider("", envprovider.Opt{}), nil)
	if err != nil {
		return nil, fmt.Errorf("loading env vars: %w", err)
	}

	var cfg Config
	if err := k.Unmarshal("", &cfg); err != nil {
		return nil, fmt.Errorf("unmarshalling config: %w", err)
	}

	// Validate required fields.
	if issues := cfg.validate(); len(issues) > 0 {
		return nil, &ValidationError{Issues: issues}
	}

	// Compute derived fields.
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

	// Azure fallbacks (legacy single app → per-service apps).
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

	// Heroku fallback.
	if cfg.InfAppConnectionHerokuOAuthClientID == "" {
		cfg.InfAppConnectionHerokuOAuthClientID = cfg.ClientIDHeroku
	}
	if cfg.InfAppConnectionHerokuOAuthClientSecret == "" {
		cfg.InfAppConnectionHerokuOAuthClientSecret = cfg.ClientSecretHeroku
	}

	// Parse DB_READ_REPLICAS JSON: [{ "DB_CONNECTION_URI": "...", "DB_ROOT_CERT": "..." }, ...]
	if cfg.DBReadReplicas != "" {
		if err := json.Unmarshal([]byte(cfg.DBReadReplicas), &cfg.ParsedDBReadReplicas); err != nil {
			return nil, fmt.Errorf("parsing DB_READ_REPLICAS: %w", err)
		}
	}

	// Parse comma-separated host:port lists for Redis Sentinel, Cluster, and Read Replicas.
	if cfg.RedisSentinelHosts != "" {
		cfg.ParsedRedisSentinelHosts = parseHostPortList(cfg.RedisSentinelHosts)
	}
	if cfg.RedisClusterHosts != "" {
		cfg.ParsedRedisClusterHosts = parseHostPortList(cfg.RedisClusterHosts)
	}
	if cfg.RedisReadReplicas != "" {
		cfg.ParsedRedisReadReplicas = parseHostPortList(cfg.RedisReadReplicas)
	}

	return &cfg, nil
}

// ValidationError holds a list of config validation issues.
type ValidationError struct {
	Issues []string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("invalid environment variables:\n  - %s", strings.Join(e.Issues, "\n  - "))
}

// parseHostPortList parses a comma-separated "host:port" string into []RedisHostPort.
// Matches the Node.js transform: val.split(",").map(el => { host, port }).
func parseHostPortList(raw string) []RedisHostPort {
	var result []RedisHostPort
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		host, portStr, found := strings.Cut(entry, ":")
		hp := RedisHostPort{Host: strings.TrimSpace(host)}
		if found {
			fmt.Sscanf(strings.TrimSpace(portStr), "%d", &hp.Port)
		}
		result = append(result, hp)
	}
	return result
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
