package api

import (
	"context"
	"fmt"

	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/license"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
)

// PlatformServices holds platform-level services shared across handlers.
type PlatformServices struct {
	Authenticator apiauth.Authenticator
	Permission    *permission.Service
	KMS           *kms.Service
	License       *license.Service
	Project       *project.Service
	AuditLog      *auditlog.Service
}

func newPlatformServices(ctx context.Context, infra *Infra) (*PlatformServices, error) {
	kmsSvc, err := kms.NewService(ctx, infra.Logger, &kms.Deps{
		DB:     infra.DB,
		HSM:    infra.HSM,
		Config: infra.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("kms: %w", err)
	}

	err = kmsSvc.Start(ctx, infra.HSM != nil)
	if err != nil {
		return nil, fmt.Errorf("kms start: %w", err)
	}

	licenseSvc := license.NewService(ctx, infra.Logger, &license.Deps{
		Config:   infra.Config,
		DB:       infra.DB,
		KeyStore: infra.KeyStore,
	})

	authenticator := apiauth.NewAuthenticator(infra.DB, infra.Config.AuthSecret, infra.KeyStore)

	permissionSvc := permission.NewService(ctx, infra.Logger, &permission.Deps{DB: infra.DB})

	projectSvc := project.NewService(ctx, infra.Logger, &project.Deps{DB: infra.DB})

	auditLogSvc := auditlog.NewService(ctx, infra.Logger, &auditlog.Deps{
		Queue:  infra.Queue,
		Config: infra.Config,
	})

	auditLogQueueHandler := auditlog.NewQueueHandler(ctx, infra.Logger, &auditlog.QueueHandlerDeps{
		DB:       infra.DB,
		Project:  projectSvc,
		License:  licenseSvc,
		Config:   infra.Config,
		KeyStore: infra.KeyStore,
	})
	auditLogQueueHandler.Register(infra.Queue)

	svc := &PlatformServices{
		Authenticator: authenticator,
		Permission:    permissionSvc,
		KMS:           kmsSvc,
		License:       licenseSvc,
		Project:       projectSvc,
		AuditLog:      auditLogSvc,
	}

	return svc, nil
}
