package awsassumerole_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const account = "123456789012"

func roleArn(account, name string) string { return "arn:aws:iam::" + account + ":role/" + name }

func provisioning(roleName string) map[string]any {
	out := map[string]any{
		"launchMethod":    "launch-stack",
		"useCases":        []string{"secrets-manager", "parameter-store"},
		"stackName":       "infisical-aws-connection-" + id.Short(),
		"partition":       "aws",
		"templateVersion": "1",
		"region":          "eu-west-1",
	}
	if roleName != "" {
		out["roleName"] = roleName
	}
	return out
}

// createAssumeRole creates an assume-role connection that records the Launch Stack it came from.
func createAssumeRole(t *testing.T, tn *harness.Tenant, arn string, provisioning map[string]any) uuid.UUID {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"name":          "aws-" + id.Short(),
		"method":        "assume-role",
		"credentials":   map[string]string{"roleArn": arn},
		"configuration": map[string]any{"provisioning": provisioning},
	})
	require.NoError(t, err)
	res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
	return uuid.MustParse(connection(t, res.Body)["id"].(string))
}

func saveRoleArn(t *testing.T, tn *harness.Tenant, connectionID uuid.UUID, arn string) {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"credentials": map[string]string{"roleArn": arn}})
	require.NoError(t, err)
	res, err := tn.Admin.API.UpdateAwsAppConnectionWithBodyWithResponse(t.Context(), connectionID, "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
}

func recordedProvisioning(t *testing.T, tn *harness.Tenant, connectionID uuid.UUID) any {
	t.Helper()
	res, err := tn.Admin.API.GetAwsAppConnectionWithResponse(t.Context(), connectionID)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
	configuration, _ := connection(t, res.Body)["configuration"].(map[string]any)
	return configuration["provisioning"]
}

func connection(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var out struct {
		AppConnection map[string]any `json:"appConnection"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	return out.AppConnection
}

func normalized(t *testing.T, v map[string]any) any {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	var out any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

func TestAWSAppConnection_RoleArnAgainstRecordedStack(t *testing.T) {
	h := harness.From(t)

	t.Run("should keep the provisioning when the same stack's Role ARN is saved", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		roleName := "infisical-app-connection-" + id.Short()
		recorded := provisioning(roleName)
		connectionID := createAssumeRole(t, tn, roleArn(account, roleName), recorded)

		// Action
		saveRoleArn(t, tn, connectionID, roleArn(account, roleName))

		// Assert
		require.Equal(t, normalized(t, recorded), recordedProvisioning(t, tn, connectionID))
	})

	t.Run("should clear the provisioning when a Role ARN with another role name is saved", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		roleName := "infisical-app-connection-" + id.Short()
		connectionID := createAssumeRole(t, tn, roleArn(account, roleName), provisioning(roleName))

		// Action
		saveRoleArn(t, tn, connectionID, roleArn(account, "hand-made-"+id.Short()))

		// Assert
		require.Nil(t, recordedProvisioning(t, tn, connectionID))
	})

	t.Run("should clear the provisioning when the stack's role name is saved in another account", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		roleName := "infisical-app-connection-" + id.Short()
		connectionID := createAssumeRole(t, tn, roleArn(account, roleName), provisioning(roleName))

		// Action
		saveRoleArn(t, tn, connectionID, roleArn("210987654321", roleName))

		// Assert
		require.Nil(t, recordedProvisioning(t, tn, connectionID))
	})

	t.Run("should audit that a changed Role ARN left the connection with no recorded use cases", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		roleName := "infisical-app-connection-" + id.Short()
		connectionID := createAssumeRole(t, tn, roleArn(account, roleName), provisioning(roleName))

		// Action
		saveRoleArn(t, tn, connectionID, roleArn(account, "hand-made-"+id.Short()))

		// Assert
		events := fixture.WaitForAuditEvents(t, tn, "update-app-connection", 1, func(e fixture.AuditEvent) bool {
			return e.Metadata["connectionId"] == connectionID.String()
		})
		require.Equal(t, true, events[0].Metadata["credentialsUpdated"])
		require.Equal(t, []any{}, events[0].Metadata["useCaseIds"])
	})

	t.Run("should clear the provisioning of a record without a role name when the Role ARN changes", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		connectionID := createAssumeRole(t, tn, roleArn(account, "infisical-app-connection-"+id.Short()), provisioning(""))

		// Action
		saveRoleArn(t, tn, connectionID, roleArn(account, "hand-made-"+id.Short()))

		// Assert
		require.Nil(t, recordedProvisioning(t, tn, connectionID))
	})

	t.Run("should keep the provisioning of a record without a role name when the Role ARN is unchanged", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		arn := roleArn(account, "infisical-app-connection-"+id.Short())
		recorded := provisioning("")
		connectionID := createAssumeRole(t, tn, arn, recorded)

		// Action
		saveRoleArn(t, tn, connectionID, arn)

		// Assert
		require.Equal(t, normalized(t, recorded), recordedProvisioning(t, tn, connectionID))
	})
}
