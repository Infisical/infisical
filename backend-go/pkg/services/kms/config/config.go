package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/caarlos0/env/v11"
	internalConfig "github.com/infisical/api/internal/config"
)

type NodeEnv string

const (
	NodeEnvDevelopment NodeEnv = "development"
	NodeEnvTest        NodeEnv = "test"
	NodeEnvProduction  NodeEnv = "production"
)

// Config contains the environment and derived settings required by the KMS service.
type Config struct {
	InfisicalPlatformVersion               string  `env:"INFISICAL_PLATFORM_VERSION" envDefault:""`
	KubernetesAutoFetchServiceAccountToken bool    `env:"KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN" envDefault:"false"`
	NodeEnv                                NodeEnv `env:"NODE_ENV" envDefault:"production"`

	StandaloneMode  bool `env:"STANDALONE_MODE" envDefault:"false"`
	InfisicalCloud  bool `env:"INFISICAL_CLOUD" envDefault:"false"`
	MaintenanceMode bool `env:"MAINTENANCE_MODE" envDefault:"false"`

	// KMS gRPC server settings
	KMSGRPCAddr          string `env:"KMS_GRPC_ADDR" envDefault:"127.0.0.1"`
	KMSGRPCPort          string `env:"KMS_GRPC_PORT" envDefault:"4040"`
	KMSGRPCTLSEnabled    bool   `env:"KMS_GRPC_TLS_ENABLED" envDefault:"false"`
	KMSGRPCTLSCACert     string `env:"KMS_GRPC_TLS_CA_CERT" envDefault:""`
	KMSGRPCTLSClientCert string `env:"KMS_GRPC_TLS_CLIENT_CERT" envDefault:""`
	KMSGRPCTLSClientKey  string `env:"KMS_GRPC_TLS_CLIENT_KEY" envDefault:""`
	KMSGRPCTLSServerName string `env:"KMS_GRPC_TLS_SERVER_NAME" envDefault:""`
	KMSAuthHeader        string `env:"KMS_AUTH_HEADER" envDefault:""`
	// todo : allow empty or validate for min
	KMSAuthSecret string `env:"KMS_AUTH_SECRET" envDefault:""`

	DBConnectionURI   string `env:"DB_CONNECTION_URI" envDefault:""`
	DBRootCert        string `env:"DB_ROOT_CERT" envDefault:""`
	DBHost            string `env:"DB_HOST" envDefault:""`
	DBPort            string `env:"DB_PORT" envDefault:"5432"`
	DBUser            string `env:"DB_USER" envDefault:""`
	DBPassword        string `env:"DB_PASSWORD" envDefault:""`
	DBName            string `env:"DB_NAME" envDefault:""`
	DBReadReplicasRaw string `env:"DB_READ_REPLICAS" envDefault:""`

	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`

	RedisURL                                string `env:"REDIS_URL" envDefault:""`
	RedisUsername                           string `env:"REDIS_USERNAME" envDefault:""`
	RedisPassword                           string `env:"REDIS_PASSWORD" envDefault:""`
	RedisSentinelHosts                      string `env:"REDIS_SENTINEL_HOSTS" envDefault:""`
	RedisSentinelMasterName                 string `env:"REDIS_SENTINEL_MASTER_NAME" envDefault:"mymaster"`
	RedisSentinelEnableTLS                  bool   `env:"REDIS_SENTINEL_ENABLE_TLS" envDefault:"false"`
	RedisSentinelUsername                   string `env:"REDIS_SENTINEL_USERNAME" envDefault:""`
	RedisSentinelPassword                   string `env:"REDIS_SENTINEL_PASSWORD" envDefault:""`
	RedisClusterHosts                       string `env:"REDIS_CLUSTER_HOSTS" envDefault:""`
	RedisClusterEnableTLS                   bool   `env:"REDIS_CLUSTER_ENABLE_TLS" envDefault:"false"`
	RedisClusterAWSElastiCacheDNSLookupMode bool   `env:"REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE" envDefault:"false"`
	RedisReadReplicas                       string `env:"REDIS_READ_REPLICAS" envDefault:""`

	HSMLibPath  string `env:"HSM_LIB_PATH" envDefault:""`
	HSMPin      string `env:"HSM_PIN" envDefault:""`
	HSMKeyLabel string `env:"HSM_KEY_LABEL" envDefault:""`
	HSMSlot     int    `env:"HSM_SLOT" envDefault:"0"`

	LicenseServerURL  string `env:"LICENSE_SERVER_URL" envDefault:"https://portal.infisical.com"`
	LicenseServerKey  string `env:"LICENSE_SERVER_KEY" envDefault:""`
	LicenseKey        string `env:"LICENSE_KEY" envDefault:""`
	LicenseKeyOffline string `env:"LICENSE_KEY_OFFLINE" envDefault:""`

	EncryptionKey     string `env:"ENCRYPTION_KEY" envDefault:""`
	RootEncryptionKey string `env:"ROOT_ENCRYPTION_KEY" envDefault:""`
	FipsEnabled       bool   `env:"FIPS_ENABLED" envDefault:"false"`

	SiteURL      string `env:"SITE_URL" envDefault:""`
	HTTPSEnabled bool   `env:"HTTPS_ENABLED" envDefault:"false"`

	TelemetryEnabled bool `env:"TELEMETRY_ENABLED" envDefault:"true"`
	SaltRounds       int  `env:"SALT_ROUNDS" envDefault:"10"`

	RotationDevelopmentMode             bool `env:"ROTATION_DEVELOPMENT_MODE" envDefault:"false"`
	DailyResourceCleanUpDevelopmentMode bool `env:"DAILY_RESOURCE_CLEAN_UP_DEVELOPMENT_MODE" envDefault:"false"`

	DisableCache             bool   `env:"DISABLE_CACHE" envDefault:"false"`
	DisableRaft              bool   `env:"DISABLE_RAFT" envDefault:"true"`
	RaftNodeID               uint64 `env:"RAFT_NODE_ID" envDefault:"0"`
	RaftPeersRaw             string `env:"RAFT_PEERS" envDefault:""`
	RaftWALDir               string `env:"RAFT_WAL_DIR" envDefault:""`
	RaftSnapshotDir          string `env:"RAFT_SNAPSHOT_DIR" envDefault:""`
	RaftClusterBootstrapDone bool   `env:"RAFT_CLUSTER_BOOTSTRAP_DONE" envDefault:"false"`

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
	DBReadReplicas               []internalConfig.DBReadReplica
	ParsedRedisSentinelHosts     []internalConfig.RedisHostPort
	ParsedRedisClusterHosts      []internalConfig.RedisHostPort
	ParsedRedisReadReplicas      []internalConfig.RedisHostPort
	RaftPeers                    []string
}

func (c *Config) Addr() string {
	return net.JoinHostPort(strings.TrimSpace(c.KMSGRPCAddr), strings.TrimSpace(c.KMSGRPCPort))
}

func GetConfiguredSlogLevel() slog.Level {
	var cfg struct {
		LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	}
	if err := env.Parse(&cfg); err != nil {
		return slog.LevelInfo
	}
	switch strings.ToLower(cfg.LogLevel) {
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

// Validate checks the configuration values that must be valid before startup.
func (c *Config) Validate() error {
	if c.NodeEnv != NodeEnvDevelopment && c.NodeEnv != NodeEnvTest && c.NodeEnv != NodeEnvProduction {
		return fmt.Errorf("NODE_ENV must be one of: development, test, production (got %q)", c.NodeEnv)
	}
	if c.DBConnectionURI == "" && (c.DBHost == "" || c.DBUser == "" || c.DBName == "") {
		return fmt.Errorf("DB_CONNECTION_URI is required, or set DB_HOST, DB_USER, and DB_NAME")
	}
	if c.RedisURL == "" && c.RedisSentinelHosts == "" && c.RedisClusterHosts == "" {
		return fmt.Errorf("either REDIS_URL, REDIS_SENTINEL_HOSTS, or REDIS_CLUSTER_HOSTS is required")
	}
	if c.EncryptionKey == "" && c.RootEncryptionKey == "" {
		return fmt.Errorf("either ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY is required")
	}
	grpcAddr := strings.TrimSpace(c.KMSGRPCAddr)
	if grpcAddr == "" {
		return fmt.Errorf("KMS_GRPC_ADDR must not be empty")
	}
	grpcPort := strings.TrimSpace(c.KMSGRPCPort)
	port, err := strconv.Atoi(grpcPort)
	if err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("KMS_GRPC_PORT must be a number between 1 and 65535 (got %q)", grpcPort)
	}
	if !c.DisableCache && !c.DisableRaft {
		if c.RaftNodeID == 0 {
			return fmt.Errorf("RAFT_NODE_ID must be greater than zero when Raft is enabled")
		}
		if len(c.RaftPeers) == 0 {
			return fmt.Errorf("RAFT_PEERS must contain at least one peer URL when Raft is enabled")
		}
		for _, peer := range c.RaftPeers {
			peerURL, err := url.Parse(peer)
			if err != nil || peerURL.Scheme == "" || peerURL.Host == "" {
				return fmt.Errorf("RAFT_PEERS contains an invalid peer URL %q", peer)
			}
		}
		if c.RaftNodeID > uint64(len(c.RaftPeers)) {
			return fmt.Errorf("RAFT_NODE_ID %d exceeds the %d configured RAFT_PEERS", c.RaftNodeID, len(c.RaftPeers))
		}
		if strings.TrimSpace(c.RaftWALDir) == "" {
			return fmt.Errorf("RAFT_WAL_DIR is required when Raft is enabled")
		}
		if strings.TrimSpace(c.RaftSnapshotDir) == "" {
			return fmt.Errorf("RAFT_SNAPSHOT_DIR is required when Raft is enabled")
		}
	}
	return nil
}

func LoadConfig() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parse environment: %w", err)
	}
	if cfg.RaftPeersRaw != "" {
		for _, peer := range strings.Split(cfg.RaftPeersRaw, ",") {
			if peer = strings.TrimSpace(peer); peer != "" {
				cfg.RaftPeers = append(cfg.RaftPeers, peer)
			}
		}
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	// Compute derived fields
	cfg.IsDevelopmentMode = cfg.NodeEnv == NodeEnvDevelopment
	cfg.IsTestMode = cfg.NodeEnv == NodeEnvTest
	cfg.IsProductionMode = cfg.NodeEnv == NodeEnvProduction
	cfg.IsCloud = cfg.InfisicalCloud
	cfg.IsRedisConfigured = cfg.RedisURL != "" || cfg.RedisSentinelHosts != "" || cfg.RedisClusterHosts != ""
	cfg.IsRedisSentinelMode = cfg.RedisSentinelHosts != ""
	cfg.IsHsmConfigured = cfg.HSMLibPath != "" && cfg.HSMPin != "" && cfg.HSMKeyLabel != ""

	if cfg.DBReadReplicasRaw != "" {
		if err := json.Unmarshal([]byte(cfg.DBReadReplicasRaw), &cfg.DBReadReplicas); err != nil {
			return nil, fmt.Errorf("parse DB_READ_REPLICAS: %w", err)
		}
	}

	var parseIssues []string
	if cfg.RedisSentinelHosts != "" {
		var issues []string
		cfg.ParsedRedisSentinelHosts, issues = internalConfig.ParseHostPortList(cfg.RedisSentinelHosts, "REDIS_SENTINEL_HOSTS")
		parseIssues = append(parseIssues, issues...)
	}
	if cfg.RedisClusterHosts != "" {
		var issues []string
		cfg.ParsedRedisClusterHosts, issues = internalConfig.ParseHostPortList(cfg.RedisClusterHosts, "REDIS_CLUSTER_HOSTS")
		parseIssues = append(parseIssues, issues...)
	}
	if cfg.RedisReadReplicas != "" {
		var issues []string
		cfg.ParsedRedisReadReplicas, issues = internalConfig.ParseHostPortList(cfg.RedisReadReplicas, "REDIS_READ_REPLICAS")
		parseIssues = append(parseIssues, issues...)
	}
	if len(parseIssues) > 0 {
		return nil, &internalConfig.ValidationError{Issues: parseIssues}
	}
	return cfg, nil
}
