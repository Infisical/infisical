package alerts_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// previewSet is a graph holding three certificates: one whose common name matches the
// filter and expires inside a 60-day window, one that matches but expires outside it,
// and one inside the window that does not match.
type previewSet struct {
	g               *pki.Graph
	filterValue     string
	matched, others uuid.UUID
}

func newPreviewSet(t *testing.T, tn *harness.Tenant) previewSet {
	t.Helper()
	g := pki.NewGraph(t, tn)
	marker := "m" + id.Short()
	long := pki.ServerCertificate("long." + marker + ".preview.test")
	long.Attributes.Ttl = new("120d")
	matched := g.Issue(t, pki.ServerCertificate("short."+marker+".preview.test")).ID
	g.Issue(t, long)
	return previewSet{
		g:           g,
		filterValue: marker,
		matched:     matched,
		others:      g.Issue(t, pki.ServerCertificate(id.Short()+".unmatched.test")).ID,
	}
}

// preview asks, as actor, which certificates an expiry alert warning 60 days ahead
// would match with a common name containing value.
func preview(t *testing.T, actor *harness.Principal, value string) *api.PreviewPkiAlertCertificatesV1Response {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"filters":     []map[string]any{{"field": "common_name", "operator": "contains", "value": value}},
		"alertBefore": "60d",
	})
	require.NoError(t, err)
	res, err := actor.API.PreviewPkiAlertCertificatesV1WithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

func previewIDs(t *testing.T, res *api.PreviewPkiAlertCertificatesV1Response) []uuid.UUID {
	t.Helper()
	require.NotNilf(t, res.JSON200, "previewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, c := range res.JSON200.Certificates {
		out = append(out, c.Id)
	}
	return out
}

func TestAlertPreview(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should leave out a certificate whose common name does not match the filter", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		set := newPreviewSet(t, tn)

		// Action
		res := preview(t, tn.Admin, set.filterValue)

		// Assert
		ids := previewIDs(t, res)
		require.NotContains(t, ids, set.others)
		require.Contains(t, ids, set.matched)
	})

	t.Run("should refuse a Product Member who cannot read alerts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		set := newPreviewSet(t, tn)

		// Action
		res := preview(t, set.g.Operator, set.filterValue)

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), set.matched.String())
	})
}

func TestAlertPreview_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the matching certificate that expires inside the alert window", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The preview sets showPreview, and findMatchingCertificates (pki-alert-v2-dal.ts)
			checks showPreview before alertBefore, so the window is ignored and a certificate
			expiring after it is listed too.`)

		// Setup
		tn := h.NewTenant(t)
		set := newPreviewSet(t, tn)

		// Action
		res := preview(t, tn.Admin, set.filterValue)

		// Assert
		require.Equal(t, []uuid.UUID{set.matched}, previewIDs(t, res))
	})
}
