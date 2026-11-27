package certificates_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type metadataEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// setMetadata sends a metadata edit for the certificate as `as` and returns the
// response, whatever its status.
func setMetadata(t *testing.T, as *harness.Principal, certID uuid.UUID, entries ...metadataEntry) *api.UpdateCertificateResponse {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"metadata": entries})
	require.NoError(t, err)
	res, err := as.API.UpdateCertificateWithBodyWithResponse(t.Context(), certID, "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

// metadataOf is the metadata of a certificate read.
func metadataOf(res *api.GetCertificateResponse) []metadataEntry {
	got := res.JSON200.Certificate.Metadata
	out := []metadataEntry{}
	if got != nil {
		for _, m := range *got {
			out = append(out, metadataEntry{Key: m.Key, Value: m.Value})
		}
	}
	return out
}

func TestCertificate_Metadata(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should replace the whole metadata with the edit and leave the rest of the certificate as it was", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".meta.test"))
		first := setMetadata(t, g.Operator, issued.ID, metadataEntry{"env", "prod"}, metadataEntry{"team", "edge"})
		require.Equalf(t, http.StatusOK, first.StatusCode(), "setting metadata: %s", apierr.Body(first.Body))
		before := pki.ReadCertificate(t, tn.Admin, issued.ID).JSON200.Certificate

		// Action
		res := setMetadata(t, g.Operator, issued.ID, metadataEntry{"team", "payments"})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "editing metadata: %s", apierr.Body(res.Body))
		read := pki.ReadCertificate(t, tn.Admin, issued.ID)
		require.Equal(t, []metadataEntry{{"team", "payments"}}, metadataOf(read))
		after := read.JSON200.Certificate
		before.Metadata, after.Metadata = nil, nil
		require.Equal(t, before, after)
		audited := fixture.WaitForAuditEvents(t, tn, "update-certificate-metadata", 2, func(e fixture.AuditEvent) bool {
			return e.Metadata["certificateId"] == issued.ID.String()
		})
		require.Len(t, audited, 2)
		for _, e := range audited {
			require.Equal(t, g.Operator.ID.String(), e.Actor["userId"])
		}
	})

	t.Run("should refuse a Product Member outside the application and keep the metadata", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".meta.test"))
		set := setMetadata(t, g.Operator, issued.ID, metadataEntry{"env", "prod"})
		require.Equalf(t, http.StatusOK, set.StatusCode(), "setting metadata: %s", apierr.Body(set.Body))
		outsider := tn.NewUser(t, harness.WithName("outsider"))
		g.Project.Grant(t, outsider)

		// Action
		res := setMetadata(t, outsider, issued.ID, metadataEntry{"env", "dev"})

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, []metadataEntry{{"env", "prod"}}, metadataOf(pki.ReadCertificate(t, tn.Admin, issued.ID)))
	})
}
