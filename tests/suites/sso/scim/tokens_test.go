package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func serviceProviderConfig(t *testing.T, client *api.ClientWithResponses) reply {
	t.Helper()
	res, err := client.GetScimServiceProviderConfigWithResponse(t.Context())
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func listTokens(t *testing.T, tn *harness.Tenant, actor *harness.Principal) (reply, *api.ListScimTokensResponse) {
	t.Helper()
	res, err := actor.API.ListScimTokensWithResponse(t.Context(), &api.ListScimTokensParams{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}, res
}

func tokenCount(t *testing.T, tn *harness.Tenant) int {
	t.Helper()
	r, res := listTokens(t, tn, tn.Admin)
	requireOK(t, r, "listing SCIM tokens")
	return len(res.JSON200.ScimTokens)
}

func deleteToken(t *testing.T, actor *harness.Principal, tokenID string) reply {
	t.Helper()
	res, err := actor.API.DeleteScimTokenWithResponse(t.Context(), tokenID)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func onlyTokenID(t *testing.T, tn *harness.Tenant) string {
	t.Helper()
	r, res := listTokens(t, tn, tn.Admin)
	requireOK(t, r, "listing SCIM tokens")
	require.Len(t, res.JSON200.ScimTokens, 1)
	return res.JSON200.ScimTokens[0].Id
}

func TestScimToken_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return a token that authenticates SCIM requests when an admin creates one", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		token := newToken(t, s.tn)

		// Assert
		requireOK(t, serviceProviderConfig(t, s.tn.Client(t, token)), "calling SCIM with the new token")
	})

	t.Run("should refuse and create nothing when a member without the scim permission creates one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)

		// Action
		res, err := member.API.CreateScimTokenWithResponse(t.Context(), api.CreateScimTokenJSONRequestBody{OrganizationId: tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Zero(t, tokenCount(t, tn))
	})

	t.Run("should refuse and create nothing when the organization is another tenant's", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)

		// Action
		res, err := mine.Admin.API.CreateScimTokenWithResponse(t.Context(), api.CreateScimTokenJSONRequestBody{OrganizationId: theirs.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Zero(t, tokenCount(t, theirs))
	})

	t.Run("should refuse with an upgrade message when the plan does not include scim", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SCIM)))

		// Action
		res, err := tn.Admin.API.CreateScimTokenWithResponse(t.Context(), api.CreateScimTokenJSONRequestBody{OrganizationId: tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, errorText(t, reply{res.StatusCode(), res.Body}), "Upgrade plan to create a SCIM token")
	})

	t.Run("should refuse a lifetime longer than two years", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateScimTokenWithResponse(t.Context(), api.CreateScimTokenJSONRequestBody{
			OrganizationId: tn.OrgID.String(),
			TtlDays:        new(float32(731)),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Zero(t, tokenCount(t, tn))
	})
}

func TestScimToken_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list a token's description and lifetime but never its value", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r, res := listTokens(t, s.tn, s.tn.Admin)

		// Assert
		requireOK(t, r, "listing SCIM tokens")
		require.Len(t, res.JSON200.ScimTokens, 1)
		require.Contains(t, res.JSON200.ScimTokens[0].Description, "idp-")
		require.NotContains(t, string(r.body), s.token)
	})

	t.Run("should refuse a member without the scim permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)

		// Action
		r, _ := listTokens(t, tn, member)

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
	})

	t.Run("should still list tokens when the plan no longer includes scim", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.tn.SetPlan(t, license.Enterprise().Without(license.SCIM))

		// Action
		r, res := listTokens(t, s.tn, s.tn.Admin)

		// Assert
		requireOK(t, r, "listing SCIM tokens")
		require.Len(t, res.JSON200.ScimTokens, 1)
	})
}

func TestScimToken_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stop authenticating SCIM requests when the token is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		tokenID := onlyTokenID(t, s.tn)

		// Action
		r := deleteToken(t, s.tn.Admin, tokenID)

		// Assert
		requireOK(t, r, "deleting the SCIM token")
		require.Equal(t, http.StatusUnauthorized, serviceProviderConfig(t, s.api).status)
	})

	t.Run("should keep other tokens working when one is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		tokenID := onlyTokenID(t, s.tn)
		other := newToken(t, s.tn)

		// Action
		r := deleteToken(t, s.tn.Admin, tokenID)

		// Assert
		requireOK(t, r, "deleting the SCIM token")
		requireOK(t, serviceProviderConfig(t, s.tn.Client(t, other)), "calling SCIM with the remaining token")
	})

	t.Run("should refuse and keep the token working when another tenant deletes it", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		intruder := h.NewTenant(t)

		// Action
		r := deleteToken(t, intruder.Admin, onlyTokenID(t, s.tn))

		// Assert
		require.NotEqual(t, http.StatusOK, r.status)
		requireOK(t, serviceProviderConfig(t, s.api), "calling SCIM with the token another tenant tried to delete")
	})

	t.Run("should answer 404 when another tenant deletes a token, so ids cannot be probed", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		intruder := h.NewTenant(t)

		// Action
		r := deleteToken(t, intruder.Admin, onlyTokenID(t, s.tn))

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
	})

	t.Run("should refuse a member without the scim permission and keep the token", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		member := s.tn.NewUser(t)

		// Action
		r := deleteToken(t, member, onlyTokenID(t, s.tn))

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		requireOK(t, serviceProviderConfig(t, s.api), "calling SCIM after the refused delete")
	})

	t.Run("should still revoke a token when the plan no longer includes scim", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		tokenID := onlyTokenID(t, s.tn)
		s.tn.SetPlan(t, license.Enterprise().Without(license.SCIM))

		// Action
		r := deleteToken(t, s.tn.Admin, tokenID)

		// Assert
		requireOK(t, r, "deleting the SCIM token")
		require.Equal(t, http.StatusUnauthorized, serviceProviderConfig(t, s.api).status)
	})
}

func TestScimToken_Authentication(t *testing.T) {
	t.Parallel()

	t.Run("should keep authenticating an existing token when the plan no longer includes scim", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.tn.SetPlan(t, license.Enterprise().Without(license.SCIM))

		// Action
		r := s.listUsers(t, api.ListScimUsersParams{})

		// Assert
		requireOK(t, r, "listing users after the downgrade")
	})

	t.Run("should refuse a user session on SCIM routes", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := serviceProviderConfig(t, s.tn.Admin.API)

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
	})

	t.Run("should refuse a SCIM token on token management routes", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		res, err := s.api.CreateScimTokenWithResponse(t.Context(), api.CreateScimTokenJSONRequestBody{OrganizationId: s.tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, 1, tokenCount(t, s.tn))
	})

	t.Run("should refuse a request with no bearer token", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := serviceProviderConfig(t, s.tn.Anonymous(t))

		// Assert
		require.Equal(t, http.StatusUnauthorized, r.status)
	})

	t.Run("should refuse a bearer token Infisical did not sign", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := serviceProviderConfig(t, s.tn.Client(t, "eyJhbGciOiJIUzI1NiJ9.eyJhdXRoVG9rZW5UeXBlIjoic2NpbVRva2VuIn0.c2lnbmF0dXJl"))

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
	})
}
