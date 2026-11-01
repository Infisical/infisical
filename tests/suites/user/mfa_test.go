package user_test

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/stretchr/testify/require"
)

const mfaSubject = "Infisical MFA code"

func TestMFA_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return an MFA token instead of a session when the org enforces MFA, and mail a code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodEmail)
		s := loggedIn(t, tn, alice.Email)

		// Action
		res := selectOrg(t, tn, s, tn.OrgID.String())

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting: %s", apierr.Body(res.Body))
		require.True(t, res.JSON200.IsMfaEnabled)
		require.Equal(t, "email", *res.JSON200.MfaMethod)
		require.Equal(t, "mfaToken", claims(t, res.JSON200.Token)["authTokenType"])
		require.Nil(t, cookieNamed(res.HTTPResponse, "jid"))
		require.Len(t, code(t, tn.Mail(t).Expect(t, alice.Email, smtp.Subject(mfaSubject))), 6)
	})

	t.Run("should start a session with the mailed code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodEmail)
		c := challenge(t, tn, alice.Email)
		mailed := code(t, tn.Mail(t).Expect(t, alice.Email, smtp.Subject(mfaSubject)))

		// Action
		res, err := c.API.VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{MfaToken: mailed})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "verifying: %s", apierr.Body(res.Body))
		require.NotNil(t, cookieNamed(res.HTTPResponse, "jid"))
		require.Equal(t, true, claims(t, res.JSON200.Token)["isMfaVerified"])
		require.Equal(t, http.StatusOK, orgStatus(t, as(t, tn, res.JSON200.Token, c.IP), tn.OrgID.String()))
	})

	t.Run("should refuse the MFA token as a bearer on ordinary routes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodEmail)
		c := challenge(t, tn, alice.Email)

		// Action
		res, err := c.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.Equal(t, http.StatusUnauthorized, meStatus(t, c.API))
	})

	t.Run("should lock the account after repeated wrong codes and mail an unlock link", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodEmail)
		c := challenge(t, tn, alice.Email)
		wrong := otherCode(code(t, tn.Mail(t).Expect(t, alice.Email, smtp.Subject(mfaSubject))))

		// Action
		for range 20 {
			_, err := c.API.VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{MfaToken: wrong})
			require.NoError(t, err)
		}

		// Assert
		unlock := tn.Mail(t).Expect(t, alice.Email, smtp.Subject("Unlock your Infisical account"))
		link, err := mail.Link(unlock, "token")
		require.NoError(t, err)
		require.Equal(t, "/api/v1/user/"+alice.ID.String()+"/unlock", link.Path)
		locked := selectOrg(t, tn, loggedIn(t, tn, alice.Email), tn.OrgID.String())
		require.Equal(t, http.StatusUnauthorized, locked.StatusCode())
		require.Equal(t, "Account is locked", apierr.Message(locked.Body))
		unlocked, err := device(t, tn, newIP(), infisical.NoRedirects()).UnlockUserWithResponse(t.Context(), alice.ID.String(),
			&api.UnlockUserParams{Token: link.Query().Get("token")})
		require.NoError(t, err)
		require.Equal(t, http.StatusFound, unlocked.StatusCode())
		again := selectOrg(t, tn, loggedIn(t, tn, alice.Email), tn.OrgID.String())
		require.Equalf(t, http.StatusOK, again.StatusCode(), "selecting after unlocking: %s", apierr.Body(again.Body))
		require.True(t, again.JSON200.IsMfaEnabled)
	})

	t.Run("should refuse enforcing MFA when the plan does not include it, and keep it off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.EnforceMFA)))
		alice := tn.NewUser(t)

		// Action
		res := updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{EnforceMfa: new(true)})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, apierr.Message(res.Body), "Upgrade plan to enforce/un-enforce MFA")
		org, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		require.False(t, *org.JSON200.Organization.EnforceMfa)
		signIn(t, tn, alice.Email)
	})
}

