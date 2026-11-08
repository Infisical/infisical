package appconnections_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestAWSAppConnection_ProvisioningTemplate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse with a readable error when the Trusted account cannot be derived", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetAwsProvisioningTemplateWithResponse(t.Context(),
			&api.GetAwsProvisioningTemplateParams{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "could not determine the AWS account to trust")
	})

	for _, partition := range []string{"aws-us-gov", "aws-cn", "aws-eusc", "aws-private-7"} {
		t.Run("should offer no launch when the Partition is "+partition, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)

			// Action
			res, err := tn.Admin.API.GetAwsProvisioningTemplateWithResponse(t.Context(),
				&api.GetAwsProvisioningTemplateParams{Partition: &partition})

			// Assert
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, res.StatusCode())
			var out struct {
				ProvisioningTemplate *json.RawMessage `json:"provisioningTemplate"`
			}
			require.NoError(t, json.Unmarshal(res.Body, &out))
			require.Contains(t, string(res.Body), `"provisioningTemplate":null`)
			require.Nil(t, out.ProvisioningTemplate)
		})
	}

	t.Run("should refuse a caller without the app connection Create permission and reveal nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn)
		viewer := proj.NewUser(t, fixture.WithRoles("viewer"))
		projectID := openapi_types.UUID(uuid.MustParse(proj.ID))

		// Action
		res, err := viewer.API.GetAwsProvisioningTemplateWithResponse(t.Context(),
			&api.GetAwsProvisioningTemplateParams{ProjectId: &projectID})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.NotContains(t, string(res.Body), "quickcreate")
	})
}
