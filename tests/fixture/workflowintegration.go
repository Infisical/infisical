package fixture

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// WorkflowIntegration is a row of the organization's workflow integration list, which
// holds pending Microsoft Teams integrations that the Teams list leaves out.
type WorkflowIntegration struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Integration string `json:"integration"`
	Status      string `json:"status"`
}

// WorkflowIntegrations lists every workflow integration of the tenant.
func WorkflowIntegrations(tt *testing.T, tn *harness.Tenant) []WorkflowIntegration {
	tt.Helper()
	res, err := tn.Admin.API.ListWorkflowIntegrationsWithResponse(tt.Context())
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "listing workflow integrations: %s", apierr.Body(res.Body))
	out := []WorkflowIntegration{}
	for _, w := range *res.JSON200 {
		status := ""
		if w.Status != nil {
			status = *w.Status
		}
		out = append(out, WorkflowIntegration{ID: w.Id.String(), Slug: w.Slug, Integration: w.Integration, Status: status})
	}
	return out
}

// WorkflowIntegrationBySlug is the tenant's integration with that slug, or nil.
func WorkflowIntegrationBySlug(tt *testing.T, tn *harness.Tenant, slug string) *WorkflowIntegration {
	tt.Helper()
	for _, w := range WorkflowIntegrations(tt, tn) {
		if w.Slug == slug {
			return &w
		}
	}
	return nil
}
