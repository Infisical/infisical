package services

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/services/assumeprivilege"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
)

// Infra holds the external infrastructure dependencies.
type Infra struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB
	Redis    redis.UniversalClient
	HSM      kms.HsmService
	License  *license.Service
	KeyStore keystore.KeyStore
	Queue    *queue.Service
}

// Services holds all initialized services.
type Services struct {
	infra *Infra

	// Top-level services (frequently used across handlers)
	KMS             *kms.Service
	Permission      *permission.Service
	AuditLog        *auditlog.Service
	AssumePrivilege *assumeprivilege.Service
	RateLimit       *ratelimit.Service
	License         *license.Service

	// Grouped services
	platform *PlatformGroup
	secrets  *SecretsGroup
}

// New creates all services.
// Returns a cleanup function that should be called during graceful shutdown.
func New(ctx context.Context, infra *Infra) (*Services, func(), error) {
	s := &Services{
		infra:   infra,
		License: infra.License,
	}

	// Initialize top-level services
	if err := s.initTopLevel(ctx); err != nil {
		return nil, nil, err
	}

	// Initialize groups
	s.initPlatform(ctx)
	s.initSecrets(ctx)

	cleanup := func() {
		s.KMS.Close()
	}

	return s, cleanup, nil
}

func (s *Services) initTopLevel(ctx context.Context) error {
	externalKmsSvc, err := externalkms.NewService(ctx, s.infra.Logger, &externalkms.Deps{})
	if err != nil {
		return fmt.Errorf("external kms: %w", err)
	}

	s.KMS, err = kms.NewService(ctx, s.infra.Logger, &kms.Deps{
		DB:          s.infra.DB,
		HSM:         s.infra.HSM,
		ExternalKms: externalKmsSvc,
		Config:      s.infra.Config,
	})
	if err != nil {
		return fmt.Errorf("kms: %w", err)
	}

	if err = s.KMS.Start(ctx, s.infra.HSM != nil); err != nil {
		return fmt.Errorf("kms start: %w", err)
	}

	s.Permission = permission.NewService(ctx, s.infra.Logger, &permission.Deps{DB: s.infra.DB})

	s.AssumePrivilege = assumeprivilege.NewService(ctx, s.infra.Logger, &assumeprivilege.Deps{
		AuthSecret:        s.infra.Config.AuthSecret,
		PermissionService: s.Permission,
	})

	s.AuditLog = auditlog.NewService(ctx, s.infra.Logger, &auditlog.Deps{
		Queue:  s.infra.Queue,
		Config: s.infra.Config,
	})

	s.RateLimit = ratelimit.NewService(ctx, s.infra.Logger, &ratelimit.Deps{
		Redis:      s.infra.Redis,
		LicenseSvc: s.infra.License,
		IsCloud:    s.infra.Config.IsCloud,
		IsEnabled:  s.infra.Config.IsCloud && s.infra.Config.IsProductionMode,
	})

	return nil
}

// Infra returns the infrastructure dependencies.
func (s *Services) Infra() *Infra {
	return s.infra
}

// Platform returns the platform services group.
func (s *Services) Platform() *PlatformGroup {
	return s.platform
}

// Secrets returns the secrets services group.
func (s *Services) Secrets() *SecretsGroup {
	return s.secrets
}
