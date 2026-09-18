package serverconfig

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
)

var adminConfigDBUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

const (
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

// superAdminRow is the raw database row for super_admin.
type superAdminRow struct {
	ID                  uuid.UUID
	Initialized         sql.Null[bool]
	AllowSignUp         sql.Null[bool]
	CreatedAt           time.Time
	UpdatedAt           time.Time
	AllowedSignUpDomain sql.Null[string]
	InstanceID          uuid.UUID
	TrustSamlEmails     sql.Null[bool]
	TrustLdapEmails     sql.Null[bool]
	TrustOidcEmails     sql.Null[bool]
	DefaultAuthOrgID    sql.Null[uuid.UUID]
	EnabledLoginMethods []string
	AuthConsentContent  sql.Null[string]
	PageFrameContent    sql.Null[string]
	AdminIdentityIDs    []string
	FipsEnabled         bool
}

func configFromRow(r *superAdminRow) ServerConfig {
	cfg := ServerConfig{
		ID:          r.ID,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
		InstanceID:  r.InstanceID,
		FipsEnabled: r.FipsEnabled,
	}

	if r.Initialized.Valid {
		cfg.Initialized = r.Initialized.V
	}
	if r.AllowSignUp.Valid {
		cfg.AllowSignUp = r.AllowSignUp.V
	}
	if r.AllowedSignUpDomain.Valid {
		cfg.AllowedSignUpDomain = r.AllowedSignUpDomain.V
	}
	if r.TrustSamlEmails.Valid {
		cfg.TrustSamlEmails = r.TrustSamlEmails.V
	}
	if r.TrustLdapEmails.Valid {
		cfg.TrustLdapEmails = r.TrustLdapEmails.V
	}
	if r.TrustOidcEmails.Valid {
		cfg.TrustOidcEmails = r.TrustOidcEmails.V
	}
	if r.DefaultAuthOrgID.Valid {
		cfg.DefaultAuthOrgID = &r.DefaultAuthOrgID.V
	}
	if r.EnabledLoginMethods != nil {
		cfg.EnabledLoginMethods = r.EnabledLoginMethods
	}
	if r.AuthConsentContent.Valid {
		cfg.AuthConsentContent = r.AuthConsentContent.V
	}
	if r.PageFrameContent.Valid {
		cfg.PageFrameContent = r.PageFrameContent.V
	}
	if r.AdminIdentityIDs != nil {
		cfg.AdminIdentityIDs = r.AdminIdentityIDs
	}

	return cfg
}

// keyStore defines the subset of keystore operations this service needs.
type keyStore interface {
	GetItem(ctx context.Context, key string) (string, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	DeleteItem(ctx context.Context, key string) (int64, error)
}

// Service manages the server admin configuration (the single super_admin row).
// It provides cached reads (via Redis) and idempotent initialization (via PG advisory lock).
type Service struct {
	db       pg.DB
	keyStore keyStore
	logger   *slog.Logger
}

// Deps holds the dependencies for the server config shared service.
type Deps struct {
	DB       pg.DB
	KeyStore keyStore
}

// NewService creates a new server config service.
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		db:       deps.DB,
		keyStore: deps.KeyStore,
		logger:   logger,
	}
}

