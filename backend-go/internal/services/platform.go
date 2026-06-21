package services

import (
	"context"

	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/project"
)

// PlatformGroup holds platform-level services.
type PlatformGroup struct {
	Project              *project.Service
	AuditLogQueueHandler *auditlog.QueueHandler
}

func (s *Services) initPlatform(ctx context.Context) {
	projectSvc := project.NewService(ctx, s.infra.Logger, &project.Deps{DB: s.infra.DB})

	auditLogQueueHandler := auditlog.NewQueueHandler(ctx, s.infra.Logger, &auditlog.QueueHandlerDeps{
		DB:       s.infra.DB,
		Project:  projectSvc,
		License:  s.infra.License,
		Config:   s.infra.Config,
		KeyStore: s.infra.KeyStore,
	})
	auditLogQueueHandler.Register(s.infra.Queue)

	s.platform = &PlatformGroup{
		Project:              projectSvc,
		AuditLogQueueHandler: auditLogQueueHandler,
	}
}
