package api

import (
	"context"
	"fmt"

	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/license"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
)

type platformServices struct {
	authenticator auth.Authenticator
	permission    *permission.Service
	kms           *kms.Service
	license       *license.Service
	project       *project.Service
	auditLog      *auditlog.Service
}

func newPlatformServices(ctx context.Context, infra *Infra) (*platformServices, error) {
	kmsSvc, err := kms.NewService(&kms.Deps{
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

	licenseSvc := license.NewService(ctx, infra.Logger, license.Deps{
		Config:   infra.Config,
		DB:       infra.DB,
		KeyStore: infra.KeyStore,
	})

	authenticator := auth.NewAuthenticator(infra.DB, infra.Config.AuthSecret, infra.KeyStore)

	permissionSvc := permission.NewService(infra.Logger, &permission.Deps{DB: infra.DB})

	projectSvc := project.NewService(infra.Logger, &project.Deps{DB: infra.DB})

	auditLogSvc := auditlog.NewService(infra.Logger, &auditlog.Deps{
		Queue:  infra.Queue,
		Config: infra.Config,
	})

	auditLogQueueHandler := auditlog.NewQueueHandler(infra.Logger, &auditlog.QueueHandlerDeps{
		DB:       infra.DB,
		Project:  projectSvc,
		License:  licenseSvc,
		Config:   infra.Config,
		KeyStore: infra.KeyStore,
	})
	auditLogQueueHandler.Register(infra.Queue)

	svc := &platformServices{
		authenticator: authenticator,
		permission:    permissionSvc,
		kms:           kmsSvc,
		license:       licenseSvc,
		project:       projectSvc,
		auditLog:      auditLogSvc,
	}

	return svc, nil
}
