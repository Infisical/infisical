package appconnections_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAppConnection_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the organization's other connections when a project holding one is deleted", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A deleted project's key no longer resolves, so decrypting its connection
			failed the whole organization's list with a 404.`)

		// Setup
		tn := h.NewTenant(t)
		orgConn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newProjectAWSConnection(t, proj)
		deleteProject(t, proj)

		// Action
		res, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "listing returned %s", apierr.Body(res.Body))
		require.Contains(t, listedIDs(t, res.Body), orgConn.ID)
	})

	t.Run("should hide a project's connections from the organization's list when the project is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		projConn := newProjectAWSConnection(t, proj)
		deleteProject(t, proj)

		// Action
		res, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "listing returned %s", apierr.Body(res.Body))
		require.NotContains(t, listedIDs(t, res.Body), projConn)
	})

	t.Run("should list a deleted project's connections again when the project is restored", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		projConn := newProjectAWSConnection(t, proj)
		deleteProject(t, proj)
		restored, err := tn.Admin.API.RestoreProjectWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, restored.StatusCode(), "restoring the project returned %s", apierr.Body(restored.Body))

		// Action
		res, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "listing returned %s", apierr.Body(res.Body))
		require.Contains(t, listedIDs(t, res.Body), projConn)
	})
}

// newProjectAWSConnection creates an AWS connection scoped to the project, which
// fixture.NewAppConnection cannot: it only creates organization connections.
func newProjectAWSConnection(tt *testing.T, p *fixture.Project) uuid.UUID {
	tt.Helper()

	tn := p.Tenant()
	nonce := id.Nonce()
	fakenet.Track(tt, fixture.FakenetAdmin(tt, tn), aws.STS.Host(), nonce)

	raw, err := fixture.AWSAccessKeyAppConnectionBody("aws-"+id.Short(), nonce, aws.SecretAccessKey(nonce))
	require.NoError(tt, err)
	var body map[string]any
	require.NoError(tt, json.Unmarshal(raw, &body))
	body["projectId"] = p.ID
	raw, err = json.Marshal(body)
	require.NoError(tt, err)

	res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating the connection returned %s", apierr.Body(res.Body))
	var out struct {
		AppConnection struct {
			ID        uuid.UUID `json:"id"`
			ProjectID string    `json:"projectId"`
		} `json:"appConnection"`
	}
	require.NoError(tt, json.Unmarshal(res.Body, &out))
	require.Equal(tt, p.ID, out.AppConnection.ProjectID, "the connection was not scoped to the project")
	return out.AppConnection.ID
}

func deleteProject(tt *testing.T, p *fixture.Project) {
	tt.Helper()

	res, err := p.Tenant().Admin.API.DeleteProjectWithResponse(tt.Context(), p.ID, nil)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "deleting the project returned %s", apierr.Body(res.Body))
}

// listedIDs reads the ids from the raw body: each item is a union whose As… methods
// accept any branch.
func listedIDs(tt *testing.T, body []byte) []uuid.UUID {
	tt.Helper()

	var out struct {
		AppConnections []struct {
			ID uuid.UUID `json:"id"`
		} `json:"appConnections"`
	}
	require.NoError(tt, json.Unmarshal(body, &out))
	ids := make([]uuid.UUID, 0, len(out.AppConnections))
	for _, c := range out.AppConnections {
		ids = append(ids, c.ID)
	}
	return ids
}
