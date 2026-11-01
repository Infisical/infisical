package machineidentity_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/Infisical/infisical/tests/internal/wait"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestAccessToken_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a token on its next request once it is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{}).login(t, tn)
		c := tn.Client(t, token)
		requireWorks(t, c)

		// Action
		res := revoke(t, tn, token)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		status, body := whoami(t, c)
		requireStatus(t, http.StatusUnauthorized, status, body)
		require.Contains(t, string(body), "Failed to authorize: token has been revoked")
	})

	t.Run("should refuse renewing a revoked token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{}).login(t, tn)
		revoked := revoke(t, tn, token)
		requireStatus(t, http.StatusOK, revoked.StatusCode(), revoked.Body)

		// Action
		res := renew(t, tn, token)

		// Assert
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot renew: token has been revoked")
	})

	t.Run("should refuse revoking a user session token as not an identity token, and keep it working", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := revoke(t, tn, tn.Admin.Token)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Token is not an identity access token")
		still, err := tn.Admin.API.ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, still.StatusCode(), still.Body)
	})
}

func TestAccessToken_NumUses(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should accept exactly N requests and refuse the next with token usage limit reached", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenNumUsesLimit: new(3)}).login(t, tn)
		c := tn.Client(t, token)
		statuses := []int{}

		// Action
		var last []byte
		for range 4 {
			status, body := whoami(t, c)
			statuses = append(statuses, status)
			last = body
		}

		// Assert
		require.Equal(t, []int{http.StatusOK, http.StatusOK, http.StatusOK, http.StatusUnauthorized}, statuses)
		require.Contains(t, string(last), "token usage limit reached")
	})

	t.Run("should count uses across a renewal rather than resetting them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenNumUsesLimit: new(3)}).login(t, tn)
		requireWorks(t, tn.Client(t, token))
		requireWorks(t, tn.Client(t, token))

		// Action
		res := renew(t, tn, token)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		renewed := tn.Client(t, res.JSON200.AccessToken)
		requireWorks(t, renewed)
		status, body := whoami(t, renewed)
		requireStatus(t, http.StatusUnauthorized, status, body)
		require.Contains(t, string(body), "token usage limit reached")
	})

	t.Run("should refuse renewing an exhausted token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenNumUsesLimit: new(1)}).login(t, tn)
		requireWorks(t, tn.Client(t, token))

		// Action
		res := renew(t, tn, token)

		// Assert
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot renew exhausted access token")
	})
}

