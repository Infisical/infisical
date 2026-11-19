package user_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

const sessionGone = "Your session is no longer valid, please re-authenticate"

func TestSession_Scope(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse org B's routes for a session selected into org A, naming the token's org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		alice := tn.NewUser(t)
		invite(t, other, alice.Email)
		selectOrg(t, tn, loggedIn(t, tn, alice.Email), other.OrgID.String())

		// Action
		res, err := alice.API.ListOrgMembershipsWithResponse(t.Context(), other.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, apierr.Message(res.Body), "Your token is scoped to organization with ID "+tn.OrgID.String())
		require.Equal(t, "accepted", fixture.MembershipOf(t, other, alice.Email).Status)
	})
}

func TestSession_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a session's token on its next request once that session is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		laptop := signIn(t, tn, alice.Email)
		phone := signIn(t, tn, alice.Email)

		// Action
		res, err := laptop.API.RevokeUserSessionWithResponse(t.Context(), sessionAt(t, laptop.API, phone.IP))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		requireSessionGone(t, phone.API)
		require.Equal(t, http.StatusOK, meStatus(t, laptop.API))
	})

	t.Run("should refuse every session once all are revoked, and accept a new login", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		laptop := signIn(t, tn, alice.Email)

		// Action
		res, err := laptop.API.RevokeAllUserSessionsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		requireSessionGone(t, laptop.API)
		requireSessionGone(t, alice.API)
		require.Equal(t, http.StatusOK, meStatus(t, signIn(t, tn, alice.Email).API))
	})

	t.Run("should leave another user's session working when its id is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		bob := signIn(t, tn, tn.NewUser(t).Email)

		// Action
		res, err := alice.API.RevokeUserSessionWithResponse(t.Context(), sessionAt(t, bob.API, bob.IP))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, http.StatusOK, meStatus(t, bob.API))
	})

	t.Run("should refuse the access token immediately after logout", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		s := signIn(t, tn, alice.Email)

		// Action
		res, err := s.API.LogoutWithResponse(t.Context(), withCookies(s.JID))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "logging out: %s", apierr.Body(res.Body))
		requireSessionGone(t, s.API)
		require.Equal(t, http.StatusUnauthorized, refresh(t, tn, s.IP, s.JID).StatusCode())
	})

	t.Run("should cut off open sessions when the org membership is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		m := fixture.MembershipOf(t, tn, alice.Email)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), m.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the membership: %s", apierr.Body(res.Body))
		requireRefused(t, alice.API, tn.OrgID.String(), http.StatusForbidden, "User not member of organization")
	})

	t.Run("should cut off an open session when an admin deactivates the member through the API", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		m := fixture.MembershipOf(t, tn, alice.Email)

		// Action
		res, err := tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), m.ID.String(),
			api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deactivating: %s", apierr.Body(res.Body))
		requireRefused(t, alice.API, tn.OrgID.String(), http.StatusForbidden, "User organization membership is inactive")
	})
}

func TestSession_Refresh(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should rotate the refresh token and issue a working access token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s := signIn(t, tn, tn.NewUser(t).Email)

		// Action
		res := refresh(t, tn, s.IP, s.JID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "refreshing: %s", apierr.Body(res.Body))
		rotated := cookieNamed(res.HTTPResponse, "jid")
		require.NotNil(t, rotated)
		require.NotEqual(t, s.JID.Value, rotated.Value)
		require.Equal(t, rotated.Value, *res.JSON200.RefreshToken)
		require.Equal(t, tn.OrgID.String(), *res.JSON200.OrganizationId)
		require.Equal(t, http.StatusOK, orgStatus(t, as(t, tn, res.JSON200.Token, s.IP), tn.OrgID.String()))
	})

	t.Run("should refuse a reused refresh token outside its grace window and delete the session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s := signIn(t, tn, tn.NewUser(t).Email)
		second := cookieNamed(refresh(t, tn, s.IP, s.JID).HTTPResponse, "jid")
		third := cookieNamed(refresh(t, tn, s.IP, second).HTTPResponse, "jid")

		// Action
		res := refresh(t, tn, s.IP, s.JID)

		// Assert
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.Equal(t, "Refresh token reuse detected. Session has been revoked for security.", apierr.Message(res.Body))
		requireSessionGone(t, s.API)
		require.Equal(t, http.StatusUnauthorized, refresh(t, tn, s.IP, third).StatusCode())
	})

	t.Run("should accept the previous refresh token within its grace window without rotating again", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s := signIn(t, tn, tn.NewUser(t).Email)
		second := cookieNamed(refresh(t, tn, s.IP, s.JID).HTTPResponse, "jid")

		// Action
		res := refresh(t, tn, s.IP, s.JID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "refreshing: %s", apierr.Body(res.Body))
		require.Nil(t, res.JSON200.RefreshToken)
		require.Equal(t, http.StatusOK, refresh(t, tn, s.IP, second).StatusCode())
	})

	t.Run("should cap access and refresh lifetime at the org's userTokenExpiration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		set := updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{UserTokenExpiration: new("1h")})
		require.Equalf(t, http.StatusOK, set.StatusCode(), "setting the expiration: %s", apierr.Body(set.Body))

		// Action
		s := signIn(t, tn, alice.Email)

		// Assert
		require.Equal(t, int64(3600), lifetime(t, s.Token))
		require.Equal(t, int64(3600), lifetime(t, s.JID.Value))
		refreshed := refresh(t, tn, s.IP, s.JID)
		require.Equalf(t, http.StatusOK, refreshed.StatusCode(), "refreshing: %s", apierr.Body(refreshed.Body))
		require.Equal(t, int64(3600), lifetime(t, refreshed.JSON200.Token))
		require.Equal(t, int64(3600), lifetime(t, *refreshed.JSON200.RefreshToken))
	})
}

// sessionAt is the id of the caller's session that was opened from ip.
func sessionAt(t *testing.T, c *api.ClientWithResponses, ip string) string {
	t.Helper()
	res, err := c.ListUserSessionsWithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing sessions: %s", apierr.Body(res.Body))
	for _, s := range *res.JSON200 {
		if s.Ip == ip {
			return s.Id.String()
		}
	}
	require.Failf(t, "no session", "no session from %s", ip)
	return ""
}

func requireSessionGone(t *testing.T, c *api.ClientWithResponses) {
	t.Helper()
	res, err := c.GetCurrentUserWithResponse(t.Context())
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, res.StatusCode())
	require.Equal(t, sessionGone, apierr.Message(res.Body))
}

// requireRefused waits for the org route to refuse the session. Membership changes reach
// the auth check without a cache today, so this normally holds on the first read.
func requireRefused(t *testing.T, c *api.ClientWithResponses, orgID string, status int, message string) {
	t.Helper()
	var last *api.GetOrganizationByIdResponse
	wait.Until(t, "the session to be refused", func() bool {
		res, err := c.GetOrganizationByIdWithResponse(t.Context(), orgID)
		require.NoError(t, err)
		last = res
		return res.StatusCode() != http.StatusOK
	})
	require.Equal(t, status, last.StatusCode())
	require.Equal(t, message, apierr.Message(last.Body))
}

// lifetime is a JWT's exp minus its iat, in seconds.
func lifetime(t *testing.T, token string) int64 {
	t.Helper()
	c := claims(t, token)
	return int64(c["exp"].(float64)) - int64(c["iat"].(float64))
}

func claims(t *testing.T, token string) map[string]any {
	t.Helper()
	parts := strings.Split(token, ".")
	require.Len(t, parts, 3, "not a JWT")
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}
