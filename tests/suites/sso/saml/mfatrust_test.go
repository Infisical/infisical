package saml_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

var amrMFA = map[string][]string{"amr": {"pwd", "mfa"}}

func TestSAMLMFATrust_Login(t *testing.T) {
	t.Parallel()

	// One case per place the signal can come from. The matching rules are unit tested
	// in idp-mfa-signal.test.ts, so no need to repeat that matrix here.
	cases := []struct {
		name       string
		provider   api.CreateSamlConfigJSONBodyAuthProvider
		trust      api.UpdateOrganizationJSONBodySsoMfaTrust
		config     *api.UpdateSamlConfigJSONRequestBody
		idp        func(*samlidp.Response)
		challenged bool
	}{
		{
			name:     "should skip the MFA challenge when the amr attribute lists mfa",
			provider: sso.Okta, trust: api.Signal,
			idp: func(r *samlidp.Response) { r.Attributes = amrMFA },
		},
		{
			name:     "should skip the MFA challenge when the AuthnContextClassRef is a two-factor class",
			provider: sso.Okta, trust: api.Signal,
			idp: func(r *samlidp.Response) {
				r.AuthnContextClassRef = "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract"
			},
		},
		{
			name:     "should skip the MFA challenge for Entra ID when authnmethodsreferences lists multipleauthn",
			provider: sso.Azure, trust: api.Signal,
			idp: func(r *samlidp.Response) {
				r.Attributes = map[string][]string{
					"http://schemas.microsoft.com/claims/authnmethodsreferences": {"http://schemas.microsoft.com/claims/multipleauthn"},
				}
			},
		},
		{
			name:     "should skip the MFA challenge when the AuthnContextClassRef is one the config accepts",
			provider: sso.Okta, trust: api.Signal,
			config: &api.UpdateSamlConfigJSONRequestBody{MfaAuthnContexts: &[]string{"urn:acme:ac:push-approved"}},
			idp:    func(r *samlidp.Response) { r.AuthnContextClassRef = "urn:acme:ac:push-approved" },
		},
		{
			name:     "should skip the MFA challenge when the attribute the config names lists mfa",
			provider: sso.Okta, trust: api.Signal,
			config: &api.UpdateSamlConfigJSONRequestBody{MfaSignalAttribute: new("session.amr")},
			idp:    func(r *samlidp.Response) { r.Attributes = map[string][]string{"session.amr": {"pwd", "mfa"}} },
		},
		{
			name:     "should challenge when the IdP reports a password only",
			provider: sso.Okta, trust: api.Signal,
			idp:        func(r *samlidp.Response) { r.Attributes = map[string][]string{"amr": {"pwd"}} },
			challenged: true,
		},
		{
			name:     "should challenge when the amr attribute lists mfa but the org does not trust the IdP",
			provider: sso.Okta, trust: api.None,
			idp:        func(r *samlidp.Response) { r.Attributes = amrMFA },
			challenged: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			s := setup(t, c.provider)
			alice := signUp(t, s, c.provider)
			sso.EnforceMFA(t, s.Tenant, c.trust)
			if c.config != nil {
				updateConfig(t, s, *c.config)
			}
			c.idp(&alice)

			// Action
			res := selectAfterLogin(t, s, alice)

			// Assert
			if c.challenged {
				requireChallenged(t, res)
				return
			}
			require.False(t, res.JSON200.IsMfaEnabled, "the login was asked for MFA")
			require.Equal(t, http.StatusOK, readOrg(t, s.Tenant, res.JSON200.Token))
		})
	}
}

