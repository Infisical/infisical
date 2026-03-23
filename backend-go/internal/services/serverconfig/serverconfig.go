package serverconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/infisical/api/internal/database/pg/gen/model"
	"github.com/infisical/api/internal/libs/errutil"
)

var adminConfigDBUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

const (
	// AdminConfigDBUUID is the fixed UUID for the single super_admin config row.

	// PgLockSuperAdminInit is the advisory lock ID used during config initialization.
	PgLockSuperAdminInit int64 = 2024

	adminConfigCacheKey = "infisical-admin-cfg"
	adminConfigCacheTTL = 60 * time.Second
)

// ServerConfig is the service-level representation of the server admin configuration.
type ServerConfig struct {
	ID                  uuid.UUID
	Initialized         bool
	AllowSignUp         bool
	CreatedAt           time.Time
	UpdatedAt           time.Time
	AllowedSignUpDomain string
	InstanceID          uuid.UUID
	TrustSamlEmails     bool
	TrustLdapEmails     bool
	TrustOidcEmails     bool
	DefaultAuthOrgID    *uuid.UUID
	EnabledLoginMethods []string
	AuthConsentContent  string
	PageFrameContent    string
	AdminIdentityIDs    []string
	FipsEnabled         bool
}

func configFromModel(m *model.SuperAdmin) ServerConfig {
	cfg := ServerConfig{
		ID:          m.ID,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
		InstanceID:  m.InstanceId,
		FipsEnabled: m.FipsEnabled,
	}

	if m.Initialized.Valid {
		cfg.Initialized = m.Initialized.V
	}
	if m.AllowSignUp.Valid {
		cfg.AllowSignUp = m.AllowSignUp.V
	}
	if m.AllowedSignUpDomain.Valid {
		cfg.AllowedSignUpDomain = m.AllowedSignUpDomain.V
	}
	if m.TrustSamlEmails.Valid {
		cfg.TrustSamlEmails = m.TrustSamlEmails.V
	}
	if m.TrustLdapEmails.Valid {
		cfg.TrustLdapEmails = m.TrustLdapEmails.V
	}
	if m.TrustOidcEmails.Valid {
		cfg.TrustOidcEmails = m.TrustOidcEmails.V
	}
	if m.DefaultAuthOrgId.Valid {
		cfg.DefaultAuthOrgID = &m.DefaultAuthOrgId.V
	}
	if m.EnabledLoginMethods != nil {
		cfg.EnabledLoginMethods = []string(*m.EnabledLoginMethods)
	}
	if m.AuthConsentContent.Valid {
		cfg.AuthConsentContent = m.AuthConsentContent.V
	}
	if m.PageFrameContent.Valid {
		cfg.PageFrameContent = m.PageFrameContent.V
	}
	if m.AdminIdentityIds != nil {
		cfg.AdminIdentityIDs = []string(*m.AdminIdentityIds)
	}

	return cfg
}

// keyStore defines the subset of keystore operations this service needs.
type keyStore interface {
	GetItem(ctx context.Context, key string) (string, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	DeleteItem(ctx context.Context, key string) (int64, error)
}

// dal defines the subset of DAL operations this service needs.
type dal interface {
	FindByID(ctx context.Context, id uuid.UUID) (*model.SuperAdmin, error)
	FindOrCreateConfig(ctx context.Context) (*model.SuperAdmin, error)
	UpdateByID(ctx context.Context, id string, columns pq.StringArray, data *model.SuperAdmin) (*model.SuperAdmin, error)
}

// Service manages the server admin configuration (the single super_admin row).
// It provides cached reads (via Redis) and idempotent initialization (via PG advisory lock).
type Service struct {
	dal      dal
	keyStore keyStore
	logger   *slog.Logger
}

// Deps holds the dependencies for the server config shared service.
type Deps struct {
	DAL      dal
	KeyStore keyStore
}

// NewService creates a new server config service.
func NewService(logger *slog.Logger, deps Deps) *Service {
	return &Service{
		dal:      deps.DAL,
		keyStore: deps.KeyStore,
		logger:   logger,
	}
}

// Init ensures the super_admin config row exists.
// Delegates to the DAL which handles the advisory lock and transaction internally.
func (s *Service) Init(ctx context.Context) (ServerConfig, error) {
	if _, err := s.keyStore.DeleteItem(ctx, adminConfigCacheKey); err != nil {
		return ServerConfig{}, fmt.Errorf("deleting config from cache: %w", err)
	}

	m, err := s.dal.FindOrCreateConfig(ctx)
	if err != nil {
		return ServerConfig{}, errutil.DatabaseErr("Failed to initialize server config").WithErr(err)
	}
	return configFromModel(m), nil
}

// GetConfig returns the server admin config, using a Redis cache with a 60s TTL.
// On cache miss, it reads from the database and populates the cache.
func (s *Service) GetConfig(ctx context.Context) (ServerConfig, error) {
	cached, err := s.keyStore.GetItem(ctx, adminConfigCacheKey)
	if err != nil {
		return ServerConfig{}, fmt.Errorf("reading config from cache: %w", err)
	}

	if cached != "" {
		var cfg ServerConfig
		if err := json.Unmarshal([]byte(cached), &cfg); err != nil {
			return ServerConfig{}, fmt.Errorf("unmarshaling cached config: %w", err)
		}
		return cfg, nil
	}

	// Cache miss — read from DB.
	m, err := s.dal.FindByID(ctx, adminConfigDBUUID)
	if err != nil {
		return ServerConfig{}, errutil.DatabaseErr("Failed to read server config").WithErr(err)
	}

	cfg := configFromModel(m)

	// Populate cache (non-fatal on error).
	if data, err := json.Marshal(cfg); err == nil {
		if err := s.keyStore.SetItemWithExpiry(ctx, adminConfigCacheKey, adminConfigCacheTTL, string(data)); err != nil {
			s.logger.ErrorContext(ctx, "setting config in cache", slog.Any("error", err))
		}
	}

	return cfg, nil
}

// InvalidateCache removes the config from the Redis cache.
func (s *Service) InvalidateCache(ctx context.Context) error {
	_, err := s.keyStore.DeleteItem(ctx, adminConfigCacheKey)
	return err
}
