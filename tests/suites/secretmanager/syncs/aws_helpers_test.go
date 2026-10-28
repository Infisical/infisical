package syncs_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// AWS syncs exist for what GitHub cannot do: import from the destination, and the
// provider rules of Parameter Store and Secrets Manager. Kept apart from helpers_test.go
// because every generated AWS type differs from GitHub's, so the two share only the
// options and whenIdle.

// setupAWS returns a project, an AWS connection, and a handle on the account it uses.
func setupAWS(t *testing.T) (*fixture.Project, *fixture.AppConnection, *aws.ControlPlane) {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
	return proj, conn, aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
}

type awsDestination struct {
	parameterStore bool
	config         map[string]any
}

// parameterStorePath is a Parameter Store destination, a path such as "/app/".
func parameterStorePath(path string) awsDestination {
	return awsDestination{parameterStore: true, config: map[string]any{"region": aws.Region, "path": path}}
}

// oneToOne holds each secret as its own Secrets Manager secret.
func oneToOne() awsDestination {
	return awsDestination{config: map[string]any{"region": aws.Region, "mappingBehavior": "one-to-one"}}
}

// manyToOne holds every secret as one JSON document in the named secret.
func manyToOne(secretName string) awsDestination {
	return awsDestination{config: map[string]any{"region": aws.Region, "mappingBehavior": "many-to-one", "secretName": secretName}}
}

type awsSyncConfig struct {
	syncConfig
	initial string
	tags    map[string]string
}

// awsOption is either a shared syncOption or one only AWS syncs take.
type awsOption interface{ applyAWS(*awsSyncConfig) }

func (o syncOption) applyAWS(c *awsSyncConfig) { o(&c.syncConfig) }

type awsOnly func(*awsSyncConfig)

func (o awsOnly) applyAWS(c *awsSyncConfig) { o(c) }

// initialSync sets what the first run does with secrets already at the destination.
func initialSync(behavior string) awsOption {
	return awsOnly(func(c *awsSyncConfig) { c.initial = behavior })
}

func withTag(key, value string) awsOption {
	return awsOnly(func(c *awsSyncConfig) {
		if c.tags == nil {
			c.tags = map[string]string{}
		}
		c.tags[key] = value
	})
}

type awsSync struct {
	ID   uuid.UUID
	proj *fixture.Project
	dest awsDestination
}

func newAWSSync(tt *testing.T, p *fixture.Project, conn *fixture.AppConnection, dest awsDestination, opts ...awsOption) *awsSync {
	tt.Helper()
	cfg := awsSyncConfig{
		syncConfig: syncConfig{environment: "dev", secretPath: "/", name: "sync-" + id.Short()},
		initial:    "overwrite-destination",
	}
	for _, o := range opts {
		o.applyAWS(&cfg)
	}

	options := map[string]any{"initialSyncBehavior": cfg.initial}
	if cfg.keySchema != "" {
		options["keySchema"] = cfg.keySchema
	}
	if cfg.disableSecretDeletion {
		options["disableSecretDeletion"] = true
	}
	if cfg.includeSubFolders {
		options["includeAllSubFolders"] = true
	}
	if len(cfg.tags) > 0 {
		tags := []map[string]string{}
		for k, v := range cfg.tags {
			tags = append(tags, map[string]string{"key": k, "value": v})
		}
		options["tags"] = tags
	}
	raw, err := json.Marshal(map[string]any{
		"name":              cfg.name,
		"projectId":         p.ID,
		"connectionId":      conn.ID,
		"environment":       cfg.environment,
		"secretPath":        cfg.secretPath,
		"isAutoSyncEnabled": cfg.autoSync,
		"destinationConfig": dest.config,
		"syncOptions":       options,
	})
	require.NoError(tt, err)

	client := p.Tenant().Admin.API
	if cfg.as != nil {
		client = cfg.as.API
	}
	var status int
	var body []byte
	if dest.parameterStore {
		res, cErr := client.CreateAwsParameterStoreSecretSyncWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
		require.NoError(tt, cErr, "creating a sync")
		status, body = res.StatusCode(), res.Body
	} else {
		res, cErr := client.CreateAwsSecretsManagerSecretSyncWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
		require.NoError(tt, cErr, "creating a sync")
		status, body = res.StatusCode(), res.Body
	}
	require.Equalf(tt, http.StatusOK, status, "creating a sync: %s", apierr.Body(body))

	var out struct {
		SecretSync struct {
			ID uuid.UUID `json:"id"`
		} `json:"secretSync"`
	}
	require.NoError(tt, json.Unmarshal(body, &out))
	return &awsSync{ID: out.SecretSync.ID, proj: p, dest: dest}
}

type awsSyncView struct {
	SyncStatus        *string `json:"syncStatus"`
	LastSyncMessage   *string `json:"lastSyncMessage"`
	ImportStatus      *string `json:"importStatus"`
	LastImportMessage *string `json:"lastImportMessage"`
}