func TestSAMLMFATrust(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should challenge a password login when the org trusts the IdP", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		bob := s.Tenant.NewUser(t)
		sso.EnforceMFA(t, s.Tenant, api.Signal)
		login, err := s.Tenant.Anonymous(t).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
			Email:    bob.Email,
			Password: harness.UserPassword,
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, login.StatusCode(), "password login: %s", apierr.Body(login.Body))

		// Action
		res, err := s.Tenant.Client(t, login.JSON200.AccessToken).SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: s.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		requireChallenged(t, res)
	})

	t.Run("should challenge in another org when the MFA proof came from this org's IdP", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)
		other := h.NewTenant(t)
		inviteToOrg(t, other, alice.Email)
		sso.EnforceMFA(t, other, api.Signal)
		alice.Attributes = amrMFA
		acs := s.SPLogin(t, alice)
		s.Redirect(t, acs)

		// Action
		res := sso.SelectOrganization(t, s.Tenant, acs.HTTPResponse, other.OrgID.String())

		// Assert
		requireChallenged(t, res)
	})

	t.Run("should skip the MFA challenge on the first login, which verifies the mailbox", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		sso.EnforceMFA(t, s.Tenant, api.Signal)
		alice := s.Person()
		alice.Attributes = amrMFA
		signup := s.CompleteSignup(t, s.SPLogin(t, alice), s.VerificationCode(t, alice.Email))
		require.Equalf(t, http.StatusOK, signup.StatusCode(), "completing SSO signup: %s", apierr.Body(signup.Body))

		// Action
		res, err := s.Tenant.Client(t, signup.JSON200.Token).SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: s.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting: %s", apierr.Body(res.Body))
		require.False(t, res.JSON200.IsMfaEnabled, "the login was asked for MFA")
	})

	t.Run("should record what the IdP sent and that the IdP satisfied MFA in the audit log", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)
		sso.EnforceMFA(t, s.Tenant, api.Signal)
		alice.Attributes = amrMFA

		// Action
		selectAfterLogin(t, s, alice)

		// Assert
		login := waitForAuditEvent(t, s.Tenant, "user-login", func(m map[string]any) bool {
			idpMfa, _ := m["idpMfa"].(map[string]any)
			return idpMfa["verified"] == true
		})
		require.Equal(t, map[string]any{
			"verified": true,
			"evidence": []any{"amr=mfa"},
			"received": []any{"urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport", "amr=pwd", "amr=mfa"},
		}, login["idpMfa"])
		waitForAuditEvent(t, s.Tenant, "select-organization", func(m map[string]any) bool { return m["mfaSatisfiedBy"] == "idp" })
	})

	t.Run("should keep SSO enforced when an update changes only the MFA signal fields", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)

		// Action
		updateConfig(t, s, api.UpdateSamlConfigJSONRequestBody{
			MfaSignalAttribute: new("session.amr"),
			MfaAuthnContexts:   &[]string{"urn:acme:ac:push-approved"},
		})

		// Assert
		require.True(t, authEnforced(t, s.Tenant))
	})
}

// signUp is SignedUp, plus the spn: audience Azure wants on SP-initiated logins.
func signUp(t *testing.T, s *sso.SAML, provider api.CreateSamlConfigJSONBodyAuthProvider) samlidp.Response {
	t.Helper()
	if provider != sso.Azure {
		return s.SignedUp(t)
	}
	p := s.Person()
	p.Audience = "spn:" + s.Issuer
	res := s.CompleteSignup(t, s.SPLogin(t, p), s.VerificationCode(t, p.Email))
	require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
	return p
}

func selectAfterLogin(t *testing.T, s *sso.SAML, p samlidp.Response) *api.SelectOrganizationV3Response {
	t.Helper()
	acs := s.SPLogin(t, p)
	s.Redirect(t, acs)
	res := sso.SelectOrganization(t, s.Tenant, acs.HTTPResponse, s.Tenant.OrgID.String())
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting the organization: %s", apierr.Body(res.Body))
	return res
}

func requireChallenged(t *testing.T, res *api.SelectOrganizationV3Response) {
	t.Helper()
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting the organization: %s", apierr.Body(res.Body))
	require.True(t, res.JSON200.IsMfaEnabled, "the login was not asked for MFA")
	require.Equal(t, "email", *res.JSON200.MfaMethod)
}

func readOrg(t *testing.T, tn *harness.Tenant, token string) int {
	t.Helper()
	res, err := tn.Client(t, token).GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	return res.StatusCode()
}

func updateConfig(t *testing.T, s *sso.SAML, body api.UpdateSamlConfigJSONRequestBody) {
	t.Helper()
	body.OrganizationId = s.Tenant.OrgID.String()
	res, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the SAML config: %s", apierr.Body(res.Body))
}

func inviteToOrg(t *testing.T, tn *harness.Tenant, email string) {
	t.Helper()
	res, err := tn.Admin.API.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(email)},
		OrganizationId:       tn.OrgID.String(),
		OrganizationRoleSlug: new("member"),
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "inviting %s: %s", email, apierr.Body(res.Body))
}

// Audit logs go through a queue, so poll instead of reading once.
func waitForAuditEvent(t *testing.T, tn *harness.Tenant, eventType string, match func(map[string]any) bool) map[string]any {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (map[string]any, bool, error) {
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			EventType: &eventType,
			StartDate: new(time.Now().UTC().Add(-time.Hour).Truncate(time.Second)),
		})
		if err != nil || res.JSON200 == nil {
			return nil, false, err
		}
		for _, l := range res.JSON200.AuditLogs {
			if m, ok := l.Event.Metadata.(map[string]any); ok && match(m) {
				return m, true, nil
			}
		}
		return nil, false, nil
	})
	require.NoErrorf(t, err, "waiting for a %s audit event", eventType)
	return got
}
