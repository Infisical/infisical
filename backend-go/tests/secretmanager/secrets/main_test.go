//go:build integration

package secrets_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/server/api/secretmanager/secret"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
	secretSvc "github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
	"github.com/infisical/api/tests/infra"
)

var (
	stack       *infra.Stack
	testProject *infra.ProjectSeed
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		WithEEFeatures("rbac", "groups").
		MustStart()

	testProject = stack.NodeJS().MustCreateProject("secrets-test")
	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// newSecretsHandler creates a secrets handler for direct testing.
func newSecretsHandler(t *testing.T) *secret.Handler {
	t.Helper()

	ctx := t.Context()

	permSvc := permission.NewService(ctx, infra.NopLogger(), &permission.Deps{DB: stack.DB()})

	redisClient := stack.Redis().Client()
	t.Cleanup(func() { redisClient.Close() })

	kmsSvc, err := kms.NewService(ctx, infra.NopLogger(), &kms.Deps{
		DB:          stack.DB(),
		HSM:         nil,
		ExternalKms: nil,
		Config:      stack.Config(),
	})
	require.NoError(t, err)

	err = kmsSvc.Start(ctx, false)
	require.NoError(t, err)

	projectSvc := project.NewService(ctx, infra.NopLogger(), &project.Deps{DB: stack.DB()})

	queueSvc := queue.NewService(ctx, infra.NopLogger(), redisClient)

	auditLogSvc := auditlog.NewService(ctx, infra.NopLogger(), &auditlog.Deps{Queue: queueSvc, Config: stack.Config()})

	secretFolderSvc := secretfolder.NewService(ctx, infra.NopLogger(), &secretfolder.Deps{DB: stack.DB()})
	secretImportSvc := secretimport.NewService(ctx, infra.NopLogger(), &secretimport.Deps{DB: stack.DB()})

	secretsSvc := secretSvc.NewService(ctx, infra.NopLogger(), &secretSvc.Deps{
		DB:                  stack.DB(),
		SecretFolderService: secretFolderSvc,
		SecretImportService: secretImportSvc,
		KMSService:          kmsSvc,
	})

	return secret.NewHandler(&secret.Deps{
		Logger:     infra.NopLogger(),
		Permission: permSvc,
		Project:    projectSvc,
		AuditLog:   auditLogSvc,
		Secrets:    secretsSvc,
	})
}

// doGet makes a GET request and returns the response body and status code.
func doGet(t *testing.T, srv *httptest.Server, path string) (body []byte, statusCode int) {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+path, http.NoBody)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	body, err = io.ReadAll(resp.Body)
	require.NoError(t, err)

	return body, resp.StatusCode
}

// ListSecretsV3Params holds parameters for V3 list secrets request.
type ListSecretsV3Params struct {
	WorkspaceID            *string
	WorkspaceSlug          *string
	Environment            *string
	SecretPath             *string
	ViewSecretValue        *bool
	ExpandSecretReferences *bool
	Recursive              *bool
	IncludeImports         *bool
	TagSlugs               *string
	MetadataFilter         *string
}

// getSecretByNameRawV3AsUser is a helper that gets a secret by name using V3 API as a user via HTTP.
func getSecretByNameRawV3AsUser(t *testing.T, userID, orgID, secretName string, params *GetSecretByNameV3Params) (secret.GetSecretByNameV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeUser, userID, orgID)
	defer srv.Close()

	// Build URL
	urlParams := url.Values{}
	if params.WorkspaceID != nil {
		urlParams.Set("workspaceId", *params.WorkspaceID)
	}
	if params.WorkspaceSlug != nil {
		urlParams.Set("workspaceSlug", *params.WorkspaceSlug)
	}
	if params.Environment != nil {
		urlParams.Set("environment", *params.Environment)
	}
	if params.SecretPath != nil {
		urlParams.Set("secretPath", *params.SecretPath)
	}
	if params.Version != nil {
		urlParams.Set("version", strconv.Itoa(*params.Version))
	}
	if params.Type != nil {
		urlParams.Set("type", *params.Type)
	}
	if params.ViewSecretValue != nil {
		urlParams.Set("viewSecretValue", strconv.FormatBool(*params.ViewSecretValue))
	}
	if params.ExpandSecretReferences != nil {
		urlParams.Set("expandSecretReferences", strconv.FormatBool(*params.ExpandSecretReferences))
	}
	if params.IncludeImports != nil {
		urlParams.Set("include_imports", strconv.FormatBool(*params.IncludeImports))
	}

	path := fmt.Sprintf("/api/v3/secrets/raw/%s?%s", url.PathEscape(secretName), urlParams.Encode())
	body, status := doGet(t, srv, path)

	if status >= 400 {
		var errResp shared.Error
		_ = json.Unmarshal(body, &errResp)
		return secret.GetSecretByNameV4Response{}, errors.New(errResp.Message)
	}

	var resp secret.GetSecretByNameV4Response
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp, nil
}

