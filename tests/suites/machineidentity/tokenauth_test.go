package machineidentity_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTokenAuth_Tokens(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should authenticate with a created token and stop on revoke", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := tokenAuthIdentity(t, tn)
		created := newTokenAuthToken(t, tn.Admin.API, identityID)
		c := tn.Client(t, created.JSON200.AccessToken)
		requireWorks(t, c)

		// Action
		res, err := tn.Admin.API.RevokeTokenAuthTokenWithResponse(t.Context(), created.JSON200.TokenData.Id)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		waitForStatus(t, http.StatusUnauthorized, func() (int, []byte) { return whoami(t, c) })
	})

	t.Run("should answer 404 when a token is revoked twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		created := newTokenAuthToken(t, tn.Admin.API, tokenAuthIdentity(t, tn))
		tokenID := created.JSON200.TokenData.Id
		first, err := tn.Admin.API.RevokeTokenAuthTokenWithResponse(t.Context(), tokenID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, first.StatusCode(), first.Body)

		// Action
		res, err := tn.Admin.API.RevokeTokenAuthTokenWithResponse(t.Context(), tokenID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "not found or already revoked")
	})

	t.Run("should list tokens by name and never their values", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := tokenAuthIdentity(t, tn)
		ci := createTokenAuthToken(t, tn.Admin.API, identityID, "ci")
		deploy := createTokenAuthToken(t, tn.Admin.API, identityID, "deploy")

		// Action
		res, err := tn.Admin.API.GetTokenAuthTokensWithResponse(t.Context(), identityID.String(), nil)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		names := []string{}
		for _, tok := range res.JSON200.Tokens {
			if tok.Name != nil {
				names = append(names, *tok.Name)
			}
		}
		require.ElementsMatch(t, []string{"ci", "deploy"}, names)
		require.NotContains(t, string(res.Body), ci.JSON200.AccessToken)
		require.NotContains(t, string(res.Body), deploy.JSON200.AccessToken)
	})

	t.Run("should refuse creating a token without create-token permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := tokenAuthIdentity(t, tn)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res := createTokenAuthToken(t, member.API, identityID, "sneaky")

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		listed, err := tn.Admin.API.GetTokenAuthTokensWithResponse(t.Context(), identityID.String(), nil)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Empty(t, listed.JSON200.Tokens)
	})
}

// tokenAuthIdentity creates a member identity with only token auth attached.
func tokenAuthIdentity(t *testing.T, tn *harness.Tenant) uuid.UUID {
	t.Helper()
	identityID := createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{})
	attachTokenAuth(t, tn, identityID, api.AttachTokenAuthJSONRequestBody{})
	return identityID
}

func attachTokenAuth(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, body api.AttachTokenAuthJSONRequestBody) {
	t.Helper()
	res, err := tn.Admin.API.AttachTokenAuthWithResponse(t.Context(), identityID.String(), body)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}

func createTokenAuthToken(t *testing.T, c *api.ClientWithResponses, identityID uuid.UUID, name string) *api.CreateTokenAuthTokenResponse {
	t.Helper()
	res, err := c.CreateTokenAuthTokenWithResponse(t.Context(), identityID.String(), api.CreateTokenAuthTokenJSONRequestBody{Name: &name})
	require.NoError(t, err)
	return res
}

func newTokenAuthToken(t *testing.T, c *api.ClientWithResponses, identityID uuid.UUID) *api.CreateTokenAuthTokenResponse {
	t.Helper()
	res := createTokenAuthToken(t, c, identityID, "token")
	require.NotNilf(t, res.JSON200, "creating a token returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}
