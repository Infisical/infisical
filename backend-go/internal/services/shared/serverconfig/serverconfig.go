package serverconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/infisical/api/internal/database/pg/gen/model"
)

const (
	// AdminConfigDBUUID is the fixed UUID for the single super_admin config row.
	AdminConfigDBUUID = "00000000-0000-0000-0000-000000000000"

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

	if m.Initialized != nil {
		cfg.Initialized = *m.Initialized
	}
	if m.AllowSignUp != nil {
		cfg.AllowSignUp = *m.AllowSignUp
	}
	if m.AllowedSignUpDomain != nil {
		cfg.AllowedSignUpDomain = *m.AllowedSignUpDomain
	}
	if m.TrustSamlEmails != nil {
		cfg.TrustSamlEmails = *m.TrustSamlEmails
	}
	if m.TrustLdapEmails != nil {
		cfg.TrustLdapEmails = *m.TrustLdapEmails
	}
	if m.TrustOidcEmails != nil {
		cfg.TrustOidcEmails = *m.TrustOidcEmails
	}
	if m.DefaultAuthOrgId != nil {
		cfg.DefaultAuthOrgID = m.DefaultAuthOrgId
	}
	if m.EnabledLoginMethods != nil {
		cfg.EnabledLoginMethods = []string(*m.EnabledLoginMethods)
	}
	if m.AuthConsentContent != nil {
		cfg.AuthConsentContent = *m.AuthConsentContent
	}
	if m.PageFrameContent != nil {
		cfg.PageFrameContent = *m.PageFrameContent
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
	FindByID(ctx context.Context, id string) (*model.SuperAdmin, error)
	FindOrCreateConfig(ctx context.Context) (*model.SuperAdmin, error)
	UpdateByID(ctx context.Context, id string, columns pq.StringArray, data *model.SuperAdmin) (*model.SuperAdmin, error)
}

// SharedService manages the server admin configuration (the single super_admin row).
// It provides cached reads (via Redis) and idempotent initialization (via PG advisory lock).
type SharedService struct {
	dal      dal
	keyStore keyStore
}

// NewSharedService creates a new server config service.
func NewSharedService(dal dal, ks keyStore) *SharedService {
	return &SharedService{
		dal:      dal,
		keyStore: ks,
	}
}

// Init ensures the super_admin config row exists.
// Delegates to the DAL which handles the advisory lock and transaction internally.
func (s *SharedService) Init(ctx context.Context) (ServerConfig, error) {
	s.keyStore.DeleteItem(ctx, adminConfigCacheKey)

	m, err := s.dal.FindOrCreateConfig(ctx)
	if err != nil {
		return ServerConfig{}, err
	}
	return configFromModel(m), nil
}

// GetConfig returns the server admin config, using a Redis cache with a 60s TTL.
// On cache miss, it reads from the database and populates the cache.
func (s *SharedService) GetConfig(ctx context.Context) (ServerConfig, error) {
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
	m, err := s.dal.FindByID(ctx, AdminConfigDBUUID)
	if err != nil {
		return ServerConfig{}, fmt.Errorf("reading config from database: %w", err)
	}

	cfg := configFromModel(m)

	// Populate cache (non-fatal on error).
	if data, err := json.Marshal(cfg); err == nil {
		s.keyStore.SetItemWithExpiry(ctx, adminConfigCacheKey, adminConfigCacheTTL, string(data))
	}

	return cfg, nil
}

// InvalidateCache removes the config from the Redis cache.
func (s *SharedService) InvalidateCache(ctx context.Context) error {
	_, err := s.keyStore.DeleteItem(ctx, adminConfigCacheKey)
	return err
}
