package ca_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// listedCA is one entry of the general CA list, whose entries are a union over CA
// types; only the fields every branch carries are read.
type listedCA struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Status string `json:"status"`
}

func TestCertificateAuthority_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the project's internal and external CAs with their type and status", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		internal := pki.NewInternalCA(t, proj)
		acme, _, _ := pki.NewCloudflareAcmeCA(t, proj)

		// Action
		res, err := tn.Admin.API.ListCertificateAuthoritiesV1GeneralWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "listing CAs: %s", apierr.Body(res.Body))
		var body struct {
			CertificateAuthorities []listedCA `json:"certificateAuthorities"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &body))
		got := map[string]listedCA{}
		for _, ca := range body.CertificateAuthorities {
			got[ca.ID] = ca
		}
		require.Len(t, got, 2)
		require.Equal(t, "internal", got[internal.ID.String()].Type)
		require.Equal(t, "active", got[internal.ID.String()].Status)
		require.Equal(t, "acme", got[acme.ID.String()].Type)
		require.Equal(t, "active", got[acme.ID.String()].Status)
	})
}
