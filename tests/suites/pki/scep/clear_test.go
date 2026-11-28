package scep_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_Clear(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stop serving the profile's CA certificates once SCEP enrollment is cleared", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "A device needs GetCACert's RA certificate to build a PKCSReq, so refusing it stops new devices enrolling.")

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		clear, err := tn.Admin.API.ClearPkiApplicationScepEnrollmentWithResponse(t.Context(), p.app.ID, p.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, clear.StatusCode(), "clearing SCEP enrollment: %s", apierr.Body(clear.Body))

		// Action
		res := p.operation(t, "GetCACert", nil)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "SCEP enrollment is not configured for this profile on the Application.", apierr.Message(res.Body))
	})

	t.Run("should refuse and issue nothing for a PKCSReq a device prepared before SCEP enrollment was cleared", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "A device that already holds the RA certificate skips GetCACert and goes straight to PKIOperation.")

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		req := p.pkcsReq(t, newDevice(t, "cleared-device"), "cleared.scep.test", "testpassword123")
		clear, err := tn.Admin.API.ClearPkiApplicationScepEnrollmentWithResponse(t.Context(), p.app.ID, p.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, clear.StatusCode(), "clearing SCEP enrollment: %s", apierr.Body(clear.Body))

		// Action
		res, err := p.api.PostScepApplicationOperationWithBodyWithResponse(t.Context(), p.app.ID, p.profile.ID,
			&api.PostScepApplicationOperationParams{Operation: new("PKIOperation")}, "application/x-pki-message", bytes.NewReader(req.msg.Raw))
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "SCEP enrollment is not configured for this profile on the Application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p.project, p.profile))
	})
}
