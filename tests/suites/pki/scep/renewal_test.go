package scep_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/smallstep/scep"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_Renew(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew without a challenge password when the request is signed by the issued certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		issued := p.mustEnroll(t, "renew-device.example.com", "testpassword123")

		// Action
		got, _ := p.enroll(t, issued, "renew-device.example.com", "")

		// Assert
		require.Equal(t, scep.SUCCESS, got.status)
		require.Equal(t, "renew-device.example.com", got.cert.Subject.CommonName)
		require.NotEqual(t, issued.cert.SerialNumber, got.cert.SerialNumber)
	})

	t.Run("should refuse the renewal when certificate-based renewal is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, withoutRenewal(staticChallenge("testpassword123")))
		issued := p.mustEnroll(t, "deny-device.example.com", "testpassword123")

		// Action
		got, _ := p.enroll(t, issued, "deny-device.example.com", "")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
	})
}
