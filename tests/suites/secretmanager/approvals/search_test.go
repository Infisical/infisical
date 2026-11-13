package approvals_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecretApprovalRequest_Search(t *testing.T) {
	t.Parallel()

	// requestsByFolder opens one request in each folder, under a policy on policyPath.
	requestsByFolder := func(t *testing.T, policyPath string, folders ...string) (protectedProject, map[string]uuid.UUID) {
		t.Helper()
		p := newProtectedProject(t, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.SecretPath = policyPath })
		requests := map[string]uuid.UUID{}
		for _, folder := range folders {
			secretmanager.CreateFolder(t, p.proj, "dev", folder)
			res, err := p.committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
				ProjectId: p.proj.ID, Environment: "dev", SecretPath: new(folder), SecretValue: "value",
			})
			require.NoError(t, err)
			requests[folder] = heldRequest(t, p.proj, res.Body).ID
		}
		return p, requests
	}

	search := func(t *testing.T, p protectedProject, text string) []uuid.UUID {
		t.Helper()
		res, err := p.reviewer.API.ListSecretApprovalRequestsWithResponse(t.Context(), &api.ListSecretApprovalRequestsParams{
			ProjectId: p.proj.ID, Search: new(text),
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "searching %q returned %d: %s", text, res.StatusCode(), apierr.Body(res.Body))
		ids := []uuid.UUID{}
		for _, approval := range res.JSON200.Approvals {
			ids = append(ids, approval.Id)
		}
		return ids
	}

	t.Run("should find the requests in every folder whose path contains the full path searched", func(t *testing.T) {
		t.Parallel()

		// Setup
		p, requests := requestsByFolder(t, "/**", "/parameters/sanda/settlement-service", "/parameters/sanda/settlement-service-v2",
			"/parameters/alpha/settlement-service")

		// Action
		found := search(t, p, "/parameters/sanda/settlement-service")

		// Assert
		require.ElementsMatch(t, []uuid.UUID{
			requests["/parameters/sanda/settlement-service"], requests["/parameters/sanda/settlement-service-v2"],
		}, found)
	})

	t.Run("should find a request by its folder path in another case and with a trailing slash", func(t *testing.T) {
		t.Parallel()

		// Setup
		p, requests := requestsByFolder(t, "/**", "/parameters/sanda/settlement-service", "/parameters/sanda/other")

		// Action
		found := search(t, p, "/PARAMETERS/Sanda/Settlement-Service/")

		// Assert
		require.Equal(t, []uuid.UUID{requests["/parameters/sanda/settlement-service"]}, found)
	})

	t.Run("should find the requests in every folder with the name searched", func(t *testing.T) {
		t.Parallel()

		// Setup
		p, requests := requestsByFolder(t, "/**", "/parameters/sanda/settlement-service", "/parameters/alpha/settlement-service",
			"/parameters/sanda/other")

		// Action
		found := search(t, p, "settlement-service")

		// Assert
		require.ElementsMatch(t, []uuid.UUID{
			requests["/parameters/sanda/settlement-service"], requests["/parameters/alpha/settlement-service"],
		}, found)
	})

	t.Run("should match an underscore in the path searched only as an underscore", func(t *testing.T) {
		t.Parallel()

		// Setup
		p, requests := requestsByFolder(t, "/**", "/apps/pay_api", "/apps/payXapi")

		// Action
		found := search(t, p, "/apps/pay_")

		// Assert
		require.Equal(t, []uuid.UUID{requests["/apps/pay_api"]}, found)
	})

	t.Run("should find a request by its full folder path when a glob policy below the root holds it", func(t *testing.T) {
		t.Parallel()

		// Setup
		p, requests := requestsByFolder(t, "/parameters/**", "/parameters/sanda/settlement-service", "/parameters/sanda/other")

		// Action
		found := search(t, p, "/parameters/sanda/settlement-service")

		// Assert
		require.Equal(t, []uuid.UUID{requests["/parameters/sanda/settlement-service"]}, found)
	})

	t.Run("should find nothing when no request is under the path searched", func(t *testing.T) {
		t.Parallel()

		// Setup
		p, _ := requestsByFolder(t, "/**", "/parameters/sanda/settlement-service")

		// Action
		found := search(t, p, "/parameters/sanda/other")

		// Assert
		require.Empty(t, found)
	})
}
