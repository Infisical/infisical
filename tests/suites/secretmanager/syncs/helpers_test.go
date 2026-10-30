package syncs_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"path"
	"slices"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
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
	includeSubFolders     bool
	environment           string
	secretPath            string
	name                  string
	as                    *harness.Principal
}

type syncOption func(*syncConfig)

// autoSync defaults to true in the schema, so a test choosing when the first push
// happens has to turn it off.
func autoSync(on bool) syncOption { return func(c *syncConfig) { c.autoSync = on } }

func keySchema(s string) syncOption { return func(c *syncConfig) { c.keySchema = s } }

func disableSecretDeletion() syncOption {
	return func(c *syncConfig) { c.disableSecretDeletion = true }
}

func includeSubFolders() syncOption { return func(c *syncConfig) { c.includeSubFolders = true } }

func fromEnv(env string) syncOption { return func(c *syncConfig) { c.environment = env } }

func fromPath(p string) syncOption { return func(c *syncConfig) { c.secretPath = p } }

func withName(n string) syncOption { return func(c *syncConfig) { c.name = n } }

// as creates the sync as a principal other than the tenant administrator.
func as(p *harness.Principal) syncOption { return func(c *syncConfig) { c.as = p } }

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

	res := createSync(tt, p, conn, dest, opts...)
	require.NotNilf(tt, res.JSON200, "creating a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return &sync{ID: res.JSON200.SecretSync.Id, proj: p}
}

