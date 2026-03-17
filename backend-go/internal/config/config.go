package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/knadh/koanf/parsers/dotenv"
	envprovider "github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

type NodeEnv string

const (
	NodeEnvDevelopment NodeEnv = "development"
	NodeEnvTest        NodeEnv = "test"
	NodeEnvProduction  NodeEnv = "production"
)

type Config struct {
	// Server
	NodeEnv NodeEnv `koanf:"NODE_ENV"`
	Port    int     `koanf:"PORT"`
	Host    string  `koanf:"HOST"`

	// Logging
	LogLevel string `koanf:"LOG_LEVEL"`

	// Database
	DBConnectionURI string `koanf:"DB_CONNECTION_URI"`
	DBRootCert      string `koanf:"DB_ROOT_CERT"`
	DBHost          string `koanf:"DB_HOST"`
	DBPort          string `koanf:"DB_PORT"`
	DBUser          string `koanf:"DB_USER"`
	DBPassword      string `koanf:"DB_PASSWORD"`
	DBName          string `koanf:"DB_NAME"`

	// Redis
	RedisURL string `koanf:"REDIS_URL"`

	// Encryption
	EncryptionKey     string `koanf:"ENCRYPTION_KEY"`
	RootEncryptionKey string `koanf:"ROOT_ENCRYPTION_KEY"`

	// Auth
	AuthSecret string `koanf:"AUTH_SECRET"`

	// Site
	SiteURL      string `koanf:"SITE_URL"`
	HTTPSEnabled bool   `koanf:"HTTPS_ENABLED"`

	// Telemetry
	TelemetryEnabled bool `koanf:"TELEMETRY_ENABLED"`

	// SMTP
	SMTPHost     string `koanf:"SMTP_HOST"`
	SMTPPort     int    `koanf:"SMTP_PORT"`
	SMTPUsername string `koanf:"SMTP_USERNAME"`
	SMTPPassword string `koanf:"SMTP_PASSWORD"`

	// Derived (not from env)
	IsCloud           bool
	IsSmtpConfigured  bool
	IsRedisConfigured bool
	IsDevelopmentMode bool
	IsProductionMode  bool
}

func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func (c *Config) SlogLevel() slog.Level {
	switch strings.ToLower(c.LogLevel) {
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
	k.Set("TELEMETRY_ENABLED", true)

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
	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("config validation: %w", err)
	}

	// Compute derived fields.
	cfg.IsDevelopmentMode = cfg.NodeEnv == NodeEnvDevelopment
	cfg.IsProductionMode = cfg.NodeEnv == NodeEnvProduction
	cfg.IsRedisConfigured = cfg.RedisURL != ""
	cfg.IsSmtpConfigured = cfg.SMTPHost != ""

	return &cfg, nil
}

func (c *Config) validate() error {
	var errs []error

	// NODE_ENV must be a known value.
	switch c.NodeEnv {
	case NodeEnvDevelopment, NodeEnvTest, NodeEnvProduction:
	default:
		errs = append(errs, fmt.Errorf("NODE_ENV must be one of: development, test, production (got %q)", c.NodeEnv))
	}

	if c.Port <= 0 || c.Port > 65535 {
		errs = append(errs, fmt.Errorf("PORT must be between 1 and 65535 (got %d)", c.Port))
	}

	// DB_CONNECTION_URI is required unless individual DB fields are all set.
	if c.DBConnectionURI == "" {
		if c.DBHost == "" || c.DBUser == "" || c.DBName == "" {
			errs = append(errs, fmt.Errorf("DB_CONNECTION_URI is required (or set DB_HOST, DB_USER, and DB_NAME)"))
		}
	}

	if c.RedisURL == "" {
		errs = append(errs, fmt.Errorf("REDIS_URL is required"))
	}

	if c.EncryptionKey == "" && c.RootEncryptionKey == "" {
		errs = append(errs, fmt.Errorf("either ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY is required"))
	}

	if c.AuthSecret == "" {
		errs = append(errs, fmt.Errorf("AUTH_SECRET is required"))
	}

	return errors.Join(errs...)
}