func TestMFA_StepUp(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should require an MFA session to change MFA settings and accept after the mailed code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enableEmailMFA(t, tn, alice)

		// Action
		refused := deactivateMFA(t, alice.API, "")
		sessionID := stepUpSession(t, refused.StatusCode(), refused.Body)
		verified := verifyStepUp(t, tn, alice, sessionID)
		accepted := deactivateMFA(t, alice.API, sessionID)

		// Assert
		require.Equalf(t, http.StatusOK, verified.StatusCode(), "verifying: %s", apierr.Body(verified.Body))
		require.Equalf(t, http.StatusOK, accepted.StatusCode(), "deactivating: %s", apierr.Body(accepted.Body))
		require.False(t, mfaEnabled(t, alice.API))
	})

	t.Run("should refuse another user's MFA session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		bob := tn.NewUser(t)
		enableEmailMFA(t, tn, alice)
		refused := deactivateMFA(t, alice.API, "")
		sessionID := stepUpSession(t, refused.StatusCode(), refused.Body)
		mailed := code(t, tn.Mail(t).Expect(t, alice.Email, smtp.Subject(mfaSubject)))

		// Action
		res, err := bob.API.VerifyMfaSessionWithResponse(t.Context(), sessionID, api.VerifyMfaSessionJSONRequestBody{
			MfaToken:  mailed,
			MfaMethod: api.VerifyMfaSessionJSONBodyMfaMethodEmail,
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "MFA session does not belong to current user", apierr.Message(res.Body))
		status, err := alice.API.GetMfaSessionStatusWithResponse(t.Context(), sessionID)
		require.NoError(t, err)
		require.Equal(t, "PENDING", string(status.JSON200.Status))
		require.True(t, mfaEnabled(t, alice.API))
	})

	t.Run("should refuse deactivating MFA while an org enforces it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enableEmailMFA(t, tn, alice)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodEmail)

		// Action
		res := deactivateMFA(t, alice.API, "")

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "Two-factor authentication is required by your organization and cannot be disabled", apierr.Message(res.Body))
		require.True(t, mfaEnabled(t, alice.API))
	})

	t.Run("should accept a recovery code once, mail a notice, and refuse it a second time", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		recovery := enableEmailMFA(t, tn, alice)[0]
		first := challenge(t, tn, alice.Email)

		// Action
		used, err := first.API.VerifyMfaRecoveryCodeWithResponse(t.Context(), api.VerifyMfaRecoveryCodeJSONRequestBody{RecoveryCode: recovery})
		require.NoError(t, err)
		replayed, err := challenge(t, tn, alice.Email).API.VerifyMfaRecoveryCodeWithResponse(t.Context(),
			api.VerifyMfaRecoveryCodeJSONRequestBody{RecoveryCode: recovery})
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, used.StatusCode(), "using the recovery code: %s", apierr.Body(used.Body))
		require.Equal(t, http.StatusOK, orgStatus(t, as(t, tn, used.JSON200.Token, first.IP), tn.OrgID.String()))
		tn.Mail(t).Expect(t, alice.Email, smtp.Subject("A recovery code was used"))
		require.Equal(t, http.StatusForbidden, replayed.StatusCode())
		require.Equal(t, "Invalid recovery code", apierr.Message(replayed.Body))
		require.Nil(t, cookieNamed(replayed.HTTPResponse, "jid"))
	})
}

