package orgintegration_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func awsKMSBody() map[string]any {
	return map[string]any{
		"name": "kms-" + id.Short(),
		"configuration": map[string]any{
			"awsRegion":  "us-east-1",
			"credential": map[string]any{"type": "access-key", "data": map[string]any{"accessKey": "AKIA" + id.Short(), "secretKey": id.Short()}},
		},
	}
}

func externalKMSCount(t *testing.T, actor *api.ClientWithResponses) int {
	t.Helper()
	res, err := actor.ListExternalKmsWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return len(res.JSON200.ExternalKmsList)
}

func TestExternalKMS_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an external KMS when the plan does not include it and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.ExternalKMS)))

		// Action
		res, err := tn.Admin.API.CreateAwsExternalKmsWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, awsKMSBody()))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "plan restriction")
		require.Zero(t, externalKMSCount(t, tn.Admin.API))
	})

	t.Run("should refuse a member without permission to create a KMS and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.CreateAwsExternalKmsWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, awsKMSBody()))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Zero(t, externalKMSCount(t, tn.Admin.API))
	})

	t.Run("should still list external KMS configurations when the plan no longer includes it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.ExternalKMS)))

		// Action
		res, err := tn.Admin.API.ListExternalKmsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, res.JSON200.ExternalKmsList)
	})
}