func TestAccessToken_TTL(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a token after its TTL with the expired-token message", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenTTL: new(5), AccessTokenMaxTTL: new(20)}).login(t, tn)
		c := tn.Client(t, token)

		// Action
		requireWorks(t, c)

		// Assert
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return whoami(t, c) })
		require.Contains(t, string(body), `"error":"TokenError"`)
		require.Contains(t, string(body), "Your token has expired. Please re-authenticate.")
	})

	t.Run("should keep the same token id and creation time when it is renewed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{}).login(t, tn)

		// Action
		res := renew(t, tn, token)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		before, after := claims(t, token), claims(t, res.JSON200.AccessToken)
		require.Equal(t, before["identityAccessTokenId"], after["identityAccessTokenId"])
		require.Equal(t, before["jti"], after["jti"])
		require.Equal(t, before["creationEpoch"], after["creationEpoch"])
		requireWorks(t, tn.Client(t, res.JSON200.AccessToken))
	})

	t.Run("should refuse renewal once the max TTL has passed since the first login", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		const maxTTL = 10
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenTTL: new(5), AccessTokenMaxTTL: new(maxTTL)}).login(t, tn)
		deadline := int64(claims(t, token)["creationEpoch"].(float64)) + maxTTL
		var exps []int64

		// Action
		refused, err := wait.For(t.Context(), func(context.Context) (*api.RenewIdentityAccessTokenResponse, bool, error) {
			res := renew(t, tn, token)
			if res.JSON200 == nil {
				return res, true, nil
			}
			token = res.JSON200.AccessToken
			exps = append(exps, int64(claims(t, token)["exp"].(float64)))
			return nil, false, nil
		})

		// Assert
		require.NoError(t, err)
		require.NotEmpty(t, exps, "the token was never renewed")
		for _, exp := range exps {
			require.LessOrEqual(t, exp, deadline+1, "a renewed token outlived the max TTL")
		}
		require.GreaterOrEqual(t, time.Now().Unix(), deadline-1, "renewal was refused before the max TTL ran out: %s", refused.Body)
		// A renewed token expires exactly when the budget does, so which check refuses depends on
		// the second the last renewal lands: still inside it, the budget check answers 401; past
		// it, the token has itself expired and is refused first with 403. Both mean the budget ran out.
		budgetSpent := refused.StatusCode() == http.StatusUnauthorized &&
			strings.Contains(string(refused.Body), "reached its max TTL")
		tokenExpired := refused.StatusCode() == http.StatusForbidden &&
			strings.Contains(string(refused.Body), "Your token has expired")
		require.Truef(t, budgetSpent || tokenExpired, "renewal past the max TTL answered %d: %s", refused.StatusCode(), apierr.Body(refused.Body))
	})

	t.Run("should cap expiresIn at the remaining max TTL budget", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		const ttl, maxTTL = 8, 12
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenTTL: new(ttl), AccessTokenMaxTTL: new(maxTTL)}).login(t, tn)
		deadline := claims(t, token)["creationEpoch"].(float64) + maxTTL

		// Action
		capped, err := wait.For(t.Context(), func(context.Context) (*api.RenewIdentityAccessTokenResponse, bool, error) {
			res := renew(t, tn, token)
			if res.JSON200 == nil {
				return nil, false, fmt.Errorf("renewing answered %d: %s", res.StatusCode(), apierr.Body(res.Body))
			}
			return res, res.JSON200.ExpiresIn < ttl, nil
		})

		// Assert
		require.NoError(t, err)
		require.EqualValues(t, maxTTL, capped.JSON200.AccessTokenMaxTTL)
		require.InDelta(t, deadline, claims(t, capped.JSON200.AccessToken)["exp"].(float64), 1)
	})

	t.Run("should renew a periodic token indefinitely", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		const period, maxTTL = 5, 6
		token := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{
			AccessTokenTTL: new(period), AccessTokenMaxTTL: new(maxTTL), AccessTokenPeriod: new(period),
		}).login(t, tn)
		start := time.Now()
		var expiresIn []float32

		// Action
		_, err := wait.For(t.Context(), func(context.Context) (struct{}, bool, error) {
			res := renew(t, tn, token)
			if res.JSON200 == nil {
				return struct{}{}, false, fmt.Errorf("renewing after %s answered %d: %s", time.Since(start), res.StatusCode(), apierr.Body(res.Body))
			}
			token = res.JSON200.AccessToken
			expiresIn = append(expiresIn, res.JSON200.ExpiresIn)
			return struct{}{}, time.Since(start) > 2*maxTTL*time.Second, nil
		}, wait.Interval(time.Second), wait.Timeout(30*time.Second))

		// Assert
		require.NoError(t, err)
		for _, e := range expiresIn {
			require.EqualValues(t, period, e)
		}
		requireWorks(t, tn.Client(t, token))
	})
}

func TestAccessToken_CrossOrg(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// crossOrg is org A's admin identity and org B's resources.
	type crossOrg struct {
		a, b     *harness.Tenant
		identity *harness.Principal
	}
	setup := func(t *testing.T) crossOrg {
		t.Helper()
		a, b := h.NewTenant(t), h.NewTenant(t)
		return crossOrg{a: a, b: b, identity: a.NewMachineIdentity(t, harness.OrgRole("admin"))}
	}

	t.Run("should refuse org B's org route for org A's token, naming the token's org", func(t *testing.T) {
		t.Parallel()

		// Setup
		x := setup(t)

		// Action
		res, err := x.identity.API.ListOrgMembershipsWithResponse(t.Context(), x.b.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Your token is scoped to organization with ID "+x.a.OrgID.String())
		require.NotContains(t, string(res.Body), x.b.Admin.Email)
	})

	t.Run("should refuse org B's member route for org A's token, naming the token's org", func(t *testing.T) {
		t.Parallel()

		// Setup
		x := setup(t)
		membership := fixture.MembershipOf(t, x.b, x.b.Admin.Email)

		// Action
		res, err := x.identity.API.GetOrgMembershipWithResponse(t.Context(), x.b.OrgID.String(), membership.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Your token is scoped to organization with ID "+x.a.OrgID.String())
	})

	t.Run("should refuse org B's project route for org A's token", func(t *testing.T) {
		t.Parallel()

		// Setup
		x := setup(t)
		proj := fixture.NewProject(t, x.b, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := x.identity.API.ListProjectIdentityMembershipsWithResponse(t.Context(), proj.ID, nil)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "This project does not belong to your selected organization.")
	})

	t.Run("should answer 404 for org B's identity to org A's token", func(t *testing.T) {
		t.Parallel()

		// Setup
		x := setup(t)
		identityID := createIdentity(t, x.b, api.CreateMachineIdentityJSONRequestBody{})

		// Action
		res, err := x.identity.API.GetMachineIdentityByIdWithResponse(t.Context(), identityID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
	})

	t.Run("should answer 404 for org B's group to org A's token", func(t *testing.T) {
		t.Parallel()

		// Setup
		x := setup(t)
		group := fixture.NewGroup(t, x.b)

		// Action
		res, err := x.identity.API.GetGroupByIdWithResponse(t.Context(), group.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.NotContains(t, string(res.Body), group.Name)
	})
}

func TestAccessToken_Header(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a request with no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Token missing")
	})

	t.Run("should refuse an unsigned token as a token error", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		real := claims(t, tn.NewMachineIdentity(t).Token)
		unsigned := encodeSegment(t, map[string]any{"alg": "none", "typ": "JWT"}) + "." + encodeSegment(t, real) + "."

		// Action
		res, err := tn.Client(t, unsigned).ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), `"error":"TokenError"`)
	})

	t.Run("should refuse an identity token signed with another secret as a token error", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		forged := signHS256(t, "not-the-server-secret", claims(t, tn.NewMachineIdentity(t).Token))

		// Action
		res, err := tn.Client(t, forged).ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), `"error":"TokenError"`)
	})

	t.Run("should refuse a refresh token used as a bearer token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		refresh := refreshToken(t, tn)

		// Action
		res, err := tn.Client(t, refresh).ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Token missing")
	})

	t.Run("should refuse a signup token used as a bearer token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		signup := signupToken(t, tn)

		// Action
		res, err := tn.Client(t, signup).ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Token missing")
	})

	t.Run("should refuse an x-api-key header with the not supported anymore message", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		withAPIKey := func(_ context.Context, req *http.Request) error {
			req.Header.Set("x-api-key", "legacy-api-key")
			return nil
		}

		// Action
		res, err := tn.Anonymous(t).ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String(), withAPIKey)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "API key authentication is not supported anymore")
	})

	t.Run("should refuse an identity token on a route that does not accept identity tokens", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		res, err := identity.API.GetCurrentUserV1WithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Forbidden access to /api/v1/user")
	})
}