func TestMFA_TOTP(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should accept a valid TOTP code after registration and refuse a wrong one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		registered, err := alice.API.RegisterUserTotpWithResponse(t.Context())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, registered.StatusCode(), "registering: %s", apierr.Body(registered.Body))
		secret := totpSecret(t, registered.JSON200.OtpUrl)

		// Action
		wrong, err := alice.API.VerifyUserTotpConfigWithResponse(t.Context(),
			api.VerifyUserTotpConfigJSONRequestBody{Totp: otherCode(totp(secret, time.Now()))})
		require.NoError(t, err)
		valid, err := alice.API.VerifyUserTotpConfigWithResponse(t.Context(),
			api.VerifyUserTotpConfigJSONRequestBody{Totp: totp(secret, time.Now())})
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusBadRequest, wrong.StatusCode())
		require.Equal(t, "Invalid TOTP token", apierr.Message(wrong.Body))
		require.Equalf(t, http.StatusOK, valid.StatusCode(), "verifying: %s", apierr.Body(valid.Body))
		cfg, err := alice.API.GetUserTotpConfigWithResponse(t.Context())
		require.NoError(t, err)
		require.True(t, cfg.JSON200.IsVerified)
	})

	t.Run("should start a session with a TOTP code when the org enforces TOTP, and refuse a wrong one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		secret := registerTOTP(t, alice)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodTotp)
		c := challenge(t, tn, alice.Email)
		totpMethod := new(api.VerifyMfaJSONBodyMfaMethodTotp)

		// Action
		wrong, err := c.API.VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{
			MfaToken: otherCode(totp(secret, time.Now())), MfaMethod: totpMethod,
		})
		require.NoError(t, err)
		valid, err := c.API.VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{
			MfaToken: totp(secret, time.Now()), MfaMethod: totpMethod,
		})
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusForbidden, wrong.StatusCode())
		require.Equal(t, "Invalid TOTP", apierr.Message(wrong.Body))
		require.Equalf(t, http.StatusOK, valid.StatusCode(), "verifying: %s", apierr.Body(valid.Body))
		require.Equal(t, http.StatusOK, orgStatus(t, as(t, tn, valid.JSON200.Token, c.IP), tn.OrgID.String()))
	})
}

func TestMFA_Refusal(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a wrong mailed MFA code and start no session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		enforceMFA(t, tn, api.UpdateOrganizationJSONBodySelectedMfaMethodEmail)
		c := challenge(t, tn, alice.Email)
		wrong := otherCode(code(t, tn.Mail(t).Expect(t, alice.Email, smtp.Subject(mfaSubject))))

		// Action
		res, err := c.API.VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{MfaToken: wrong})

		// Assert
		require.NoError(t, err)
		require.Nil(t, cookieNamed(res.HTTPResponse, "jid"))
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Invalid token", apierr.Message(res.Body))
	})

	t.Run("should refuse an MFA route called with an ordinary session token as unauthorized", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)

		// Action
		res, err := alice.API.VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{MfaToken: "123456"})

		// Assert
		require.NoError(t, err)
		require.Nil(t, cookieNamed(res.HTTPResponse, "jid"))
		require.Equalf(t, http.StatusUnauthorized, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Unauthorized access", apierr.Message(res.Body))
	})
}

func require4xx(t *testing.T, status int, body []byte) {
	t.Helper()
	require.GreaterOrEqualf(t, status, 400, "body: %s", apierr.Body(body))
	require.Lessf(t, status, 500, "body: %s", apierr.Body(body))
}

func enforceMFA(t *testing.T, tn *harness.Tenant, method api.UpdateOrganizationJSONBodySelectedMfaMethod) {
	t.Helper()
	res := updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{EnforceMfa: new(true), SelectedMfaMethod: &method})
	require.Equalf(t, http.StatusOK, res.StatusCode(), "enforcing MFA: %s", apierr.Body(res.Body))
}

// challenge logs in from a fresh address and selects the tenant's organization, which
// answers with an MFA token. The session's API carries that token.
func challenge(t *testing.T, tn *harness.Tenant, email string) session {
	t.Helper()
	s := loggedIn(t, tn, email)
	res := selectOrg(t, tn, s, tn.OrgID.String())
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting: %s", apierr.Body(res.Body))
	require.True(t, res.JSON200.IsMfaEnabled, "the login was not challenged")
	return session{IP: s.IP, Token: res.JSON200.Token, API: as(t, tn, res.JSON200.Token, s.IP)}
}

// stepUpSession reads the MFA session a step-up refusal opened.
func stepUpSession(t *testing.T, status int, body []byte) string {
	t.Helper()
	require.Equalf(t, http.StatusBadRequest, status, "expected a step-up challenge: %s", apierr.Body(body))
	var e struct {
		Error   string `json:"error"`
		Details struct {
			MfaSessionID string `json:"mfaSessionId"`
		} `json:"details"`
	}
	require.NoError(t, json.Unmarshal(body, &e))
	require.Equal(t, "SESSION_MFA_REQUIRED", e.Error)
	require.NotEmpty(t, e.Details.MfaSessionID)
	return e.Details.MfaSessionID
}

