package awslaunch_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAWSProvisioningTemplate_Update(t *testing.T) {
	h := harness.From(t)

	t.Run("should use the same template location as Launch Stack", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		connID := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})
		launch := getLaunch(t, tn.Admin, &api.GetAwsProvisioningTemplateParams{})

		// Action
		res, err := tn.Admin.API.GetAwsConnectionProvisioningTemplateWithResponse(t.Context(), connID,
			&api.GetAwsConnectionProvisioningTemplateParams{UseCases: "secrets-manager,parameter-store"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
		var out struct {
			ProvisioningTemplate struct {
				Kind        string `json:"kind"`
				TemplateURL string `json:"templateUrl"`
			} `json:"provisioningTemplate"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &out))
		require.Equal(t, "cloudformation-update", out.ProvisioningTemplate.Kind)
		require.Equal(t, templateBase+"/aws-app-connection/v1/infisical-aws-app-connection.yaml", out.ProvisioningTemplate.TemplateURL)
		require.Equal(t, launch.ProvisioningTemplate.TemplateURL, out.ProvisioningTemplate.TemplateURL)
	})
}