func renew(t *testing.T, tn *harness.Tenant, token string) *api.RenewIdentityAccessTokenResponse {
	t.Helper()
	res, err := tn.Anonymous(t).RenewIdentityAccessTokenWithResponse(t.Context(),
		api.RenewIdentityAccessTokenJSONRequestBody{AccessToken: token})
	require.NoError(t, err)
	return res
}

func revoke(t *testing.T, tn *harness.Tenant, token string) *api.RevokeIdentityAccessTokenResponse {
	t.Helper()
	res, err := tn.Anonymous(t).RevokeIdentityAccessTokenWithResponse(t.Context(),
		api.RevokeIdentityAccessTokenJSONRequestBody{AccessToken: token})
	require.NoError(t, err)
	return res
}

func encodeSegment(t *testing.T, v any) string {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func signHS256(t *testing.T, secret string, payload map[string]any) string {
	t.Helper()
	signing := encodeSegment(t, map[string]any{"alg": "HS256", "typ": "JWT"}) + "." + encodeSegment(t, payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signing))
	return signing + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// refreshToken logs the tenant admin in with a password and returns the refresh token
// the login sets as a cookie.
func refreshToken(t *testing.T, tn *harness.Tenant) string {
	t.Helper()
	res, err := tn.Anonymous(t).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
		Email: tn.Admin.Email, Password: harness.UserPassword,
	})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	for _, c := range res.HTTPResponse.Cookies() {
		if c.Name == "jid" {
			return c.Value
		}
	}
	t.Fatal("login set no refresh token cookie")
	return ""
}

// signupToken starts an email signup and returns the token the verified code is
// exchanged for, which only completes an account.
func signupToken(t *testing.T, tn *harness.Tenant) string {
	t.Helper()
	addr := tn.Email("signup-" + strings.ToLower(time.Now().Format("150405.000000")))
	anon := tn.Anonymous(t)
	begun, err := anon.BeginEmailSignupV3WithResponse(t.Context(), api.BeginEmailSignupV3JSONRequestBody{Email: openapi_types.Email(addr)})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, begun.StatusCode(), begun.Body)
	code, err := mail.Code(tn.Mail(t).Expect(t, addr, smtp.Subject("confirmation code")), 6)
	require.NoError(t, err)
	verified, err := anon.VerifyEmailSignupV3WithResponse(t.Context(), api.VerifyEmailSignupV3JSONRequestBody{Email: openapi_types.Email(addr), Code: code})
	require.NoError(t, err)
	require.NotNilf(t, verified.JSON200, "verifying the signup returned %d: %s", verified.StatusCode(), apierr.Body(verified.Body))
	return verified.JSON200.Token
}
