package appconnections_test

import (
	"encoding/json"
	"net/http"
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

	t.Run("should return null for an Access Key connection, whatever it records", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		withProvisioning := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{
			"provisioning": fixture.AWSLaunchStackProvisioning(nil),
		})
		noConfiguration := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", nil)
		clearedProvisioning := fixture.NewAWSAppConnectionWithConfiguration(t, tn, "", map[string]any{"provisioning": nil})

		for _, connID := range []uuid.UUID{withProvisioning, noConfiguration, clearedProvisioning} {
			// Action
			status, body := getUpdateTemplate(t, tn.Admin, connID, "secrets-manager,parameter-store", nil)

			// Assert
			out := decodeUpdateTemplate(t, status, body)
			require.Nil(t, out.ProvisioningTemplate)
			require.Contains(t, string(body), `"provisioningTemplate":null`)
		}
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
