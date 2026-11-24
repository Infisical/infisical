package appconnections_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestDigiCertAppConnection_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep the new name and description", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := fixture.NewAppConnection(t, tn, fixture.DigiCertAPIKeyAppConnection)
		name := "renamed-" + id.Short()
		raw, err := json.Marshal(map[string]any{"name": name, "description": "issues the storefront certificates"})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.UpdateDigicertAppConnectionWithBodyWithResponse(t.Context(), conn.ID, "application/json", bytes.NewReader(raw))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating returned %s", apierr.Body(res.Body))
		got := readDigiCertConnection(t, tn, conn)
		require.Equal(t, name, got.Name)
		require.Equal(t, "issues the storefront certificates", got.Description)
	})
}

func TestDigiCertAppConnection_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete a connection nothing uses", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := fixture.NewAppConnection(t, tn, fixture.DigiCertAPIKeyAppConnection)

		// Action
		res, err := tn.Admin.API.DeleteDigicertAppConnectionWithResponse(t.Context(), conn.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting returned %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetDigicertAppConnectionWithResponse(t.Context(), conn.ID)
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, got.StatusCode())
	})

	t.Run("should refuse and keep a connection a certificate authority uses", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] The refusal is the generic one and names neither the certificate authority
			nor what to do, unlike the messages the same route gives for approval policies and AI.`)

		// Setup
		tn := h.NewTenant(t)
		conn := fixture.NewAppConnection(t, tn, fixture.DigiCertAPIKeyAppConnection)
		digicert.Open(t, conn.FakenetAdmin(t), conn.Nonce()).Seed(t, digicert.WithOrganization(4242))
		proj := pki.CertManager(t, tn)
		body := api.CreateDigicertCertificateAuthorityV1JSONRequestBody{
			ProjectId: &proj.ID,
			Name:      "digicert-" + id.Short(),
			Status:    api.CreateDigicertCertificateAuthorityV1JSONBodyStatusActive,
		}
		body.Configuration.AppConnectionId = conn.ID
		body.Configuration.OrganizationId = 4242
		body.Configuration.ProductNameId = "ssl_plus"
		ca, err := tn.Admin.API.CreateDigicertCertificateAuthorityV1WithResponse(t.Context(), body)
		require.NoError(t, err)
		require.NotNilf(t, ca.JSON200, "creating a DigiCert CA returned %d: %s", ca.StatusCode(), apierr.Body(ca.Body))

		// Action
		res, err := tn.Admin.API.DeleteDigicertAppConnectionWithResponse(t.Context(), conn.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "deleting returned %s", apierr.Body(res.Body))
		require.Equal(t, "Cannot delete App Connection with existing connections. Remove all existing connections and try again.", apierr.Message(res.Body))
		require.Equal(t, conn.Name, readDigiCertConnection(t, tn, conn).Name)
	})
}

type digicertConnection struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func readDigiCertConnection(t *testing.T, tn *harness.Tenant, conn *fixture.AppConnection) digicertConnection {
	t.Helper()
	res, err := tn.Admin.API.GetDigicertAppConnectionWithResponse(t.Context(), conn.ID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading the connection returned %s", apierr.Body(res.Body))
	var out struct {
		AppConnection digicertConnection `json:"appConnection"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.AppConnection
}
