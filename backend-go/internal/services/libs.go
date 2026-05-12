package services

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/license"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
)

// ServicesDeps holds the external dependencies needed to construct shared services.
type ServicesDeps struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB             // primary DB connection (writes)
	HSM      kms.HsmService    // nil when HSM is not configured
	KeyStore keystore.KeyStore // Redis-backed keystore for PG advisory locks
	Queue    *queue.Service    // queue service for async tasks
}

// Services holds all shared services.
type Services struct {
	Config        *config.Config
	Authenticator auth.Authenticator
	Permission    *permission.Service
	KMS           *kms.Service
	License       *license.Service
	Project       *project.Service
	Queue         *queue.Service
	AuditLog      *auditlog.Service
}

func NewServices(ctx context.Context, deps *ServicesDeps) (*Services, error) {
	kmsSvc, err := kms.NewService(kms.Deps{
		DB:     deps.DB,
		HSM:    deps.HSM,
		Config: deps.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("kms: %w", err)
	}

	hsmConfigured := deps.HSM != nil
	if err := kmsSvc.Start(ctx, hsmConfigured); err != nil {
		return nil, fmt.Errorf("kms start: %w", err)
	}

	licenseSvc := license.NewService(ctx, deps.Logger, license.Deps{
		Config:   deps.Config,
		DB:       deps.DB,
		KeyStore: deps.KeyStore,
	})

	authenticator := auth.NewAuthenticator(deps.DB, deps.Config.AuthSecret, deps.KeyStore)

	projectSvc := project.NewService(deps.Logger, project.Deps{DB: deps.DB})

	auditLogSvc := auditlog.NewService(deps.Logger, auditlog.Deps{
		Queue:  deps.Queue,
		Config: deps.Config,
	})

	auditLogQueueHandler := auditlog.NewQueueHandler(deps.Logger, auditlog.QueueHandlerDeps{
		DB:       deps.DB,
		Project:  projectSvc,
		License:  licenseSvc,
		Config:   deps.Config,
		KeyStore: deps.KeyStore,
	})
	auditLogQueueHandler.Register(deps.Queue)

	return &Services{
		Config:        deps.Config,
		Authenticator: authenticator,
		Permission:    permission.NewService(deps.Logger, permission.Deps{DB: deps.DB}),
		KMS:           kmsSvc,
		License:       licenseSvc,
		Project:       projectSvc,
		Queue:         deps.Queue,
		AuditLog:      auditLogSvc,
	}, nil
}