// GetSecretByNameV3Params holds parameters for V3 get secret request.
type GetSecretByNameV3Params struct {
	WorkspaceID            *string
	WorkspaceSlug          *string
	Environment            *string
	SecretPath             *string
	Version                *int
	Type                   *string
	ViewSecretValue        *bool
	ExpandSecretReferences *bool
	IncludeImports         *bool
}

// listSecretsRawV3AsUser is a helper that lists secrets using V3 API as a user via HTTP.
func listSecretsRawV3AsUser(t *testing.T, userID, orgID string, params *ListSecretsV3Params) (secret.ListSecretsV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeUser, userID, orgID)
	defer srv.Close()

	// Build URL
	urlParams := url.Values{}
	if params.WorkspaceID != nil {
		urlParams.Set("workspaceId", *params.WorkspaceID)
	}
	if params.WorkspaceSlug != nil {
		urlParams.Set("workspaceSlug", *params.WorkspaceSlug)
	}
	if params.Environment != nil {
		urlParams.Set("environment", *params.Environment)
	}
	if params.SecretPath != nil {
		urlParams.Set("secretPath", *params.SecretPath)
	}
	if params.ViewSecretValue != nil {
		urlParams.Set("viewSecretValue", strconv.FormatBool(*params.ViewSecretValue))
	}
	if params.ExpandSecretReferences != nil {
		urlParams.Set("expandSecretReferences", strconv.FormatBool(*params.ExpandSecretReferences))
	}
	if params.Recursive != nil {
		urlParams.Set("recursive", strconv.FormatBool(*params.Recursive))
	}
	if params.IncludeImports != nil {
		urlParams.Set("include_imports", strconv.FormatBool(*params.IncludeImports))
	}
	if params.TagSlugs != nil {
		urlParams.Set("tagSlugs", *params.TagSlugs)
	}
	if params.MetadataFilter != nil {
		urlParams.Set("metadataFilter", *params.MetadataFilter)
	}

	path := fmt.Sprintf("/api/v3/secrets/raw?%s", urlParams.Encode())
	body, status := doGet(t, srv, path)

	if status >= 400 {
		var errResp shared.Error
		_ = json.Unmarshal(body, &errResp)
		return secret.ListSecretsV4Response{}, errors.New(errResp.Message)
	}

	var resp secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp, nil
}

// ListSecretsV4Params holds parameters for V4 list secrets request.
type ListSecretsV4Params struct {
	ProjectID                string
	Environment              string
	SecretPath               *string
	ViewSecretValue          *bool
	ExpandSecretReferences   *bool
	Recursive                *bool
	IncludePersonalOverrides *bool
	IncludeImports           *bool
	TagSlugs                 *string
	MetadataFilter           *string
}

