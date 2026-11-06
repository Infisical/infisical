package scep_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/smallstep/scep"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_Enroll(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a certificate for the CSR's name from the profile's CA when the challenge password matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")
		ca := p.caCerts(t)[1]

		// Action
		got, _ := p.enroll(t, newDevice(t, "test-device.example.com"), "test-device.example.com", "testpassword123")

		// Assert
		require.Equal(t, scep.SUCCESS, got.status)
		require.Equal(t, "test-device.example.com", got.cert.Subject.CommonName)
		require.Equal(t, ca.Subject.String(), got.cert.Issuer.String())
	})

	t.Run("should issue a separate certificate for each device enrolling on one profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "mySecurePass99")
		first := p.mustEnroll(t, "device-01.example.com", "mySecurePass99")

		// Action
		second := p.mustEnroll(t, "device-02.example.com", "mySecurePass99")

		// Assert
		require.Equal(t, "device-01.example.com", first.cert.Subject.CommonName)
		require.Equal(t, "device-02.example.com", second.cert.Subject.CommonName)
		require.NotEqual(t, first.cert.SerialNumber, second.cert.SerialNumber)
	})

	t.Run("should refuse with badRequest when the challenge password is wrong", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")

		// Action
		got, _ := p.enroll(t, newDevice(t, "router-01.corp.local"), "router-01.corp.local", "wrongpassword99")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
	})

	t.Run("should refuse with badRequest when the CSR carries no challenge password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")

		// Action
		got, _ := p.enroll(t, newDevice(t, "router-01.corp.local"), "router-01.corp.local", "")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
	})
}