// Init ensures the super_admin config row exists.
// Uses a PG advisory lock to prevent concurrent initialization.
func (s *Service) Init(ctx context.Context) (ServerConfig, error) {
	if _, err := s.keyStore.DeleteItem(ctx, adminConfigCacheKey); err != nil {
		return ServerConfig{}, fmt.Errorf("deleting config from cache: %w", err)
	}

	cfg, err := s.findOrCreateConfig(ctx)
	if err != nil {
		return ServerConfig{}, errutil.DatabaseErr("Failed to initialize server config").WithErrf("Init: %w", err)
	}
	return cfg, nil
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
	row, err := s.findByID(ctx, adminConfigDBUUID)
	if err != nil {
		return ServerConfig{}, errutil.DatabaseErr("Failed to read server config").WithErrf("GetConfig: %w", err)
	}

	cfg := configFromRow(row)

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

// --- Query methods ---

// findByID returns the super_admin config row by ID.
func (s *Service) findByID(ctx context.Context, id uuid.UUID) (*superAdminRow, error) {
	query := `
		SELECT
			id, initialized, "allowSignUp", "createdAt", "updatedAt",
			"allowedSignUpDomain", "instanceId", "trustSamlEmails", "trustLdapEmails", "trustOidcEmails",
			"defaultAuthOrgId", "enabledLoginMethods", "authConsentContent", "pageFrameContent",
			"adminIdentityIds", "fipsEnabled"
		FROM super_admin
		WHERE id = @id
	`
	args := pgx.NamedArgs{"id": id}

	row := s.db.Replica().QueryRow(ctx, query, args)

	var r superAdminRow
	err := row.Scan(
		&r.ID, &r.Initialized, &r.AllowSignUp, &r.CreatedAt, &r.UpdatedAt,
		&r.AllowedSignUpDomain, &r.InstanceID, &r.TrustSamlEmails, &r.TrustLdapEmails, &r.TrustOidcEmails,
		&r.DefaultAuthOrgID, &r.EnabledLoginMethods, &r.AuthConsentContent, &r.PageFrameContent,
		&r.AdminIdentityIDs, &r.FipsEnabled,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errutil.NotFound("Server config not found")
	}
	if err != nil {
		return nil, err
	}

	return &r, nil
}

// findOrCreateConfig atomically ensures the config row exists.
// It acquires a PG advisory lock, checks for an existing row, and creates one if missing.
func (s *Service) findOrCreateConfig(ctx context.Context) (ServerConfig, error) {
	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return ServerConfig{}, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Acquire advisory lock to prevent concurrent init.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", PgLockSuperAdminInit); err != nil {
		return ServerConfig{}, fmt.Errorf("acquiring advisory lock: %w", err)
	}

	// Check if config already exists.
	query := `
		SELECT
			id, initialized, "allowSignUp", "createdAt", "updatedAt",
			"allowedSignUpDomain", "instanceId", "trustSamlEmails", "trustLdapEmails", "trustOidcEmails",
			"defaultAuthOrgId", "enabledLoginMethods", "authConsentContent", "pageFrameContent",
			"adminIdentityIds", "fipsEnabled"
		FROM super_admin
		WHERE id = @id
	`
	args := pgx.NamedArgs{"id": adminConfigDBUUID}

	row := tx.QueryRow(ctx, query, args)

	var r superAdminRow
	err = row.Scan(
		&r.ID, &r.Initialized, &r.AllowSignUp, &r.CreatedAt, &r.UpdatedAt,
		&r.AllowedSignUpDomain, &r.InstanceID, &r.TrustSamlEmails, &r.TrustLdapEmails, &r.TrustOidcEmails,
		&r.DefaultAuthOrgID, &r.EnabledLoginMethods, &r.AuthConsentContent, &r.PageFrameContent,
		&r.AdminIdentityIDs, &r.FipsEnabled,
	)
	if err == nil {
		if cerr := tx.Commit(ctx); cerr != nil {
			return ServerConfig{}, fmt.Errorf("committing config read: %w", cerr)
		}
		return configFromRow(&r), nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ServerConfig{}, fmt.Errorf("checking existing config: %w", err)
	}

	// Create the initial config row.
	insertQuery := `
		INSERT INTO super_admin (id, initialized, "allowSignUp", "fipsEnabled")
		VALUES (@id, false, true, false)
		RETURNING
			id, initialized, "allowSignUp", "createdAt", "updatedAt",
			"allowedSignUpDomain", "instanceId", "trustSamlEmails", "trustLdapEmails", "trustOidcEmails",
			"defaultAuthOrgId", "enabledLoginMethods", "authConsentContent", "pageFrameContent",
			"adminIdentityIds", "fipsEnabled"
	`

	row = tx.QueryRow(ctx, insertQuery, args)
	err = row.Scan(
		&r.ID, &r.Initialized, &r.AllowSignUp, &r.CreatedAt, &r.UpdatedAt,
		&r.AllowedSignUpDomain, &r.InstanceID, &r.TrustSamlEmails, &r.TrustLdapEmails, &r.TrustOidcEmails,
		&r.DefaultAuthOrgID, &r.EnabledLoginMethods, &r.AuthConsentContent, &r.PageFrameContent,
		&r.AdminIdentityIDs, &r.FipsEnabled,
	)
	if err != nil {
		return ServerConfig{}, fmt.Errorf("creating initial config: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ServerConfig{}, fmt.Errorf("committing init transaction: %w", err)
	}

	return configFromRow(&r), nil
}
