package api

import (
	"context"
	"fmt"

	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services/assumeprivilege"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
)

// PlatformServices holds platform-level services shared across handlers.
type PlatformServices struct {
	ApiAuthenticator *apiauth.ApiAuthenticator
	Permission       *permission.Service
	KMS              *kms.Service
	License          *license.Service
	Project          *project.Service
	AuditLog         *auditlog.Service
	AssumePrivilege  *assumeprivilege.Service
	RateLimit        *ratelimit.Service
}

func newPlatformServices(ctx context.Context, infra *Infra) (*PlatformServices, error) {
	externalKmsSvc, err := externalkms.NewService(ctx, infra.Logger, &externalkms.Deps{})
	if err != nil {
		return nil, fmt.Errorf("external kms: %w", err)
	}

	kmsSvc, err := kms.NewService(ctx, infra.Logger, &kms.Deps{
		DB:          infra.DB,
		HSM:         infra.HSM,
		ExternalKms: externalKmsSvc,
		Config:      infra.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("kms: %w", err)
	}

	err = kmsSvc.Start(ctx, infra.HSM != nil)
	if err != nil {
		return nil, fmt.Errorf("kms start: %w", err)
	}

	permissionSvc := permission.NewService(ctx, infra.Logger, &permission.Deps{DB: infra.DB})

	projectSvc := project.NewService(ctx, infra.Logger, &project.Deps{DB: infra.DB})

	assumePrivilegeSvc := assumeprivilege.NewService(ctx, infra.Logger, &assumeprivilege.Deps{
		AuthSecret:        infra.Config.AuthSecret,
		PermissionService: permissionSvc,
	})

	apiAuthenticator := apiauth.NewApiAuthenticator(infra.Logger, infra.DB, infra.Config.AuthSecret, infra.KeyStore, assumePrivilegeSvc, shared.NewErrorHandler(infra.Logger))

	auditLogSvc := auditlog.NewService(ctx, infra.Logger, &auditlog.Deps{
		Queue:  infra.Queue,
		Config: infra.Config,
	})

	auditLogQueueHandler := auditlog.NewQueueHandler(ctx, infra.Logger, &auditlog.QueueHandlerDeps{
		DB:       infra.DB,
		Project:  projectSvc,
		License:  infra.License,
		Config:   infra.Config,
		KeyStore: infra.KeyStore,
	})
	auditLogQueueHandler.Register(infra.Queue)

	rateLimitSvc := ratelimit.NewService(ctx, infra.Logger, &ratelimit.Deps{
		Redis:      infra.Redis,
		LicenseSvc: infra.License,
		IsCloud:    infra.Config.IsCloud,
		IsEnabled:  infra.Config.IsCloud && infra.Config.IsProductionMode,
	})

	svc := &PlatformServices{
		ApiAuthenticator: apiAuthenticator,
		Permission:       permissionSvc,
		KMS:              kmsSvc,
		License:          infra.License,
		Project:          projectSvc,
		AuditLog:         auditLogSvc,
		AssumePrivilege:  assumePrivilegeSvc,
		RateLimit:        rateLimitSvc,
	}

	return svc, nil
}
