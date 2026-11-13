package awslaunch_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

type launch struct {
	ProvisioningTemplate struct {
		Kind        string            `json:"kind"`
		LaunchURL   string            `json:"launchUrl"`
		TemplateURL string            `json:"templateUrl"`
		Region      string            `json:"region"`
		Parameters  map[string]string `json:"parameters"`
		OutputKey   string            `json:"outputKey"`
	} `json:"provisioningTemplate"`
}

func getLaunch(t *testing.T, p *harness.Principal, params *api.GetAwsProvisioningTemplateParams) launch {
	t.Helper()
	res, err := p.API.GetAwsProvisioningTemplateWithResponse(t.Context(), params)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, res.StatusCode(), string(res.Body))
	var out launch
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out
}

func TestAWSProvisioningTemplate_Launch(t *testing.T) {
	h := harness.From(t)

	t.Run("should use the Organization ID as the External ID at org scope", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		out := getLaunch(t, tn.Admin, &api.GetAwsProvisioningTemplateParams{})

		// Assert
		tpl := out.ProvisioningTemplate
		require.Equal(t, "cloudformation-launch", tpl.Kind)
		require.Equal(t, tn.OrgID.String(), tpl.Parameters["ExternalId"])
		require.Equal(t, trustedAccount, tpl.Parameters["TrustedAccountId"])
		require.Equal(t, "RoleArn", tpl.OutputKey)
	})

	t.Run("should use the Project ID as the External ID in a secrets project", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		projectID := openapi_types.UUID(uuid.MustParse(proj.ID))

		// Action
		out := getLaunch(t, tn.Admin, &api.GetAwsProvisioningTemplateParams{ProjectId: &projectID})

		// Assert
		require.Equal(t, proj.ID, out.ProvisioningTemplate.Parameters["ExternalId"])
	})

	t.Run("should use the Organization ID as the External ID in a Certificate Manager project", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("cert-manager"))
		projectID := openapi_types.UUID(uuid.MustParse(proj.ID))

		// Action
		out := getLaunch(t, tn.Admin, &api.GetAwsProvisioningTemplateParams{ProjectId: &projectID})

		// Assert
		require.Equal(t, tn.OrgID.String(), out.ProvisioningTemplate.Parameters["ExternalId"])
	})

	t.Run("should pre-fill the selected Use cases, role name and region and point at the overridden template", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		useCases := "secrets-manager,private-ca"
		roleName := "acme-infisical"
		region := "eu-west-1"

		// Action
		out := getLaunch(t, tn.Admin, &api.GetAwsProvisioningTemplateParams{
			UseCases: &useCases, RoleName: &roleName, Region: &region,
		})

		// Assert
		tpl := out.ProvisioningTemplate
		require.Equal(t, "true", tpl.Parameters["EnableSecretsManager"])
		require.Equal(t, "true", tpl.Parameters["EnablePrivateCa"])
		require.NotContains(t, tpl.Parameters, "EnableParameterStore")
		require.Equal(t, roleName, tpl.Parameters["RoleName"])
		require.True(t, strings.HasPrefix(tpl.TemplateURL, templateBase+"/"), tpl.TemplateURL)
		require.True(t, strings.HasPrefix(tpl.LaunchURL, "https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/quickcreate?"), tpl.LaunchURL)
		require.Contains(t, tpl.LaunchURL, "param_EnableSecretsManager=true")
	})
}
