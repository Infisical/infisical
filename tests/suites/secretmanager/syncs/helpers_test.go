package syncs_test

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Suite-local until a second package creates a sync; then it moves to
// fixture/secretmanager.

type sync struct {
	ID   uuid.UUID
	proj *fixture.Project
}

type syncConfig struct {
	autoSync              bool
	keySchema             string
	disableSecretDeletion bool
	environment           string
	secretPath            string
}

type syncOption func(*syncConfig)

// autoSync defaults to true in the schema, so a test choosing when the first push
// happens has to turn it off.
func autoSync(on bool) syncOption { return func(c *syncConfig) { c.autoSync = on } }

func keySchema(s string) syncOption { return func(c *syncConfig) { c.keySchema = s } }

func disableSecretDeletion() syncOption {
	return func(c *syncConfig) { c.disableSecretDeletion = true }
}

type destination func(*testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig

// repoScope is capped at 100 secrets by GitHub.
func repoScope(owner, repo string) destination {
	return func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
		var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
		require.NoError(tt, d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig1(
			api.CreateGitHubSecretSyncJSONBodyDestinationConfig1{Owner: owner, Repo: repo, Scope: "repository"}))
		return d
	}
}

// orgScope is capped at 1000.
func orgScope(org string) destination {
	return func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
		var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
		require.NoError(tt, d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig0(
			api.CreateGitHubSecretSyncJSONBodyDestinationConfig0{Org: org, Scope: "organization", Visibility: "all"}))
		return d
	}
}

func newSync(tt *testing.T, p *fixture.Project, conn *fixture.AppConnection,
	dest destination, opts ...syncOption) *sync {
	tt.Helper()

	cfg := syncConfig{autoSync: false, environment: "dev", secretPath: "/"}
	for _, o := range opts {
		o(&cfg)
	}

	body := api.CreateGitHubSecretSyncJSONRequestBody{
		Name:              "sync-" + uuid.NewString()[:8],
		ProjectId:         p.ID,
		ConnectionId:      conn.ID,
		Environment:       cfg.environment,
		SecretPath:        cfg.secretPath,
		DestinationConfig: dest(tt),
		IsAutoSyncEnabled: &cfg.autoSync,
	}
	// GitHub cannot import, so the schema allows only this.
	body.SyncOptions.InitialSyncBehavior = "overwrite-destination"
	if cfg.keySchema != "" {
		body.SyncOptions.KeySchema = &cfg.keySchema
	}
	if cfg.disableSecretDeletion {
		body.SyncOptions.DisableSecretDeletion = &cfg.disableSecretDeletion
	}

	res, err := p.Tenant().Admin.API.CreateGitHubSecretSyncWithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a sync")
	require.NotNilf(tt, res.JSON200, "creating a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return &sync{ID: res.JSON200.SecretSync.Id, proj: p}
}

// trigger runs the sync and waits on its status rather than the destination, so a
// failed sync reports the product's own reason instead of a timeout.
func (s *sync) trigger(tt *testing.T) {
	tt.Helper()
	s.start(tt)
	s.awaitTerminal(tt)
}

// triggerExpectingFailure is trigger for when failing is the behaviour under test.
func (s *sync) triggerExpectingFailure(tt *testing.T) outcome {
	tt.Helper()
	s.start(tt)
	return s.awaitOutcome(tt)
}

func (s *sync) start(tt *testing.T) {
	tt.Helper()
	res, err := s.proj.Tenant().Admin.API.SyncGitHubSecretSyncWithResponse(tt.Context(), s.ID)
	require.NoError(tt, err, "triggering a sync")
	require.NotNilf(tt, res.JSON200, "triggering a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

type outcome struct {
	status  string
	message string
}

func (s *sync) awaitTerminal(tt *testing.T) {
	tt.Helper()
	got := s.awaitOutcome(tt)
	require.NotEqualf(tt, "failed", got.status, "the sync failed: %s", got.message)
}

func (s *sync) awaitOutcome(tt *testing.T) outcome {
	tt.Helper()

	got, err := wait.For(tt.Context(), func(ctx context.Context) (outcome, bool, error) {
		res, err := s.proj.Tenant().Admin.API.GetGitHubSecretSyncWithResponse(ctx, s.ID)
		if err != nil {
			return outcome{}, false, err
		}
		if res.JSON200 == nil {
			return outcome{}, false, nil
		}
		var out outcome
		if v := res.JSON200.SecretSync.SyncStatus; v != nil {
			out.status = *v
		}
		if v := res.JSON200.SecretSync.LastSyncMessage; v != nil {
			out.message = *v
		}
		return out, out.status == "succeeded" || out.status == "failed", nil
	})
	require.NoError(tt, err, "waiting for the sync to finish")
	return got
}
