package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/knadh/koanf/parsers/dotenv"
	envprovider "github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

type AppEnv string

const (
	Development AppEnv = "development"
	Production  AppEnv = "production"
)

type Config struct {
	AppEnv   AppEnv `koanf:"app_env"`
	HTTPHost string `koanf:"http_host"`
	HTTPPort int    `koanf:"http_port"`
	LogLevel string `koanf:"log_level"`
}

func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.HTTPHost, c.HTTPPort)
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
	// No delimiter — all keys are flat (e.g. "http_port", not nested).
	k := koanf.New("")

	// Set defaults.
	k.Set("app_env", string(Development))
	k.Set("http_host", "0.0.0.0")
	k.Set("http_port", 8080)
	k.Set("log_level", "info")

	// In non-production, load .env file if it exists.
	appEnv := os.Getenv("INFISICAL_APP_ENV")
	if appEnv != string(Production) {
		if err := k.Load(file.Provider(".env"), dotenv.Parser()); err != nil {
			if !os.IsNotExist(err) {
				slog.Debug("could not load .env file", "error", err)
			}
		}
	}

	// Load environment variables with INFISICAL_ prefix.
	// INFISICAL_HTTP_PORT -> http_port
	err := k.Load(envprovider.Provider("", envprovider.Opt{}), nil)
	if err != nil {
		return nil, fmt.Errorf("loading env vars: %w", err)
	}

	var cfg Config
	if err := k.Unmarshal("", &cfg); err != nil {
		return nil, fmt.Errorf("unmarshalling config: %w", err)
	}

	return &cfg, nil
}
