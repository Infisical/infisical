package scep_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/smallstep/scep"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_DynamicChallenge(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a certificate for the CSR's key and name from the profile's CA with a one-time challenge", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, dynamicChallenge(10))
		challenge := p.mustChallenge(t, pki.NewMember(t, p.app, "app-operator", "operator"))

		// Action
		got, key := p.enroll(t, newDevice(t, "otp-device.example.com"), "otp-device.example.com", challenge)

		// Assert
		require.Equalf(t, scep.SUCCESS, got.status, "enrollment failed: %s", got.failInfo)
		require.True(t, key.PublicKey.Equal(got.cert.PublicKey), "the certificate is not for the CSR's key")
		require.Equal(t, "otp-device.example.com", got.cert.Subject.CommonName)
		require.NoError(t, got.cert.CheckSignatureFrom(p.ca))
		require.Contains(t, p.certificates(t), serial(got.cert))
	})

	t.Run("should refuse a used challenge with badRequest and issue nothing more", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, dynamicChallenge(10))
		challenge := p.mustChallenge(t, pki.NewMember(t, p.app, "app-operator", "operator"))
		first := p.mustEnroll(t, "first-device.example.com", challenge)
		issued := p.certificates(t)
		require.Contains(t, issued, serial(first.cert))

		// Action
		got, _ := p.enroll(t, newDevice(t, "second-device.example.com"), "second-device.example.com", challenge)

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
		require.Equal(t, issued, p.certificates(t))
	})

	t.Run("should refuse an application auditor a challenge without using a pending slot", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, dynamicChallenge(1))
		auditor := pki.NewMember(t, p.app, "app-auditor", "auditor")

		// Action
		res := p.challenge(t, auditor)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to generate-scep-challenge on certificate-application-enrollment", apierr.Message(res.Body))
		challenge := p.mustChallenge(t, pki.NewMember(t, p.app, "app-operator", "operator"))
		p.mustEnroll(t, "after-auditor.example.com", challenge)
	})

	t.Run("should refuse a challenge with 400 when the profile takes a static password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		operator := pki.NewMember(t, p.app, "app-operator", "operator")

		// Action
		res := p.challenge(t, operator)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Dynamic challenges are not enabled for this SCEP profile", apierr.Message(res.Body))
	})

	t.Run("should refuse a challenge past the pending limit and keep the pending one usable", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, dynamicChallenge(1))
		operator := pki.NewMember(t, p.app, "app-operator", "operator")
		pending := p.mustChallenge(t, operator)

		// Action
		res := p.challenge(t, operator)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Maximum number of pending challenges (1) reached. Wait for existing challenges to expire or be used.", apierr.Message(res.Body))
		p.mustEnroll(t, "pending-device.example.com", pending)
	})

	t.Run("should issue with a challenge from a profile outside any application and refuse a Product Member one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newStandaloneScepProfile(t, tn)
		member := tn.NewUser(t, harness.WithName("product-member"))
		p.project.Grant(t, member)

		// Action
		refused, err := member.API.GenerateScepDynamicChallengeWithResponse(t.Context(), p.profile.ID)
		require.NoError(t, err)
		res, err := tn.Admin.API.GenerateScepDynamicChallengeWithResponse(t.Context(), p.profile.ID)
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusForbidden, refused.StatusCode(), "answered: %s", apierr.Body(refused.Body))
		require.Equalf(t, http.StatusOK, res.StatusCode(), "generating a challenge: %s", apierr.Body(res.Body))
		got := p.mustEnroll(t, "standalone-device.example.com", string(res.Body))
		require.NoError(t, got.cert.CheckSignatureFrom(p.ca))
		require.Contains(t, p.certificates(t), serial(got.cert))
	})
}
