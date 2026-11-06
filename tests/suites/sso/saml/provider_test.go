package saml_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSAMLProvider_Signing(t *testing.T) {
	t.Parallel()
	spec.Why(t, "Each provider relaxes one signature (saml-router.ts provider switch). The accepted "+
		"cases keep that IdP's default signing working; the rejected cases prove a relaxation never "+
		"loosens the other side, and that an unsigned response is refused even on the most relaxed provider.")

	cases := []struct {
		name     string
		provider api.CreateSamlConfigJSONBodyAuthProvider
		signing  samlidp.Signing
		rejected string // empty when the login is accepted
	}{
		{"should reject a response with only the assertion signed when the provider is Okta", sso.Okta, samlidp.SignAssertionOnly, "Invalid document signature"},
		{"should reject a response with only the outer response signed when the provider is Okta", sso.Okta, samlidp.SignResponseOnly, "Invalid signature"},
		{"should accept a response with only the assertion signed when the provider is Azure", sso.Azure, samlidp.SignAssertionOnly, ""},
		{"should accept a response with only the outer response signed when the provider is Google", sso.Google, samlidp.SignResponseOnly, ""},
		{"should reject a response with only the assertion signed when the provider is Google", sso.Google, samlidp.SignAssertionOnly, "Invalid document signature"},
		{"should reject a response with no signature when the provider is Azure", sso.Azure, samlidp.SignNone, "Invalid signature"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			s := setup(t, c.provider)
			alice := s.Person()
			alice.Signing = c.signing

			// Action
			res := s.IdPLogin(t, alice)

			// Assert
			if c.rejected == "" {
				require.Equal(t, "/signup/sso", s.Redirect(t, res).Path)
				require.NotNil(t, fixture.MembershipOf(t, s.Tenant, alice.Email))
				return
			}
			require.Equal(t, http.StatusBadRequest, res.StatusCode())
			require.Contains(t, string(res.Body), c.rejected)
			require.Nil(t, fixture.MembershipOf(t, s.Tenant, alice.Email))
		})
	}
}

func TestSAMLProvider_AzureAudience(t *testing.T) {
	t.Parallel()

	t.Run("should accept the spn audience when an Azure login is SP-initiated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Azure)
		alice := s.Person()
		alice.Audience = "spn:" + s.Issuer

		// Action
		res := s.SPLogin(t, alice)

		// Assert
		require.Equal(t, "/signup/sso", s.Redirect(t, res).Path)
	})

	t.Run("should reject the spn audience when an Azure login is IdP-initiated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Azure)
		alice := s.Person()
		alice.Audience = "spn:" + s.Issuer

		// Action
		res := s.IdPLogin(t, alice)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "audience mismatch")
		require.Nil(t, fixture.MembershipOf(t, s.Tenant, alice.Email))
	})
}
