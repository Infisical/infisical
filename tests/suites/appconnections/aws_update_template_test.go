package appconnections_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type updateTemplate struct {
	ProvisioningTemplate *struct {
		Kind                string            `json:"kind"`
		StackName           string            `json:"stackName"`
		Region              string            `json:"region"`
		Partition           string            `json:"partition"`
		StackURL            string            `json:"stackUrl"`
		TemplateURL         string            `json:"templateUrl"`
		TemplateVersion     string            `json:"templateVersion"`
		Parameters          map[string]string `json:"parameters"`
		CompanionParameters []string          `json:"companionParameters"`
	} `json:"provisioningTemplate"`
}

func getUpdateTemplate(t *testing.T, p *harness.Principal, connectionID uuid.UUID, useCases string, region *string) (int, []byte) {
	t.Helper()
	res, err := p.API.GetAwsConnectionProvisioningTemplateWithResponse(t.Context(), connectionID,
		&api.GetAwsConnectionProvisioningTemplateParams{UseCases: useCases, Region: region})
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func decodeUpdateTemplate(t *testing.T, status int, body []byte) updateTemplate {
	t.Helper()
	require.Equal(t, http.StatusOK, status, string(body))
	var out updateTemplate
	require.NoError(t, json.Unmarshal(body, &out))
	return out
}

func TestAWSAppConnection_UpdateTemplate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the stack and the toggles to turn on for added use cases", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		stackName := "infisical-aws-" + strings.ToLower(uuid.NewString()[:8])
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{"stackName": stackName}),
		})

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,parameter-store", nil)

		// Assert
		out := decodeUpdateTemplate(t, status, body)
		require.NotNil(t, out.ProvisioningTemplate)
		tpl := out.ProvisioningTemplate
		require.Equal(t, "cloudformation-update", tpl.Kind)
		require.Equal(t, stackName, tpl.StackName)
		require.Equal(t, "eu-west-1", tpl.Region)
		require.Equal(t, "aws", tpl.Partition)
		require.Contains(t, tpl.StackURL, "eu-west-1.console.aws.amazon.com/cloudformation")
		require.Contains(t, tpl.StackURL, stackName)
		require.True(t, strings.HasSuffix(tpl.TemplateURL, "/aws-app-connection/v1/infisical-aws-app-connection.yaml"), tpl.TemplateURL)
		require.Equal(t, "1", tpl.TemplateVersion)
		require.Equal(t, map[string]string{"EnableParameterStore": "true"}, tpl.Parameters)
		require.Empty(t, tpl.CompanionParameters)
	})

	t.Run("should return the toggles to turn off for removed use cases", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{
				"useCases": []string{"secrets-manager", "parameter-store", "acm-sync"},
			}),
		})

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,iam-rotation", nil)

		// Assert
		out := decodeUpdateTemplate(t, status, body)
		require.NotNil(t, out.ProvisioningTemplate)
		require.Equal(t, map[string]string{
			"EnableIamRotation":    "true",
			"EnableParameterStore": "false",
			"EnableAcmSync":        "false",
		}, out.ProvisioningTemplate.Parameters)
	})

	t.Run("should list no toggles when the use cases are unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager", nil)

		// Assert
		out := decodeUpdateTemplate(t, status, body)
		require.NotNil(t, out.ProvisioningTemplate)
		require.Empty(t, out.ProvisioningTemplate.Parameters)
	})

	t.Run("should name the extra parameters a newly enabled use case needs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,agent-vault-session-logs,private-ca", nil)

		// Assert
		out := decodeUpdateTemplate(t, status, body)
		require.NotNil(t, out.ProvisioningTemplate)
		require.Equal(t, map[string]string{
			"EnableAgentVaultSessionLogs": "true",
			"EnablePrivateCa":             "true",
		}, out.ProvisioningTemplate.Parameters)
		require.ElementsMatch(t,
			[]string{"AgentVaultSessionLogsBucket", "AgentVaultSessionLogsKeyPrefix", "PrivateCaArn"},
			out.ProvisioningTemplate.CompanionParameters)
	})

	t.Run("should return null for a connection with no recorded provisioning", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		noConfiguration := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", nil)
		clearedProvisioning := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{"provisioning": nil})

		for _, connID := range []uuid.UUID{noConfiguration, clearedProvisioning} {
			// Action
			status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,parameter-store", nil)

			// Assert
			out := decodeUpdateTemplate(t, status, body)
			require.Nil(t, out.ProvisioningTemplate)
			require.Contains(t, string(body), `"provisioningTemplate":null`)
		}
	})

	t.Run("should return null outside the commercial Partition", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{
				"partition": "aws-us-gov",
				"region":    "us-gov-west-1",
			}),
		})

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,parameter-store", nil)

		// Assert
		out := decodeUpdateTemplate(t, status, body)
		require.Nil(t, out.ProvisioningTemplate)
	})

	t.Run("should use the supplied region only when the connection has none recorded", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		withoutRegion := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{"region": nil}),
		})
		withRegion := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})
		suppliedRegion := "us-west-2"

		// Action
		fallbackStatus, fallbackBody := getUpdateTemplate(t, tn.Admin, withoutRegion, "secrets-manager,acm-sync", &suppliedRegion)
		recordedStatus, recordedBody := getUpdateTemplate(t, tn.Admin, withRegion, "secrets-manager,acm-sync", &suppliedRegion)

		// Assert
		fallback := decodeUpdateTemplate(t, fallbackStatus, fallbackBody)
		require.NotNil(t, fallback.ProvisioningTemplate)
		require.Equal(t, "us-west-2", fallback.ProvisioningTemplate.Region)
		recorded := decodeUpdateTemplate(t, recordedStatus, recordedBody)
		require.NotNil(t, recorded.ProvisioningTemplate)
		require.Equal(t, "eu-west-1", recorded.ProvisioningTemplate.Region)
	})

	t.Run("should ask for a region when the connection has none recorded and none is supplied", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{"region": nil}),
		})

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,acm-sync", nil)

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, string(body), "does not have a recorded stack region")
	})

	t.Run("should refuse a region outside the recorded Partition", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{"region": nil}),
		})
		govRegion := "us-gov-west-1"

		// Action
		status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,acm-sync", &govRegion)

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, string(body), "does not belong to the aws partition")
	})

	t.Run("should refuse malformed input with a readable message", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})
		badRegion := "not a region"

		for name, tc := range map[string]struct {
			useCases string
			region   *string
			message  string
		}{
			"no use cases":        {useCases: "", message: "Use cases must be 1 to 50"},
			"malformed use cases": {useCases: "Secrets Manager", message: "Use cases must be 1 to 50"},
			"malformed region":    {useCases: "secrets-manager", region: &badRegion, message: "Region must look like"},
		} {
			// Action
			status, body := getUpdateTemplate(t, tn.Admin, connID, tc.useCases, tc.region)

			// Assert
			require.Equal(t, http.StatusUnprocessableEntity, status, name+": "+string(body))
			require.Contains(t, string(body), tc.message, name)
		}
	})

	t.Run("should refuse a user who cannot edit an organization connection and reveal nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		stackName := "infisical-secret-stack-" + strings.ToLower(uuid.NewString()[:8])
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{"stackName": stackName}),
		})
		member := tn.NewUser(t)

		// Action
		status, body := getUpdateTemplate(t, member, connID, "secrets-manager,parameter-store", nil)

		// Assert
		require.Equal(t, http.StatusForbidden, status)
		require.NotContains(t, string(body), stackName)
		require.NotContains(t, string(body), "cloudformation-update")
		require.Contains(t, string(body), "not allowed")
	})

	t.Run("should refuse a user who cannot edit a project connection and reveal nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn)
		stackName := "infisical-secret-stack-" + strings.ToLower(uuid.NewString()[:8])
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, proj.ID, map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(map[string]any{"stackName": stackName}),
		})
		viewer := proj.NewUser(t, fixture.WithRoles("viewer"))

		// Action
		status, body := getUpdateTemplate(t, viewer, connID, "secrets-manager,parameter-store", nil)

		// Assert
		require.Equal(t, http.StatusForbidden, status)
		require.NotContains(t, string(body), stackName)
		require.NotContains(t, string(body), "cloudformation-update")
	})

	t.Run("should answer a project connection for a user who can edit it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, proj.ID, map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})
		admin := proj.NewUser(t, fixture.WithRoles("admin"))

		// Action
		status, body := getUpdateTemplate(t, admin, connID, "secrets-manager,parameter-store", nil)

		// Assert
		out := decodeUpdateTemplate(t, status, body)
		require.NotNil(t, out.ProvisioningTemplate)
		require.Equal(t, map[string]string{"EnableParameterStore": "true"}, out.ProvisioningTemplate.Parameters)
	})

	t.Run("should not find a connection that does not exist or belongs to another organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		foreign := fixture.NewAWSAppConnectionWithConfiguration(t, other, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})

		for name, connID := range map[string]uuid.UUID{"missing": uuid.New(), "other organization": foreign} {
			// Action
			status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,parameter-store", nil)

			// Assert
			require.Equal(t, http.StatusNotFound, status, name+": "+string(body))
			require.Contains(t, string(body), "Could not find App Connection", name)
		}
	})
}
