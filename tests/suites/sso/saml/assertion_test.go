package saml_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSAMLAssertion_Rejected(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		corrupt func(t *testing.T, s *sso.SAML, r *samlidp.Response)
		reason  string
	}{
		{
			name:    "should reject the response when it is signed by a key other than the configured cert",
			corrupt: func(t *testing.T, _ *sso.SAML, r *samlidp.Response) { r.SignedBy = samlidp.New(t) },
			reason:  "Invalid document signature",
		},
		{
			name: "should reject the response when the assertion is altered after signing",
			corrupt: func(_ *testing.T, s *sso.SAML, r *samlidp.Response) {
				original := r.Email
				r.AlterSigned = func(xml string) string {
					return strings.ReplaceAll(xml, original, s.Tenant.Email("admin"))
				}
			},
			reason: "Invalid document signature",
		},
		{
			name:    "should reject the response when the audience is not this server",
			corrupt: func(_ *testing.T, _ *sso.SAML, r *samlidp.Response) { r.Audience = "https://other-app.test" },
			reason:  "audience mismatch",
		},
		{
			name: "should reject the response when the assertion has expired",
			corrupt: func(_ *testing.T, _ *sso.SAML, r *samlidp.Response) {
				r.NotBefore = time.Now().Add(-20 * time.Minute)
				r.NotOnOrAfter = time.Now().Add(-10 * time.Minute)
			},
			reason: "expired",
		},
		{
			name:    "should reject the response when the assertion is not yet valid",
			corrupt: func(_ *testing.T, _ *sso.SAML, r *samlidp.Response) { r.NotBefore = time.Now().Add(10 * time.Minute) },
			reason:  "not yet valid",
		},
		{
			name:    "should reject the response when the IdP reports a failed status",
			corrupt: func(_ *testing.T, _ *sso.SAML, r *samlidp.Response) { r.Status = samlidp.StatusResponder },
			reason:  "Responder error",
		},
		{
			name: "should reject the response when the email is missing",
			corrupt: func(_ *testing.T, _ *sso.SAML, r *samlidp.Response) {
				r.NameID = r.Email
				r.Email = ""
			},
			reason: "Missing email or first name",
		},
		{
			name:    "should reject the response when the first name is missing",
			corrupt: func(_ *testing.T, _ *sso.SAML, r *samlidp.Response) { r.FirstName = "" },
			reason:  "Missing email or first name",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			s := setup(t, sso.Okta)
			alice := s.Person()
			r := alice
			c.corrupt(t, s, &r)

			// Action
			res := s.SPLogin(t, r)

			// Assert
			require.Equal(t, http.StatusBadRequest, res.StatusCode())
			require.Contains(t, string(res.Body), "Saml authentication failed.")
			require.Contains(t, string(res.Body), c.reason)
			require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
			require.Nil(t, fixture.MembershipOf(t, s.Tenant, alice.Email))
		})
	}

	t.Run("should reject the response when the assertion alone is signed and altered after signing", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Azure accepts an unsigned outer response, so the assertion's own signature is the only check left.")

		// Setup
		s := setup(t, sso.Azure)
		alice := s.Person()
		alice.Signing = samlidp.SignAssertionOnly
		alice.AlterSigned = func(xml string) string {
			return strings.ReplaceAll(xml, alice.Email, s.Tenant.Email("admin"))
		}

		// Action
		res := s.IdPLogin(t, alice)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Saml authentication failed. Invalid signature")
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Nil(t, fixture.MembershipOf(t, s.Tenant, alice.Email))
	})

	t.Run("should reject the response when the config id does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.Person()
		alice.Audience = s.SiteURL
		form := s.IdP.Respond(t, alice)

		// Action
		res := s.ACS(t, uuid.New(), form)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Saml authentication failed. Failed to find SSO data")
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Nil(t, fixture.MembershipOf(t, s.Tenant, alice.Email))
	})
}

func TestSAMLAssertion_EmailDomain(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should reject login when the email domain is not verified by the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		stranger := s.Person()
		stranger.Email = "user@unverified-" + id.Short() + ".test"

		// Action
		res := s.SPLogin(t, stranger)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "not a part of the accepted domains")
		require.Nil(t, fixture.MembershipOf(t, s.Tenant, stranger.Email))
	})

	t.Run("should reject login when the email domain is verified by another org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		theirs := h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, theirs)
		victim := s.Person()
		victim.Email = theirs.Email("victim-" + id.Short())

		// Action
		res := s.SPLogin(t, victim)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "not a part of the accepted domains")
		require.Nil(t, fixture.MembershipOf(t, s.Tenant, victim.Email))
		require.Nil(t, fixture.MembershipOf(t, theirs, victim.Email))
	})
}
