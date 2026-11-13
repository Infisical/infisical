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
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAWSAppConnection_ProvisioningMetadata(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// createAWS creates an access-key connection, optionally with a configuration, and
	// returns the status and the connection as the API shows it.
	createAWS := func(t *testing.T, tn *harness.Tenant, configuration map[string]any) (int, map[string]any) {
		t.Helper()
		accessKeyID := id.Nonce()
		fakenet.Track(t, fixture.FakenetAdmin(t, tn), aws.STS.Host(), accessKeyID)
		body := map[string]any{
			"name":   "aws-" + id.Short(),
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

		var out struct {
			AppConnection map[string]any `json:"appConnection"`
		}
		_ = json.Unmarshal(res.Body, &out)
		return res.StatusCode(), out.AppConnection
	}

	t.Run("should store the provisioning metadata when it is provided", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		provisioning := map[string]any{
			"launchMethod":    "launch-stack",
			"useCases":        []string{"secrets-manager-sync", "parameter-store-sync"},
			"stackName":       "infisical-aws-connection-" + id.Short(),
			"partition":       "aws",
			"templateVersion": "1.0.0",
		}

		// Action
		status, created := createAWS(t, tn, map[string]any{"provisioning": provisioning})

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, map[string]any{"provisioning": normalize(provisioning)}, created["configuration"])

		connectionID := created["id"].(string)
		res, err := tn.Admin.API.GetAwsAppConnectionWithResponse(t.Context(), uuid.MustParse(connectionID))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		var fetched struct {
			AppConnection map[string]any `json:"appConnection"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &fetched))
		require.Equal(t, map[string]any{"provisioning": normalize(provisioning)}, fetched.AppConnection["configuration"],
			"the metadata was not kept on the stored connection")
	})

	t.Run("should return the stack region and role name when they are provided", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		provisioning := map[string]any{
			"launchMethod":    "launch-stack",
			"useCases":        []string{"secrets-manager"},
			"stackName":       "infisical-aws-connection-" + id.Short(),
			"partition":       "aws",
			"templateVersion": "1",
			"region":          "eu-west-1",
			"roleName":        "infisical-app-connection-" + id.Short(),
		}

		// Action
		status, created := createAWS(t, tn, map[string]any{"provisioning": provisioning})

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, map[string]any{"provisioning": normalize(provisioning)}, created["configuration"])

		res, err := tn.Admin.API.GetAwsAppConnectionWithResponse(t.Context(), uuid.MustParse(created["id"].(string)))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		var fetched struct {
			AppConnection map[string]any `json:"appConnection"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &fetched))
		require.Equal(t, map[string]any{"provisioning": normalize(provisioning)}, fetched.AppConnection["configuration"],
			"the region and role name were not kept on the stored connection")
	})

	t.Run("should refuse a malformed stack region and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		before, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), &api.ListAwsAppConnectionsParams{})
		require.NoError(t, err)

		// Action
		status, _ := createAWS(t, tn, map[string]any{"provisioning": map[string]any{
			"launchMethod":    "launch-stack",
			"useCases":        []string{"secrets-manager"},
			"stackName":       "infisical-aws-connection-" + id.Short(),
			"partition":       "aws",
			"templateVersion": "1",
			"region":          "not a region",
		}})

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, status)
		after, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), &api.ListAwsAppConnectionsParams{})
		require.NoError(t, err)
		require.Equal(t, before.Body, after.Body, "a connection was created despite the refusal")
	})

	t.Run("should have no provisioning metadata when it is not provided", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		status, created := createAWS(t, tn, nil)

		// Assert
		require.Equal(t, http.StatusOK, status)
		if configuration, ok := created["configuration"].(map[string]any); ok {
			require.Nil(t, configuration["provisioning"])
		}
	})

	t.Run("should refuse a malformed stack name and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		before, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), &api.ListAwsAppConnectionsParams{})
		require.NoError(t, err)

		// Action
		status, _ := createAWS(t, tn, map[string]any{"provisioning": map[string]any{
			"launchMethod":    "launch-stack",
			"useCases":        []string{"secrets-manager-sync"},
			"stackName":       "not a stack name!",
			"partition":       "aws",
			"templateVersion": "1.0.0",
		}})

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, status)
		after, err := tn.Admin.API.ListAwsAppConnectionsWithResponse(t.Context(), &api.ListAwsAppConnectionsParams{})
		require.NoError(t, err)
		require.Equal(t, before.Body, after.Body, "a connection was created despite the refusal")
	})
}

func normalize(v map[string]any) map[string]any {
	raw, _ := json.Marshal(v)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}
