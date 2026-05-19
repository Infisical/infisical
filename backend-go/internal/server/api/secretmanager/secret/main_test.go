//go:build integration

package secret_test

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	secrets "github.com/infisical/api/internal/server/api/secretmanager/secret"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
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
func newSecretsHandler(t *testing.T) gensecrets.Service {
	t.Helper()

	ctx := context.Background()

	permSvc := permission.NewService(ctx, testutil.NopLogger(), &permission.Deps{DB: stack.DB()})

	authenticator := apiauth.NewAuthenticator(stack.DB(), infra.AuthSecret, keystore.NewMemoryKeyStore())

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

	return secrets.NewHandler(&secrets.Deps{
		Logger:        testutil.NopLogger(),
		Authenticator: authenticator,
		Permission:    permSvc,
		Project:       projectSvc,
		AuditLog:      auditLogSvc,
		Secrets:       secretsSvc,
	})
}

// listSecretsAsAdmin is a helper that lists secrets as an admin identity.
func listSecretsAsAdmin(t *testing.T, identityID, orgID string, payload *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	t.Helper()

	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identityID),
		OrgID:      uuid.MustParse(orgID),
		AuthMethod: "",
	})

	svc := newSecretsHandler(t)
	return svc.ListSecretsV4(ctx, payload)
}

// listSecrets is a helper that calls ListSecretsV4 with the given identity context.
func listSecrets(t *testing.T, actorType auth.ActorType, actorID, orgID string, payload *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	t.Helper()

	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      actorType,
		ActorID:    uuid.MustParse(actorID),
		OrgID:      uuid.MustParse(orgID),
		AuthMethod: "",
	})

	svc := newSecretsHandler(t)
	return svc.ListSecretsV4(ctx, payload)
}

// getSecretByName is a helper that calls GetSecretByNameV4 with the given identity context.
func getSecretByName(t *testing.T, actorType auth.ActorType, actorID, orgID string, payload *gensecrets.GetSecretByNameV4Payload) (*gensecrets.GetSecretResult, error) {
	t.Helper()

	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      actorType,
		ActorID:    uuid.MustParse(actorID),
		OrgID:      uuid.MustParse(orgID),
		AuthMethod: "",
	})

	svc := newSecretsHandler(t)
	return svc.GetSecretByNameV4(ctx, payload)
}
