package signers_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSigner_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the organization's signers with their certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		first := pki.NewSigner(t, proj)
		second := pki.NewSigner(t, proj)

		// Action
		res, err := tn.Admin.API.ListSignersWithResponse(t.Context(), &api.ListSignersParams{})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing signers returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []uuid.UUID
		for _, s := range res.JSON200.Signers {
			ids = append(ids, s.Id)
			require.Equal(t, "Harness Code Signing", *s.CertificateCommonName)
		}
		require.ElementsMatch(t, []uuid.UUID{first.ID, second.ID}, ids)
		require.EqualValues(t, 2, res.JSON200.TotalCount)
	})
}

func TestSigner_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store a signer's new name, description and renewal lead time", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s := pki.NewSigner(t, pki.CertManager(t, tn))

		// Action
		res, err := tn.Admin.API.UpdateSignerWithResponse(t.Context(), s.ID, api.UpdateSignerJSONRequestBody{
			Name:                       new("release-signer"),
			Description:                new("signs release builds"),
			CertificateRenewBeforeDays: new(7),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating the signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got := signerState(t, tn, s.ID).JSON200
		require.Equal(t, "release-signer", got.Name)
		require.Equal(t, "signs release builds", *got.Description)
		require.EqualValues(t, 7, *got.CertificateRenewBeforeDays)
	})

	t.Run("should refuse a renewal lead time as long as the certificate's validity and keep the signer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s := pki.NewSigner(t, pki.CertManager(t, tn))

		// Action
		res, err := tn.Admin.API.UpdateSignerWithResponse(t.Context(), s.ID, api.UpdateSignerJSONRequestBody{
			CertificateRenewBeforeDays: new(30),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Renew before (30d) must be less than the certificate validity (30d).", apierr.Message(res.Body))
		require.Nil(t, signerState(t, tn, s.ID).JSON200.CertificateRenewBeforeDays)
	})
}

func TestSigner_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete a signer so it can no longer be read or sign", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")

		// Action
		res, err := tn.Admin.API.DeleteSignerWithResponse(t.Context(), s.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the signer: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetSignerByIdWithResponse(t.Context(), s.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, got.StatusCode(), "reading the deleted signer: %s", apierr.Body(got.Body))
		signed, _ := pki.Sign(t, operator, s.ID)
		require.Equalf(t, http.StatusNotFound, signed.StatusCode(), "signing with the deleted signer: %s", apierr.Body(signed.Body))
	})
}

func TestSigner_Status(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse to sign while the signer is disabled and record no operation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")

		// Action
		res, err := tn.Admin.API.UpdateSignerStatusWithResponse(t.Context(), s.ID, api.UpdateSignerStatusJSONRequestBody{
			Status: api.UpdateSignerStatusJSONBodyStatusDisabled,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "disabling the signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "disabled", *signerState(t, tn, s.ID).JSON200.Status)
		signed, _ := pki.Sign(t, operator, s.ID)
		require.Equal(t, http.StatusBadRequest, signed.StatusCode())
		require.Equal(t, "Signer '"+signerState(t, tn, s.ID).JSON200.Name+"' is not active (status: disabled)", apierr.Message(signed.Body))
		ops, err := tn.Admin.API.ListSigningOperationsWithResponse(t.Context(), s.ID, nil)
		require.NoError(t, err)
		require.NotNilf(t, ops.JSON200, "listing signing operations returned %d: %s", ops.StatusCode(), apierr.Body(ops.Body))
		require.Empty(t, ops.JSON200.Operations)
	})

	t.Run("should sign again once a disabled signer is enabled", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")
		disabled, err := tn.Admin.API.UpdateSignerStatusWithResponse(t.Context(), s.ID, api.UpdateSignerStatusJSONRequestBody{
			Status: api.UpdateSignerStatusJSONBodyStatusDisabled,
		})
		require.NoError(t, err)
		require.NotNilf(t, disabled.JSON200, "disabling the signer returned %d: %s", disabled.StatusCode(), apierr.Body(disabled.Body))

		// Action
		res, err := tn.Admin.API.UpdateSignerStatusWithResponse(t.Context(), s.ID, api.UpdateSignerStatusJSONRequestBody{
			Status: api.UpdateSignerStatusJSONBodyStatusActive,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "enabling the signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "active", *signerState(t, tn, s.ID).JSON200.Status)
		requireSigns(t, tn, operator, s.ID)
	})
}
