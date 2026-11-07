package folder

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/fn"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
)

const timestampLayout = "2006-01-02T15:04:05.000Z"

func (h *Handler) ListSecretFolders(ctx context.Context, opts *ListSecretFoldersServiceRequestOptions) (*ListSecretFoldersResponseData, error) {
	q := opts.Query
	if !opts.RawRequest.URL.Query().Has("path") {
		return nil, errutil.BadRequest("path is required")
	}
	projectID := strings.TrimSpace(q.ProjectID)

	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	var lastSecretModified *time.Time
	if q.LastSecretModified != nil {
		parsed, err := parseLastSecretModified(*q.LastSecretModified)
		if err != nil {
			return nil, err
		}
		lastSecretModified = &parsed
	}

	if _, err := h.permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           identity.ActorID,
		ProjectID:         projectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        identity.OrgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	}); err != nil {
		return nil, err
	}

	recursive := parseBoolean(fn.ValueOr(q.Recursive, ""))
	folders, err := h.folders.ListFolders(ctx, &secretfolder.ListFoldersOpts{
		ProjectID:          projectID,
		Environment:        strings.TrimSpace(q.Environment),
		Path:               normalizePath(fn.ValueOr(q.Path, "")),
		Recursive:          recursive,
		LastSecretModified: lastSecretModified,
	})
	if err != nil {
		return nil, err
	}

	items := make([]SecretFolder, 0, len(folders))
	for i := range folders {
		items = append(items, toSecretFolder(&folders[i]))
	}
	return NewListSecretFoldersResponseData(&ListSecretFoldersResponse{Folders: items}), nil
}

func normalizePath(raw string) string {
	path := strings.TrimSpace(raw)
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return fn.RemoveTrailingSlash(path)
}

// parseBoolean mirrors Node's booleanSchema: any non-empty value other than "0" or "false" is true.
func parseBoolean(raw string) bool {
	value := strings.TrimSpace(raw)
	if value == "" || strings.EqualFold(value, "false") {
		return false
	}
	if number, err := strconv.ParseFloat(value, 64); err == nil && number == 0 {
		return false
	}
	return true
}

func parseLastSecretModified(raw string) (time.Time, error) {
	if !strings.HasSuffix(raw, "Z") {
		return time.Time{}, errutil.BadRequest("lastSecretModified must be an ISO 8601 UTC datetime")
	}
	parsed, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}, errutil.BadRequest("lastSecretModified must be an ISO 8601 UTC datetime")
	}
	return parsed, nil
}

func formatTime(t time.Time) string {
	return t.UTC().Format(timestampLayout)
}

func toSecretFolder(f *secretfolder.ListedFolder) SecretFolder {
	out := SecretFolder{
		ID:           f.ID.String(),
		Name:         f.Name,
		CreatedAt:    formatTime(f.CreatedAt),
		UpdatedAt:    formatTime(f.UpdatedAt),
		EnvID:        f.EnvID.String(),
		Description:  f.Description,
		IsReserved:   f.IsReserved,
		RelativePath: f.RelativePath,
	}
	if f.Version != nil {
		v := int(*f.Version)
		out.Version = &v
	}
	if f.ParentID != nil {
		p := f.ParentID.String()
		out.ParentID = &p
	}
	if f.LastSecretModified != nil {
		l := formatTime(*f.LastSecretModified)
		out.LastSecretModified = &l
	}
	return out
}
