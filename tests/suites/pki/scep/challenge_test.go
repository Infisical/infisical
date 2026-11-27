package scep_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
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

	t.Run("should refuse a challenge from another application's SCEP endpoint for the same profile with badRequest and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, dynamicChallenge(10))
		other := p
		other.app = pki.NewApplication(t, p.project, p.profile)
		pki.EnableSCEP(t, other.app, p.profile, dynamicChallenge(10))
		challenge := p.mustChallenge(t, pki.NewMember(t, p.app, "app-operator", "operator"))

		// Action
		got, _ := other.enroll(t, newDevice(t, "cross-app.example.com"), "cross-app.example.com", challenge)

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
		require.Empty(t, p.certificates(t))
		other.mustEnroll(t, "other-app.example.com", other.mustChallenge(t, pki.NewMember(t, other.app, "other-operator", "operator")))
		p.mustEnroll(t, "own-app.example.com", challenge)
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
		p := newStandaloneScepProfile(t, tn, 60)
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

	t.Run("should refuse an expired challenge with badRequest and issue nothing", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The shortest expiry is one minute and nothing can move the instance's clock, so
			this waits it out, longer than a Shared package test normally may. The signal is a second
			profile allowing one pending challenge, issued one just after the first: it grants another
			only once that one has expired, so the first has too. Generating a challenge deletes the
			expired ones of its own profile, so polling the enrolling profile would remove the first
			challenge and the test would pass without the expiry check.`)

		// Setup
		tn := h.NewTenant(t)
		p := newStandaloneScepProfile(t, tn, 1)
		clock := newStandaloneScepProfile(t, tn, 1)
		first, err := tn.Admin.API.GenerateScepDynamicChallengeWithResponse(t.Context(), p.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, first.StatusCode(), "generating a challenge: %s", apierr.Body(first.Body))
		ticked, err := tn.Admin.API.GenerateScepDynamicChallengeWithResponse(t.Context(), clock.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, ticked.StatusCode(), "generating the clock challenge: %s", apierr.Body(ticked.Body))
		expired, err := wait.For(t.Context(), func(ctx context.Context) (*api.GenerateScepDynamicChallengeResponse, bool, error) {
			res, err := tn.Admin.API.GenerateScepDynamicChallengeWithResponse(ctx, clock.profile.ID)
			if err != nil {
				return nil, false, err
			}
			if res.StatusCode() == http.StatusBadRequest {
				return nil, false, fmt.Errorf("the clock challenge is still pending: %s", apierr.Body(res.Body))
			}
			return res, true, nil
		}, wait.Timeout(90*time.Second), wait.Interval(2*time.Second))
		require.NoError(t, err, "waiting for the clock challenge to expire")
		require.Equalf(t, http.StatusOK, expired.StatusCode(), "generating a challenge after expiry: %s", apierr.Body(expired.Body))

		// Action
		got, _ := p.enroll(t, newDevice(t, "expired-device.example.com"), "expired-device.example.com", string(first.Body))

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
		require.Empty(t, p.certificates(t))
	})
}
