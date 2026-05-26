//go:build integration

package secret_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/server"
	"github.com/infisical/api/internal/server/api/secretmanager/secret"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
	secretSvc "github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
	"github.com/infisical/api/pkg/chita"
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

	ctx := context.Background()

	permSvc := permission.NewService(ctx, testutil.NopLogger(), &permission.Deps{DB: stack.DB()})

	redisClient := stack.Redis().Client()
	t.Cleanup(func() { redisClient.Close() })

	kmsSvc, err := kms.NewService(ctx, testutil.NopLogger(), &kms.Deps{
		DB:     stack.DB(),
		HSM:    nil,
		Config: stack.Config(),
	})
	require.NoError(t, err)

	err = kmsSvc.Start(ctx, false)
	require.NoError(t, err)

	projectSvc := project.NewService(ctx, testutil.NopLogger(), &project.Deps{DB: stack.DB()})

	queueSvc := queue.NewService(ctx, testutil.NopLogger(), redisClient)

	auditLogSvc := auditlog.NewService(ctx, testutil.NopLogger(), &auditlog.Deps{Queue: queueSvc, Config: stack.Config()})

	secretFolderSvc := secretfolder.NewService(ctx, testutil.NopLogger(), &secretfolder.Deps{DB: stack.DB()})
	secretImportSvc := secretimport.NewService(ctx, testutil.NopLogger(), &secretimport.Deps{DB: stack.DB()})

	secretsSvc := secretSvc.NewService(ctx, testutil.NopLogger(), &secretSvc.Deps{
		DB:                  stack.DB(),
		SecretFolderService: secretFolderSvc,
		SecretImportService: secretImportSvc,
		KMSService:          kmsSvc,
	})

	return secret.NewHandler(&secret.Deps{
		Logger:        testutil.NopLogger(),
		Authenticator: apiauth.Authenticator{},
		Permission:    permSvc,
		Project:       projectSvc,
		AuditLog:      auditLogSvc,
		Secrets:       secretsSvc,
	})
}

// getSecretByNameRawV3AsUser is a helper that gets a secret by name using V3 API as a user via HTTP.
func getSecretByNameRawV3AsUser(t *testing.T, userID, orgID string, req *secret.GetSecretByNameRawV3Request) (secret.GetSecretByNameV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeUser, userID, orgID)
	defer srv.Close()

	resp, status := chita.HTTPTest[*secret.GetSecretByNameRawV3Request, secret.GetSecretByNameV4Response](
		t, srv, "GET", "/api/v3/secrets/raw/{secretName}", req)

	if status >= 400 {
		errResp, _ := chita.HTTPTest[*secret.GetSecretByNameRawV3Request, chita.ErrorBody](
			t, srv, "GET", "/api/v3/secrets/raw/{secretName}", req)
		return secret.GetSecretByNameV4Response{}, errors.New(errResp.Message)
	}

	return resp, nil
}

// listSecretsRawV3AsUser is a helper that lists secrets using V3 API as a user via HTTP.
func listSecretsRawV3AsUser(t *testing.T, userID, orgID string, req *secret.ListSecretsRawV3Request) (secret.ListSecretsV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeUser, userID, orgID)
	defer srv.Close()

	resp, status := chita.HTTPTest[*secret.ListSecretsRawV3Request, secret.ListSecretsV4Response](
		t, srv, "GET", "/api/v3/secrets/raw", req)

	if status >= 400 {
		errResp, _ := chita.HTTPTest[*secret.ListSecretsRawV3Request, chita.ErrorBody](
			t, srv, "GET", "/api/v3/secrets/raw", req)
		return secret.ListSecretsV4Response{}, errors.New(errResp.Message)
	}

	return resp, nil
}

// listSecrets is a helper that calls ListSecretsV4 via HTTP.
func listSecrets(t *testing.T, actorType auth.ActorType, actorID, orgID string, req *secret.ListSecretsV4Request) (secret.ListSecretsV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, actorType, actorID, orgID)
	defer srv.Close()

	resp, status := chita.HTTPTest[*secret.ListSecretsV4Request, secret.ListSecretsV4Response](
		t, srv, "GET", "/api/v4/secrets", req)

	if status >= 400 {
		errResp, _ := chita.HTTPTest[*secret.ListSecretsV4Request, chita.ErrorBody](
			t, srv, "GET", "/api/v4/secrets", req)
		return secret.ListSecretsV4Response{}, errors.New(errResp.Message)
	}

	return resp, nil
}

// getSecretByName is a helper that calls GetSecretByNameV4 via HTTP.
func getSecretByName(t *testing.T, actorType auth.ActorType, actorID, orgID string, req *secret.GetSecretByNameV4Request) (secret.GetSecretByNameV4Response, error) {
	t.Helper()

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, actorType, actorID, orgID)
	defer srv.Close()

	resp, status := chita.HTTPTest[*secret.GetSecretByNameV4Request, secret.GetSecretByNameV4Response](
		t, srv, "GET", "/api/v4/secrets/{secretName}", req)

	if status >= 400 {
		errResp, _ := chita.HTTPTest[*secret.GetSecretByNameV4Request, chita.ErrorBody](
			t, srv, "GET", "/api/v4/secrets/{secretName}", req)
		return secret.GetSecretByNameV4Response{}, errors.New(errResp.Message)
	}

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

	app := chita.NewApp(chita.AppConfig{
		ErrorHandler: server.NewErrorHandler(testutil.NopLogger()),
	})

	router := chita.NewRouter(chita.RouterConfig{App: app})
	router.Use(testAuthMiddleware(actorType, actorID, orgID))
	secret.RegisterRoutes(router, app, handler)

	return httptest.NewServer(router)
}