// createSync is newSync for a test about whether the create is accepted.
func createSync(tt *testing.T, p *fixture.Project, conn *fixture.AppConnection,
	dest destination, opts ...syncOption) *api.CreateGitHubSecretSyncResponse {
	tt.Helper()

	cfg := syncConfig{autoSync: false, environment: "dev", secretPath: "/", name: "sync-" + uuid.NewString()[:8]}
	for _, o := range opts {
		o(&cfg)
	}
	client := p.Tenant().Admin.API
	if cfg.as != nil {
		client = cfg.as.API
	}

	body := api.CreateGitHubSecretSyncJSONRequestBody{
		Name:              cfg.name,
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
	if cfg.includeSubFolders {
		body.SyncOptions.IncludeAllSubFolders = &cfg.includeSubFolders
	}

	res, err := client.CreateGitHubSecretSyncWithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a sync")
	return res
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
	var res *api.SyncGitHubSecretSyncResponse
	whenIdle(tt, "triggering a sync", func(ctx context.Context) (int, []byte, error) {
		var err error
		res, err = s.proj.Tenant().Admin.API.SyncGitHubSecretSyncWithResponse(ctx, s.ID)
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	})
	require.NotNilf(tt, res.JSON200, "triggering a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func (s *sync) removeSecrets(tt *testing.T) {
	tt.Helper()
	var res *api.RemoveGitHubSecretSyncSecretsResponse
	whenIdle(tt, "removing synced secrets", func(ctx context.Context) (int, []byte, error) {
		var err error
		res, err = s.proj.Tenant().Admin.API.RemoveGitHubSecretSyncSecretsWithResponse(ctx, s.ID)
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	})
	require.NotNilf(tt, res.JSON200, "removing synced secrets returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// deleteRemovingSecrets is a delete with removeSecrets, which runs on the queue.
func (s *sync) deleteRemovingSecrets(tt *testing.T) {
	tt.Helper()
	param := api.DeleteGitHubSecretSyncParamsRemoveSecretsTrue
	var res *api.DeleteGitHubSecretSyncResponse
	whenIdle(tt, "deleting a sync", func(ctx context.Context) (int, []byte, error) {
		var err error
		res, err = s.proj.Tenant().Admin.API.DeleteGitHubSecretSyncWithResponse(ctx, s.ID,
			&api.DeleteGitHubSecretSyncParams{RemoveSecrets: &param})
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	})
	require.NotNilf(tt, res.JSON200, "deleting a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// whenIdle retries a call the sync's job lock refuses. A job records its final status
// a moment before it releases the lock, so a call made as soon as the status reads
// terminal can still find the previous job holding it.
func whenIdle(tt *testing.T, what string, call func(context.Context) (int, []byte, error)) {
	tt.Helper()
	var body []byte
	_, err := wait.For(tt.Context(), func(ctx context.Context) (struct{}, bool, error) {
		status, b, err := call(ctx)
		if err != nil {
			return struct{}{}, false, err
		}
		body = b
		busy := status == http.StatusBadRequest && bytes.Contains(b, []byte("A job for this sync is already in progress"))
		return struct{}{}, !busy, nil
	})
	require.NoErrorf(tt, err, "%s: %s", what, apierr.Body(body))
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
	return s.await(tt, "the sync to finish", func(r *api.GetGitHubSecretSyncResponse) (*string, *string) {
		return r.JSON200.SecretSync.SyncStatus, r.JSON200.SecretSync.LastSyncMessage
	})
}

// awaitRemoveOutcome waits on the remove job, which records its own status beside
// the sync's.
func (s *sync) awaitRemoveOutcome(tt *testing.T) outcome {
	tt.Helper()
	return s.await(tt, "the remove to finish", func(r *api.GetGitHubSecretSyncResponse) (*string, *string) {
		return r.JSON200.SecretSync.RemoveStatus, r.JSON200.SecretSync.LastRemoveMessage
	})
}

func (s *sync) await(tt *testing.T, what string,
	read func(*api.GetGitHubSecretSyncResponse) (status, message *string)) outcome {
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
		status, message := read(res)
		if status != nil {
			out.status = *status
		}
		if message != nil {
			out.message = *message
		}
		return out, out.status == "succeeded" || out.status == "failed", nil
	})
	require.NoError(tt, err, "waiting for "+what)
	return got
}

// awaitGone waits for a delete that runs on the queue, such as one that removes the
// destination secrets first.
func (s *sync) awaitGone(tt *testing.T) {
	tt.Helper()
	wait.Until(tt, "the sync to be deleted", func() bool {
		res, err := s.proj.Tenant().Admin.API.GetGitHubSecretSyncWithResponse(tt.Context(), s.ID)
		return err == nil && res.StatusCode() == http.StatusNotFound
	})
}

func (s *sync) get(tt *testing.T) *api.GetGitHubSecretSyncResponse {
	tt.Helper()
	res, err := s.proj.Tenant().Admin.API.GetGitHubSecretSyncWithResponse(tt.Context(), s.ID)
	require.NoError(tt, err, "reading a sync")
	require.NotNilf(tt, res.JSON200, "reading a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// update sends the body as JSON, because the generated body's destination config is
// a union and would serialise as {}.
func (s *sync) update(tt *testing.T, client *api.ClientWithResponses, body map[string]any) *api.UpdateGitHubSecretSyncResponse {
	tt.Helper()
	raw, err := json.Marshal(body)
	require.NoError(tt, err)
	res, err := client.UpdateGitHubSecretSyncWithBodyWithResponse(tt.Context(), s.ID, "application/json", bytes.NewReader(raw))
	require.NoError(tt, err, "updating a sync")
	return res
}

func (s *sync) delete(tt *testing.T, client *api.ClientWithResponses, removeSecrets bool) *api.DeleteGitHubSecretSyncResponse {
	tt.Helper()
	param := api.DeleteGitHubSecretSyncParamsRemoveSecretsFalse
	if removeSecrets {
		param = api.DeleteGitHubSecretSyncParamsRemoveSecretsTrue
	}
	res, err := client.DeleteGitHubSecretSyncWithResponse(tt.Context(), s.ID,
		&api.DeleteGitHubSecretSyncParams{RemoveSecrets: &param})
	require.NoError(tt, err, "deleting a sync")
	return res
}

func listSyncNames(tt *testing.T, client *api.ClientWithResponses, p *fixture.Project) []string {
	tt.Helper()
	res, err := client.ListGitHubSecretSyncsWithResponse(tt.Context(), &api.ListGitHubSecretSyncsParams{ProjectId: p.ID})
	require.NoError(tt, err, "listing syncs")
	require.NotNilf(tt, res.JSON200, "listing syncs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	names := make([]string, 0, len(res.JSON200.SecretSyncs))
	for _, s := range res.JSON200.SecretSyncs {
		names = append(names, s.Name)
	}
	return names
}

// deleteFolder force-deletes a folder at an absolute path such as "/app/api".
func deleteFolder(tt *testing.T, p *fixture.Project, env, folderPath string) {
	tt.Helper()
	parent, name := path.Split(path.Clean(folderPath))
	res, err := p.Tenant().Admin.API.DeleteSecretFolderWithResponse(tt.Context(), name, api.DeleteSecretFolderJSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		Path:        &parent,
		ForceDelete: new(true),
	})
	require.NoErrorf(tt, err, "deleting folder %s", folderPath)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "deleting folder %s returned %s", folderPath, apierr.Body(res.Body))
}

// message is an error body's message. A validation failure carries a list of
// issues there, which comes back as its JSON text.
func message(body []byte) string {
	var out struct {
		Message json.RawMessage `json:"message"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return string(body)
	}
	var s string
	if err := json.Unmarshal(out.Message, &s); err == nil {
		return s
	}
	return string(out.Message)
}

// syncBudget is how long a fake event takes to follow a change Infisical queues: up
// to 10 s of start jitter on every sync job, plus a 3 s debounce before an auto-sync.
var syncBudget = fakenet.Within(30 * time.Second)

func created(name string) func(github.SecretCreated) bool {
	return func(e github.SecretCreated) bool { return e.SecretName == name }
}

func createdIn(scope, name string) func(github.SecretCreated) bool {
	return func(e github.SecretCreated) bool { return e.Scope == scope && e.SecretName == name }
}

// keysOf is the sorted key set a destination store holds.
func keysOf(secrets map[string]github.Secret) []string {
	keys := make([]string, 0, len(secrets))
	for k := range secrets {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}
