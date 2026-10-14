package saml_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/samlidp"
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
		corrupt func(t *testing.T, s *sso, r *samlidp.Response)
		reason  string
	}{
		{
			name:    "should reject the response when it is signed by a key other than the configured cert",
			corrupt: func(t *testing.T, _ *sso, r *samlidp.Response) { r.SignedBy = samlidp.New(t) },
			reason:  "Invalid document signature",
		},
		{
			name: "should reject the response when the assertion is altered after signing",
			corrupt: func(_ *testing.T, s *sso, r *samlidp.Response) {
				original := r.Email
				r.AlterSigned = func(xml string) string {
					return strings.ReplaceAll(xml, original, s.tn.Email("admin"))
				}
			},
			reason: "Invalid document signature",
		},
		{
			name:    "should reject the response when the audience is not this server",
			corrupt: func(_ *testing.T, _ *sso, r *samlidp.Response) { r.Audience = "https://other-app.test" },
			reason:  "audience mismatch",
		},
		{
			name: "should reject the response when the assertion has expired",
			corrupt: func(_ *testing.T, _ *sso, r *samlidp.Response) {
				r.NotBefore = time.Now().Add(-20 * time.Minute)
				r.NotOnOrAfter = time.Now().Add(-10 * time.Minute)
			},
			reason: "expired",
		},
		{
			name:    "should reject the response when the assertion is not yet valid",
			corrupt: func(_ *testing.T, _ *sso, r *samlidp.Response) { r.NotBefore = time.Now().Add(10 * time.Minute) },
			reason:  "not yet valid",
		},
		{
			name:    "should reject the response when the IdP reports a failed status",
			corrupt: func(_ *testing.T, _ *sso, r *samlidp.Response) { r.Status = samlidp.StatusResponder },
			reason:  "Responder error",
		},
		{
			name: "should reject the response when the email is missing",
			corrupt: func(_ *testing.T, _ *sso, r *samlidp.Response) {
				r.NameID = r.Email
				r.Email = ""
			},
			reason: "Missing email or first name",
		},
		{
			name:    "should reject the response when the first name is missing",
			corrupt: func(_ *testing.T, _ *sso, r *samlidp.Response) { r.FirstName = "" },
			reason:  "Missing email or first name",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			s := setup(t, okta)
			alice := s.person()
			r := alice
			c.corrupt(t, s, &r)

			// Action
			res := s.spLogin(t, r)

			// Assert
			require.Equal(t, http.StatusBadRequest, res.StatusCode())
			require.Contains(t, string(res.Body), "Saml authentication failed.")
			require.Contains(t, string(res.Body), c.reason)
			require.Nil(t, refreshCookie(res))
			require.Nil(t, membershipOf(t, s.tn, alice.Email))
		})
	}

	t.Run("should reject the response when the assertion alone is signed and altered after signing", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Azure accepts an unsigned outer response, so the assertion's own signature is the only check left.")

		// Setup
		s := setup(t, azure)
		alice := s.person()
		alice.Signing = samlidp.SignAssertionOnly
		alice.AlterSigned = func(xml string) string {
			return strings.ReplaceAll(xml, alice.Email, s.tn.Email("admin"))
		}

		// Action
		res := s.idpLogin(t, alice)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Saml authentication failed. Invalid signature")
		require.Nil(t, refreshCookie(res))
		require.Nil(t, membershipOf(t, s.tn, alice.Email))
	})

	t.Run("should reject the response when the config id does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.person()
		alice.Audience = s.siteURL
		form := s.idp.Respond(t, alice)

		// Action
		res := s.acs(t, uuid.New(), form)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Saml authentication failed. Failed to find SSO data")
		require.Nil(t, refreshCookie(res))
		require.Nil(t, membershipOf(t, s.tn, alice.Email))
	})
}

func TestSAMLAssertion_EmailDomain(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should reject login when the email domain is not verified by the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		stranger := s.person()
		stranger.Email = "user@unverified-" + id.Short() + ".test"

		// Action
		res := s.spLogin(t, stranger)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "not a part of the accepted domains")
		require.Nil(t, membershipOf(t, s.tn, stranger.Email))
	})

	t.Run("should reject login when the email domain is verified by another org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		theirs := h.NewTenant(t)
		verifiedDomain(t, theirs)
		victim := s.person()
		victim.Email = theirs.Email("victim-" + id.Short())

		// Action
		res := s.spLogin(t, victim)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "not a part of the accepted domains")
		require.Nil(t, membershipOf(t, s.tn, victim.Email))
		require.Nil(t, membershipOf(t, theirs, victim.Email))
	})
}