func verifyStepUp(t *testing.T, tn *harness.Tenant, p *harness.Principal, sessionID string) *api.VerifyMfaSessionResponse {
	t.Helper()
	mailed := code(t, tn.Mail(t).Expect(t, p.Email, smtp.Subject(mfaSubject)))
	res, err := p.API.VerifyMfaSessionWithResponse(t.Context(), sessionID, api.VerifyMfaSessionJSONRequestBody{
		MfaToken:  mailed,
		MfaMethod: api.VerifyMfaSessionJSONBodyMfaMethodEmail,
	})
	require.NoError(t, err)
	return res
}

// enableEmailMFA turns on email MFA from personal settings, which needs a step-up with
// the mailed code, and returns the recovery codes it issued.
func enableEmailMFA(t *testing.T, tn *harness.Tenant, p *harness.Principal) []string {
	t.Helper()
	method := api.ActivateUserMfaJSONBodySelectedMfaMethodEmail
	refused, err := p.API.ActivateUserMfaWithResponse(t.Context(), api.ActivateUserMfaJSONRequestBody{SelectedMfaMethod: &method})
	require.NoError(t, err)
	sessionID := stepUpSession(t, refused.StatusCode(), refused.Body)
	verified := verifyStepUp(t, tn, p, sessionID)
	require.Equalf(t, http.StatusOK, verified.StatusCode(), "verifying the step-up: %s", apierr.Body(verified.Body))
	res, err := p.API.ActivateUserMfaWithResponse(t.Context(), api.ActivateUserMfaJSONRequestBody{
		SelectedMfaMethod: &method,
		MfaSessionId:      &sessionID,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "activating MFA: %s", apierr.Body(res.Body))
	require.NotEmpty(t, res.JSON200.RecoveryCodes)
	return res.JSON200.RecoveryCodes
}

func deactivateMFA(t *testing.T, c *api.ClientWithResponses, sessionID string) *api.DeactivateUserMfaResponse {
	t.Helper()
	body := map[string]string{}
	if sessionID != "" {
		body["mfaSessionId"] = sessionID
	}
	res, err := c.DeactivateUserMfaWithBodyWithResponse(t.Context(), "application/json", postJSON(t, body))
	require.NoError(t, err)
	return res
}

func mfaEnabled(t *testing.T, c *api.ClientWithResponses) bool {
	t.Helper()
	res, err := c.GetCurrentUserWithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading the user: %s", apierr.Body(res.Body))
	return res.JSON200.User.IsMfaEnabled != nil && *res.JSON200.User.IsMfaEnabled
}

// registerTOTP registers and verifies an authenticator for the user and returns its
// secret.
func registerTOTP(t *testing.T, p *harness.Principal) []byte {
	t.Helper()
	registered, err := p.API.RegisterUserTotpWithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, registered.StatusCode(), "registering: %s", apierr.Body(registered.Body))
	secret := totpSecret(t, registered.JSON200.OtpUrl)
	res, err := p.API.VerifyUserTotpConfigWithResponse(t.Context(), api.VerifyUserTotpConfigJSONRequestBody{Totp: totp(secret, time.Now())})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "verifying the authenticator: %s", apierr.Body(res.Body))
	return secret
}

func totpSecret(t *testing.T, otpURL string) []byte {
	t.Helper()
	u, err := url.Parse(otpURL)
	require.NoError(t, err)
	raw := strings.ToUpper(u.Query().Get("secret"))
	secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(raw)
	require.NoError(t, err)
	return secret
}

// totp is RFC 6238 with the authenticator defaults: HMAC-SHA1, 30 second steps, six
// digits.
func totp(secret []byte, at time.Time) string {
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(at.Unix()/30))
	mac := hmac.New(sha1.New, secret)
	mac.Write(counter[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	n := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", n%1_000_000)
}
