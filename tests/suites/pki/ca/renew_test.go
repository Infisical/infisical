package ca_test

import (
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_Renew(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should add a new CA certificate beside the old one, under which earlier leaves still verify", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		before := pki.CACertificate(t, tn.Admin, g.CA.ID)
		leaf := pki.ParseLeaf(t, g.Issue(t, pki.ServerCertificate(id.Short()+".renew.test")).Certificate)

		// Action
		res, err := tn.Admin.API.RenewCaCertificateWithResponse(t.Context(), g.CA.ID.String(), api.RenewCaCertificateJSONRequestBody{
			Type:     api.Existing,
			NotAfter: time.Now().AddDate(2, 0, 0).UTC().Format(time.RFC3339),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "renewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		renewed := pki.ParseLeaf(t, res.JSON200.Certificate)
		require.NotEqual(t, before.SerialNumber, renewed.SerialNumber)
		require.Equal(t, renewed.SerialNumber, pki.CACertificate(t, tn.Admin, g.CA.ID).SerialNumber)
		all, err := tn.Admin.API.GetCaCertificatesWithResponse(t.Context(), g.CA.ID)
		require.NoError(t, err)
		require.NotNil(t, all.JSON200)
		serials := []string{}
		for _, c := range *all.JSON200 {
			serials = append(serials, pki.ParseLeaf(t, c.Certificate).SerialNumber.String())
		}
		require.ElementsMatch(t, []string{before.SerialNumber.String(), renewed.SerialNumber.String()}, serials)
		require.NoError(t, leaf.CheckSignatureFrom(before))
	})
}
