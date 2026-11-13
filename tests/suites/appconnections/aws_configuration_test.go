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
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type awsStackConnection struct {
	ID           uuid.UUID
	AccessKeyID  string
	Provisioning map[string]any
}

func TestAWSAppConnection_UpdateConfiguration(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// stackManaged creates a connection that records the Launch Stack it came from.
	stackManaged := func(t *testing.T, tn *harness.Tenant, useCases ...string) awsStackConnection {
		t.Helper()
		accessKeyID := id.Nonce()
		fakenet.Track(t, fixture.FakenetAdmin(t, tn), aws.STS.Host(), accessKeyID)
		provisioning := map[string]any{
			"launchMethod":    "launch-stack",
			"useCases":        useCases,
			"stackName":       "infisical-aws-connection-" + id.Short(),
			"partition":       "aws",
			"templateVersion": "1",
			"region":          "eu-west-1",
			"roleName":        "infisical-app-connection-" + id.Short(),
		}
		raw, err := json.Marshal(map[string]any{
			"name":   "aws-" + id.Short(),
			"method": "access-key",
			"credentials": map[string]string{
				"accessKeyId":     accessKeyID,
				"secretAccessKey": aws.SecretAccessKey(accessKeyID),
			},
			"configuration": map[string]any{"provisioning": provisioning},
		})
		require.NoError(t, err)
		res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
		return awsStackConnection{ID: uuid.MustParse(decodeConnection(t, res.Body)["id"].(string)), AccessKeyID: accessKeyID, Provisioning: provisioning}
	}

	patch := func(t *testing.T, tn *harness.Tenant, connID uuid.UUID, body map[string]any) (int, []byte) {
		t.Helper()
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		res, err := tn.Admin.API.UpdateAwsAppConnectionWithBodyWithResponse(t.Context(), connID, "application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		return res.StatusCode(), res.Body
	}

	read := func(t *testing.T, tn *harness.Tenant, connID uuid.UUID) map[string]any {
		t.Helper()
		res, err := tn.Admin.API.GetAwsAppConnectionWithResponse(t.Context(), connID)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
		return decodeConnection(t, res.Body)
	}

	t.Run("should change the recorded use cases without credentials and leave the credentials alone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := stackManaged(t, tn, "secrets-manager")
		requested := conn.provisioningWith("secrets-manager", "parameter-store")

		// Action
		status, body := patch(t, tn, conn.ID, map[string]any{"configuration": map[string]any{"provisioning": requested}})

		// Assert
		require.Equal(t, http.StatusOK, status, string(body))
		saved := read(t, tn, conn.ID)
		require.Equal(t, map[string]any{"provisioning": normalize(requested)}, saved["configuration"])
		require.Equal(t, map[string]any{"accessKeyId": conn.AccessKeyID}, saved["credentials"])
	})

	t.Run("should audit that the configuration changed and which use cases it now records", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := stackManaged(t, tn, "secrets-manager")
		requested := conn.provisioningWith("secrets-manager", "parameter-store")

		// Action
		status, body := patch(t, tn, conn.ID, map[string]any{"configuration": map[string]any{"provisioning": requested}})

		// Assert
		require.Equal(t, http.StatusOK, status, string(body))
		events := fixture.WaitForAuditEvents(t, tn, "update-app-connection", 1, func(e fixture.AuditEvent) bool {
			return e.Metadata["connectionId"] == conn.ID.String()
		})
		require.Equal(t, true, events[0].Metadata["configurationUpdated"])
		require.Equal(t, false, events[0].Metadata["credentialsUpdated"])
		require.Equal(t, []any{"secrets-manager", "parameter-store"}, events[0].Metadata["useCaseIds"])
		require.NotContains(t, events[0].Metadata, "configuration", "the audit log must not carry the configuration itself")
	})

	t.Run("should refuse provisioning without use cases and keep what was recorded", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := stackManaged(t, tn, "secrets-manager")
		requested := conn.provisioningWith()

		// Action
		status, body := patch(t, tn, conn.ID, map[string]any{"configuration": map[string]any{"provisioning": requested}})

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, status, string(body))
		require.Equal(t, map[string]any{"provisioning": normalize(conn.Provisioning)}, read(t, tn, conn.ID)["configuration"])
	})

	t.Run("should keep the recorded provisioning when an update does not carry a configuration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := stackManaged(t, tn, "secrets-manager")

		// Action
		status, body := patch(t, tn, conn.ID, map[string]any{"description": "renamed in a test"})

		// Assert
		require.Equal(t, http.StatusOK, status, string(body))
		require.Equal(t, map[string]any{"provisioning": normalize(conn.Provisioning)}, read(t, tn, conn.ID)["configuration"])
	})
}

func (c awsStackConnection) provisioningWith(useCases ...string) map[string]any {
	out := map[string]any{}
	for k, v := range c.Provisioning {
		out[k] = v
	}
	out["useCases"] = useCases
	return out
}

func decodeConnection(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var out struct {
		AppConnection map[string]any `json:"appConnection"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	return out.AppConnection
}
