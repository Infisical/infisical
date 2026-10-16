package saml_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
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
		{"should reject a response with only the assertion signed when the provider is Okta", okta, samlidp.SignAssertionOnly, "Invalid document signature"},
		{"should reject a response with only the outer response signed when the provider is Okta", okta, samlidp.SignResponseOnly, "Invalid signature"},
		{"should accept a response with only the assertion signed when the provider is Azure", azure, samlidp.SignAssertionOnly, ""},
		{"should accept a response with only the outer response signed when the provider is Google", google, samlidp.SignResponseOnly, ""},
		{"should reject a response with only the assertion signed when the provider is Google", google, samlidp.SignAssertionOnly, "Invalid document signature"},
		{"should reject a response with no signature when the provider is Azure", azure, samlidp.SignNone, "Invalid signature"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			s := setup(t, c.provider)
			alice := s.person()
			alice.Signing = c.signing

			// Action
			res := s.idpLogin(t, alice)

			// Assert
			if c.rejected == "" {
				require.Equal(t, "/signup/sso", s.redirect(t, res).Path)
				require.NotNil(t, membershipOf(t, s.tn, alice.Email))
				return
			}
			require.Equal(t, http.StatusBadRequest, res.StatusCode())
			require.Contains(t, string(res.Body), c.rejected)
			require.Nil(t, membershipOf(t, s.tn, alice.Email))
		})
	}
}

func TestSAMLProvider_AzureAudience(t *testing.T) {
	t.Parallel()

	t.Run("should accept the spn audience when an Azure login is SP-initiated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, azure)
		alice := s.person()
		alice.Audience = "spn:" + s.issuer

		// Action
		res := s.spLogin(t, alice)

		// Assert
		require.Equal(t, "/signup/sso", s.redirect(t, res).Path)
	})

	t.Run("should reject the spn audience when an Azure login is IdP-initiated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, azure)
		alice := s.person()
		alice.Audience = "spn:" + s.issuer

		// Action
		res := s.idpLogin(t, alice)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "audience mismatch")
		require.Nil(t, membershipOf(t, s.tn, alice.Email))
	})
}
