//go:generate go tool oapi-codegen -config cfg.yaml openapi.yml

package folder

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
)

var _ ServiceInterface = (*Handler)(nil)

type PermissionService interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

type FolderService interface {
	ListFolders(ctx context.Context, opts *secretfolder.ListFoldersOpts) ([]secretfolder.ListedFolder, error)
}

type Handler struct {
	logger     *slog.Logger
	permission PermissionService
	folders    FolderService
}

type Deps struct {
	Logger     *slog.Logger
	Permission PermissionService
	Folders    FolderService
}

func NewHandler(deps *Deps) *Handler {
	return &Handler{
		logger:     deps.Logger.With(slog.String("handler", "folders")),
		permission: deps.Permission,
		folders:    deps.Folders,
	}
}