func (s *awsSync) view(ctx context.Context) (awsSyncView, error) {
	client := s.proj.Tenant().Admin.API
	var body []byte
	if s.dest.parameterStore {
		res, err := client.GetAwsParameterStoreSecretSyncWithResponse(ctx, s.ID)
		if err != nil {
			return awsSyncView{}, err
		}
		body = res.Body
	} else {
		res, err := client.GetAwsSecretsManagerSecretSyncWithResponse(ctx, s.ID)
		if err != nil {
			return awsSyncView{}, err
		}
		body = res.Body
	}
	var out struct {
		SecretSync awsSyncView `json:"secretSync"`
	}
	err := json.Unmarshal(body, &out)
	return out.SecretSync, err
}

func (s *awsSync) start(tt *testing.T) {
	tt.Helper()
	client := s.proj.Tenant().Admin.API
	var status int
	var body []byte
	whenIdle(tt, "triggering a sync", func(ctx context.Context) (int, []byte, error) {
		if s.dest.parameterStore {
			res, err := client.SyncAwsParameterStoreSecretSyncWithResponse(ctx, s.ID)
			if err != nil {
				return 0, nil, err
			}
			status, body = res.StatusCode(), res.Body
		} else {
			res, err := client.SyncAwsSecretsManagerSecretSyncWithResponse(ctx, s.ID)
			if err != nil {
				return 0, nil, err
			}
			status, body = res.StatusCode(), res.Body
		}
		return status, body, nil
	})
	require.Equalf(tt, http.StatusOK, status, "triggering a sync: %s", apierr.Body(body))
}

// trigger runs the sync and requires it to succeed.
func (s *awsSync) trigger(tt *testing.T) {
	tt.Helper()
	got := s.triggerExpectingFailure(tt)
	require.NotEqualf(tt, "failed", got.status, "the sync failed: %s", got.message)
}

func (s *awsSync) triggerExpectingFailure(tt *testing.T) outcome {
	tt.Helper()
	s.start(tt)
	return s.await(tt, "the sync to finish", func(v awsSyncView) (*string, *string) { return v.SyncStatus, v.LastSyncMessage })
}

// importSecrets runs an import from the destination and returns how it ended.
func (s *awsSync) importSecrets(tt *testing.T, behavior string) outcome {
	tt.Helper()
	client := s.proj.Tenant().Admin.API
	var status int
	var body []byte
	whenIdle(tt, "importing secrets", func(ctx context.Context) (int, []byte, error) {
		if s.dest.parameterStore {
			res, err := client.ImportAwsParameterStoreSecretSyncSecretsWithResponse(ctx, s.ID,
				&api.ImportAwsParameterStoreSecretSyncSecretsParams{
					ImportBehavior: api.ImportAwsParameterStoreSecretSyncSecretsParamsImportBehavior(behavior)})
			if err != nil {
				return 0, nil, err
			}
			status, body = res.StatusCode(), res.Body
		} else {
			res, err := client.ImportAwsSecretsManagerSecretSyncSecretsWithResponse(ctx, s.ID,
				&api.ImportAwsSecretsManagerSecretSyncSecretsParams{
					ImportBehavior: api.ImportAwsSecretsManagerSecretSyncSecretsParamsImportBehavior(behavior)})
			if err != nil {
				return 0, nil, err
			}
			status, body = res.StatusCode(), res.Body
		}
		return status, body, nil
	})
	require.Equalf(tt, http.StatusOK, status, "importing secrets: %s", apierr.Body(body))
	return s.await(tt, "the import to finish", func(v awsSyncView) (*string, *string) { return v.ImportStatus, v.LastImportMessage })
}

func (s *awsSync) await(tt *testing.T, what string, read func(awsSyncView) (status, message *string)) outcome {
	tt.Helper()
	got, err := wait.For(tt.Context(), func(ctx context.Context) (outcome, bool, error) {
		v, err := s.view(ctx)
		if err != nil {
			return outcome{}, false, err
		}
		var out outcome
		status, message := read(v)
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

// secretsAt is what an application reading the folder gets from Infisical.
func secretsAt(tt *testing.T, p *fixture.Project, path string) map[string]string {
	tt.Helper()
	out := map[string]string{}
	for _, s := range secretmanager.ListSecrets(tt, p, "dev", secretmanager.WithPath(path)) {
		out[s.Key] = s.Value
	}
	return out
}

// parameterValues is the parameters the account holds, by stored name.
func parameterValues(tt *testing.T, cp *aws.ControlPlane) map[string]string {
	tt.Helper()
	out := map[string]string{}
	for name, p := range cp.Parameters(tt) {
		out[name] = p.Value
	}
	return out
}

// secretValues is the Secrets Manager secrets the account holds, by name.
func secretValues(tt *testing.T, cp *aws.ControlPlane) map[string]string {
	tt.Helper()
	out := map[string]string{}
	for name, s := range cp.Secrets(tt) {
		if s.DeletedDate == nil {
			out[name] = s.SecretString
		}
	}
	return out
}
