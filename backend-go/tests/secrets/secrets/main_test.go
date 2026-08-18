//go:build integration

package secrets_test

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"testing"

	"go.uber.org/goleak"

	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
	secretSvc "github.com/infisical/api/internal/services/secrets/secret"
	"github.com/infisical/api/internal/services/secrets/secretcache"
	"github.com/infisical/api/internal/services/secrets/secretfolder"
	"github.com/infisical/api/internal/services/secrets/secretimport"
	"github.com/infisical/api/tests/infra"
)

var stack *infra.Stack

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		WithEEFeatures("rbac", "groups", "secretApproval").
		MustStart()

	code := m.Run()

	stack.Stop()

	// Check for goroutine leaks only after a clean run. Setup must precede
	// m.Run(), so goleak.VerifyTestMain can't be used here.
	if code == 0 {
		if err := goleak.Find(
			goleak.IgnoreTopFunction("github.com/redis/go-redis/v9/internal/pool.(*ConnPool).reaper"),
		); err != nil {
			fmt.Fprintf(os.Stderr, "goleak: %v\n", err)
			os.Exit(1)
		}
	}

	os.Exit(code)
}

// newSecretsHandler creates a secrets handler wired with all dependencies.
// Build one per test (or once for cache tests that exercise in-process handler
// state) and reuse it across requests.
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

	ks := keystore.NewKeyStore(redisClient, stack.DB())
	secretCacheSvc := secretcache.NewService(ctx, infra.NopLogger(), &secretcache.Deps{KeyStore: ks})

	return secret.NewHandler(&secret.Deps{
		Logger:      infra.NopLogger(),
		Permission:  permSvc,
		Project:     projectSvc,
		AuditLog:    auditLogSvc,
		Secrets:     secretsSvc,
		KMS:         kmsSvc,
		SecretCache: secretCacheSvc,
	})
}

// newSecretsRouter creates an HTTP router for the secrets endpoints.
func newSecretsRouter(t *testing.T) http.Handler {
	t.Helper()
	return secret.NewRouter(
		newSecretsHandler(t),
		secret.WithErrorHandler(shared.NewErrorHandler(infra.NopLogger())),
	)
}

// =============================================================================
// Endpoint helpers
//
// Requests are built from the generated query structs and encoded via Params,
// so a new spec param appears as a struct field with no helper edit. Negative
// tests that need invalid/omitted input should call the client directly with
// raw Param/ExpectStatus instead.
// =============================================================================

func listSecrets(client *infra.HTTPClient, q *secret.ListSecretsV4Query) (secret.ListSecretsV4Response, error) {
	var resp secret.ListSecretsV4Response
	err := client.Get("/api/v4/secrets").Params(q).Into(&resp)
	return resp, err
}

func getSecret(client *infra.HTTPClient, name string, q *secret.GetSecretByNameV4Query) (secret.GetSecretByNameV4Response, error) {
	var resp secret.GetSecretByNameV4Response
	err := client.Get("/api/v4/secrets/" + url.PathEscape(name)).Params(q).Into(&resp)
	return resp, err
}

func listSecretsV3(client *infra.HTTPClient, q *secret.ListSecretsRawV3Query) (secret.ListSecretsV4Response, error) {
	var resp secret.ListSecretsV4Response
	err := client.Get("/api/v3/secrets/raw").Params(q).Into(&resp)
	return resp, err
}

func getSecretV3(client *infra.HTTPClient, name string, q *secret.GetSecretByNameRawV3Query) (secret.GetSecretByNameV4Response, error) {
	var resp secret.GetSecretByNameV4Response
	err := client.Get("/api/v3/secrets/raw/" + url.PathEscape(name)).Params(q).Into(&resp)
	return resp, err
}

// findSecret returns the secret with the given key from a list response, or nil.
func findSecret(secrets []secret.SecretRaw, key string) *secret.SecretRaw {
	for i := range secrets {
		if secrets[i].SecretKey == key {
			return &secrets[i]
		}
	}
	return nil
}
