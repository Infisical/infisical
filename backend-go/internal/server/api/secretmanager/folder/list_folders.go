package folder

import (
	"context"
	"regexp"
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

var lastSecretModifiedRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$`)

type validationIssue struct {
	Code       string   `json:"code"`
	Expected   string   `json:"expected,omitempty"`
	Received   string   `json:"received,omitempty"`
	Validation string   `json:"validation,omitempty"`
	Message    string   `json:"message"`
	Path       []string `json:"path"`
}

func (h *Handler) ListSecretFolders(ctx context.Context, opts *ListSecretFoldersServiceRequestOptions) (*ListSecretFoldersResponseData, error) {
	q := opts.Query
	query := opts.RawRequest.URL.Query()

	// Issue order and shapes mirror Node's Zod validation output.
	issues := make([]validationIssue, 0)
	for _, field := range []struct {
		name  string
		value *string
	}{{"projectId", q.ProjectID}, {"environment", q.Environment}} {
		if field.value == nil {
			issues = append(issues, validationIssue{Code: "invalid_type", Expected: "string", Received: "undefined", Message: "Required", Path: []string{field.name}})
		}
	}

	var lastSecretModified *time.Time
	if q.LastSecretModified != nil {
		parsed, err := time.Parse(time.RFC3339Nano, *q.LastSecretModified)
		if err != nil || !lastSecretModifiedRegex.MatchString(*q.LastSecretModified) {
			issues = append(issues, validationIssue{Code: "invalid_string", Validation: "datetime", Message: "Invalid datetime", Path: []string{"lastSecretModified"}})
		} else {
			lastSecretModified = &parsed
		}
	}
	if !query.Has("path") {
		issues = append(issues, validationIssue{Code: "invalid_type", Expected: "string", Received: "undefined", Message: "Required", Path: []string{"path"}})
	}
	if len(issues) > 0 {
		return nil, errutil.ValidationFailure(issues)
	}

	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	projectID := strings.TrimSpace(*q.ProjectID)
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

	// Node's booleanSchema: any non-empty value other than "0" or "false" is true.
	recursive := false
	if raw := strings.TrimSpace(fn.ValueOr(q.Recursive, "")); raw != "" && !strings.EqualFold(raw, "false") {
		number, err := strconv.ParseFloat(raw, 64)
		recursive = err != nil || number != 0
	}

	path := strings.TrimSpace(fn.ValueOr(q.Path, ""))
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	folders, err := h.folders.ListFolders(ctx, &secretfolder.ListFoldersOpts{
		ProjectID:          projectID,
		Environment:        strings.TrimSpace(*q.Environment),
		Path:               fn.RemoveTrailingSlash(path),
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
func formatTime(t time.Time) string {
	return t.UTC().Format(timestampLayout)
}

func toSecretFolder(f *secretfolder.ListedFolder) SecretFolder {
	out := SecretFolder{
		ID:           f.ID.String(),
		Name:         f.Name,
		CreatedAt:    formatTime(f.CreatedAt),
		UpdatedAt:    formatTime(f.UpdatedAt),
		Description:  f.Description,
		EnvID:        f.EnvID.String(),
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
