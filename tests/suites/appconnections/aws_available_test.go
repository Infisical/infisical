package appconnections_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestAWSAppConnection_AvailableList(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	createAWSNamed := func(t *testing.T, tn *harness.Tenant, name string, configuration map[string]any) string {
		t.Helper()
		accessKeyID := id.Nonce()
		fakenet.Track(t, fixture.FakenetAdmin(t, tn), aws.STS.Host(), accessKeyID)
		body := map[string]any{
			"name":   name,
			"method": "access-key",
			"credentials": map[string]string{
				"accessKeyId":     accessKeyID,
				"secretAccessKey": aws.SecretAccessKey(accessKeyID),
			},
		}
		if configuration != nil {
			body["configuration"] = configuration
		}
		raw, err := json.Marshal(body)
		require.NoError(t, err)

		res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(t.Context(),
			"application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
		var out struct {
			AppConnection struct {
				ID string `json:"id"`
			} `json:"appConnection"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &out))
		return out.AppConnection.ID
	}

	listAvailable := func(t *testing.T, tn *harness.Tenant) map[string]map[string]any {
		t.Helper()
		res, err := tn.Admin.API.ListAwsAvailableAppConnectionsWithResponse(t.Context(),
			&api.ListAwsAvailableAppConnectionsParams{})
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
		var out struct {
			AppConnections []map[string]any `json:"appConnections"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &out))
		byID := map[string]map[string]any{}
		for _, connection := range out.AppConnections {
			byID[connection["id"].(string)] = connection
		}
		return byID
	}

	t.Run("should list no recorded use cases for an Access Key connection, whatever it records", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		stackID := createAWSNamed(t, tn, "stack-"+id.Short(), map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{
				"useCases": []string{"secrets-manager", "parameter-store"},
			}),
		})
		manualID := createAWSNamed(t, tn, "manual-"+id.Short(), nil)
		emptyID := createAWSNamed(t, tn, "empty-"+id.Short(), map[string]any{})

		// Action
		listed := listAvailable(t, tn)

		// Assert
		for _, connectionID := range []string{stackID, manualID, emptyID} {
			connection, ok := listed[connectionID]
			require.True(t, ok, "the connection is not in the available list")
			require.Nil(t, connection["provisioning"])
		}
	})
}