// listSecrets is a helper that calls ListSecretsV4 via HTTP.
func listSecrets(t *testing.T, actorType auth.ActorType, actorID, orgID string, params *ListSecretsV4Params) (secret.ListSecretsV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, actorType, actorID, orgID)
	defer srv.Close()

	// Build URL
	urlParams := url.Values{}
	urlParams.Set("projectId", params.ProjectID)
	urlParams.Set("environment", params.Environment)
	if params.SecretPath != nil {
		urlParams.Set("secretPath", *params.SecretPath)
	}
	if params.ViewSecretValue != nil {
		urlParams.Set("viewSecretValue", strconv.FormatBool(*params.ViewSecretValue))
	}
	if params.ExpandSecretReferences != nil {
		urlParams.Set("expandSecretReferences", strconv.FormatBool(*params.ExpandSecretReferences))
	}
	if params.Recursive != nil {
		urlParams.Set("recursive", strconv.FormatBool(*params.Recursive))
	}
	if params.IncludePersonalOverrides != nil {
		urlParams.Set("includePersonalOverrides", strconv.FormatBool(*params.IncludePersonalOverrides))
	}
	if params.IncludeImports != nil {
		urlParams.Set("includeImports", strconv.FormatBool(*params.IncludeImports))
	}
	if params.TagSlugs != nil {
		urlParams.Set("tagSlugs", *params.TagSlugs)
	}
	if params.MetadataFilter != nil {
		urlParams.Set("metadataFilter", *params.MetadataFilter)
	}

	path := fmt.Sprintf("/api/v4/secrets?%s", urlParams.Encode())
	body, status := doGet(t, srv, path)

	if status >= 400 {
		var errResp shared.Error
		_ = json.Unmarshal(body, &errResp)
		return secret.ListSecretsV4Response{}, errors.New(errResp.Message)
	}

	var resp secret.ListSecretsV4Response
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp, nil
}

// GetSecretByNameV4Params holds parameters for V4 get secret request.
type GetSecretByNameV4Params struct {
	ProjectID              string
	Environment            string
	SecretPath             *string
	Version                *int
	Type                   *string
	ViewSecretValue        *bool
	ExpandSecretReferences *bool
	IncludeImports         *bool
}

// getSecretByName is a helper that calls GetSecretByNameV4 via HTTP.
func getSecretByName(t *testing.T, actorType auth.ActorType, actorID, orgID, secretName string, params *GetSecretByNameV4Params) (secret.GetSecretByNameV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, actorType, actorID, orgID)
	defer srv.Close()

	// Build URL
	urlParams := url.Values{}
	urlParams.Set("projectId", params.ProjectID)
	urlParams.Set("environment", params.Environment)
	if params.SecretPath != nil {
		urlParams.Set("secretPath", *params.SecretPath)
	}
	if params.Version != nil {
		urlParams.Set("version", strconv.Itoa(*params.Version))
	}
	if params.Type != nil {
		urlParams.Set("type", *params.Type)
	}
	if params.ViewSecretValue != nil {
		urlParams.Set("viewSecretValue", strconv.FormatBool(*params.ViewSecretValue))
	}
	if params.ExpandSecretReferences != nil {
		urlParams.Set("expandSecretReferences", strconv.FormatBool(*params.ExpandSecretReferences))
	}
	if params.IncludeImports != nil {
		urlParams.Set("includeImports", strconv.FormatBool(*params.IncludeImports))
	}

	path := fmt.Sprintf("/api/v4/secrets/%s?%s", url.PathEscape(secretName), urlParams.Encode())
	body, status := doGet(t, srv, path)

	if status >= 400 {
		var errResp shared.Error
		_ = json.Unmarshal(body, &errResp)
		return secret.GetSecretByNameV4Response{}, errors.New(errResp.Message)
	}

	var resp secret.GetSecretByNameV4Response
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp, nil
}

// testAuthMiddleware injects a test identity into the request context.
func testAuthMiddleware(actorType auth.ActorType, actorID, orgID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := auth.WithIdentity(r.Context(), &auth.Identity{
				AuthMode:   auth.AuthModeIdentityAccessToken,
				Actor:      actorType,
				ActorID:    uuid.MustParse(actorID),
				OrgID:      uuid.MustParse(orgID),
				AuthMethod: "",
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// newTestServer creates an HTTP test server with configurable actor type.
func newTestServer(t *testing.T, handler *secret.Handler, actorType auth.ActorType, actorID, orgID string) *httptest.Server {
	t.Helper()

	router := secret.NewRouter(
		handler,
		secret.WithMiddleware(testAuthMiddleware(actorType, actorID, orgID)),
		secret.WithErrorHandler(shared.NewErrorHandler(infra.NopLogger())),
	)

	return httptest.NewServer(router)
}
