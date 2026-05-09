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
	Config      *config.Config
	AuthHandler auth.AuthHandler
	Permission  *permission.Service
	KMS         *kms.Service
	License     *license.Service
	Project     *project.Service
	Queue       *queue.Service
	AuditLog    *auditlog.Service
}

func NewServices(ctx context.Context, deps *ServicesDeps) (*Services, error) {
	permissionDAL := permission.NewDAL(deps.DB)
	kmsDAL := kms.NewDAL(deps.DB, deps.KeyStore)
	projectDAL := project.NewDAL(deps.DB)

	kmsSvc, err := kms.NewService(kms.Deps{
		DAL:    kmsDAL,
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

	authDAL := auth.NewDAL(deps.DB)
	authHandler := auth.NewAuthHandler(authDAL, deps.Config.AuthSecret)

	projectSvc := project.NewService(deps.Logger, project.Deps{DAL: projectDAL})

	auditLogDAL := auditlog.NewDAL(deps.DB)
	auditLogSvc := auditlog.NewService(deps.Logger, auditlog.Deps{
		Queue:  deps.Queue,
		Config: deps.Config,
	})

	auditLogQueueHandler := auditlog.NewQueueHandler(deps.Logger, auditlog.QueueHandlerDeps{
		DAL:        auditLogDAL,
		ProjectDAL: projectDAL,
		License:    licenseSvc,
		Config:     deps.Config,
		KeyStore:   deps.KeyStore,
	})
	auditLogQueueHandler.Register(deps.Queue)

	return &Services{
		Config:      deps.Config,
		AuthHandler: authHandler,
		Permission:  permission.NewService(deps.Logger, permission.Deps{DAL: permissionDAL}),
		KMS:         kmsSvc,
		License:     licenseSvc,
		Project:     projectSvc,
		Queue:       deps.Queue,
		AuditLog:    auditLogSvc,
	}, nil
}
