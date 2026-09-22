package syncs_test

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/fixture/project"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
)

// Suite-local rather than a fixture: only this package creates a sync. It moves under
// fixture/ when a second one does.

type sync struct {
	ID   uuid.UUID
	proj *project.Project
}

type syncConfig struct {
	autoSync              bool
	keySchema             string
	disableSecretDeletion bool
	environment           string
	secretPath            string
}

// syncOption adjusts a new sync. The destination is positional because the API has no
// default for it; everything else has one.
type syncOption func(*syncConfig)

// autoSync controls whether creating the sync immediately pushes.
//
// isAutoSyncEnabled defaults to true in the schema, so a test that wants to choose
// when the first push happens has to turn it off.
func autoSync(on bool) syncOption { return func(c *syncConfig) { c.autoSync = on } }

func keySchema(s string) syncOption { return func(c *syncConfig) { c.keySchema = s } }

func disableSecretDeletion() syncOption {
	return func(c *syncConfig) { c.disableSecretDeletion = true }
}

// destination is where a sync writes. Required, because the API has no default, and
// the scopes differ enough that each gets its own constructor.
type destination func(*testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig

// repoScope syncs to one repository. Capped at 100 secrets by GitHub.
func repoScope(owner, repo string) destination {
	return func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
		var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
		if err := d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig1(
			api.CreateGitHubSecretSyncJSONBodyDestinationConfig1{
				Owner: owner, Repo: repo, Scope: "repository",
			}); err != nil {
			tt.Fatalf("syncs: building a repository destination: %v", err)
		}
		return d
	}
}

// orgScope syncs to an organization, where the cap is 1000 rather than 100.
func orgScope(org string) destination {
	return func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
		var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
		if err := d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig0(
			api.CreateGitHubSecretSyncJSONBodyDestinationConfig0{
				Org: org, Scope: "organization", Visibility: "all",
			}); err != nil {
			tt.Fatalf("syncs: building an organization destination: %v", err)
		}
		return d
	}
}

// newSync creates a GitHub sync.
func newSync(tt *testing.T, p *project.Project, conn *appconnection.Connection,
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
	// GitHub cannot import, so the schema pins this to the one legal value.
	body.SyncOptions.InitialSyncBehavior = "overwrite-destination"
	if cfg.keySchema != "" {
		body.SyncOptions.KeySchema = &cfg.keySchema
	}
	if cfg.disableSecretDeletion {
		body.SyncOptions.DisableSecretDeletion = &cfg.disableSecretDeletion
	}

	res, err := p.Tenant().Admin.API.CreateGitHubSecretSyncWithResponse(tt.Context(), body)
	if err != nil {
		tt.Fatalf("syncs: creating a sync: %v", err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("syncs: creating a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	return &sync{ID: res.JSON200.SecretSync.Id, proj: p}
}

// trigger runs the sync and waits for it to reach a terminal status.
//
// Waiting on the sync rather than on the destination is the difference between a
// useful failure and a mystery. A sync that fails records why on the row, so a broken
// one reports the product's own message instead of timing out with nothing arriving.
func (s *sync) trigger(tt *testing.T) {
	tt.Helper()

	res, err := s.proj.Tenant().Admin.API.SyncGitHubSecretSyncWithResponse(tt.Context(), s.ID)
	if err != nil {
		tt.Fatalf("syncs: triggering: %v", err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("syncs: triggering returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	s.awaitTerminal(tt)
}

type outcome struct {
	status  string
	message string
}

// awaitTerminal blocks until the sync has succeeded or failed, and fails the test on
// failure with what the product reported.
func (s *sync) awaitTerminal(tt *testing.T) {
	tt.Helper()
	if got := s.awaitOutcome(tt); got.status == "failed" {
		tt.Fatalf("syncs: the sync failed: %s", got.message)
	}
}

// awaitOutcome blocks until the sync reaches a terminal status and reports it.
func (s *sync) awaitOutcome(tt *testing.T) outcome {
	tt.Helper()

	got, err := wait.For(tt.Context(), func(ctx context.Context) (outcome, bool, error) {
		res, rErr := s.proj.Tenant().Admin.API.GetGitHubSecretSyncWithResponse(ctx, s.ID)
		if rErr != nil {
			return outcome{}, false, rErr
		}
		if res.JSON200 == nil {
			return outcome{}, false, nil
		}

		out := outcome{}
		if v := res.JSON200.SecretSync.SyncStatus; v != nil {
			out.status = *v
		}
		if v := res.JSON200.SecretSync.LastSyncMessage; v != nil {
			out.message = *v
		}
		return out, out.status == "succeeded" || out.status == "failed", nil
	})
	if err != nil {
		tt.Fatalf("syncs: %v", err)
	}
	return got
}

// triggerExpectingFailure runs the sync and returns how it ended, for the cases where
// failing is the behaviour under test.
func (s *sync) triggerExpectingFailure(tt *testing.T) (status, message string) {
	tt.Helper()

	res, err := s.proj.Tenant().Admin.API.SyncGitHubSecretSyncWithResponse(tt.Context(), s.ID)
	if err != nil {
		tt.Fatalf("syncs: triggering: %v", err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("syncs: triggering returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}

	got := s.awaitOutcome(tt)
	return got.status, got.message
}
