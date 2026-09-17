package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
)

func TestOrganization_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("cross-tenant/another tenant's organization is not readable", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The claim the whole Shared profile rests on. If one tenant can reach
			another's organization, running tests in parallel against one instance is unsound
			and every result is suspect.`)

		mine, theirs := h.NewTenant(t), h.NewTenant(t)

		res, err := mine.Admin.API.GetOrganizationPlanWithResponse(t.Context(), theirs.OrgID.String(), nil)
		if err != nil {
			t.Fatalf("reading another organization: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatalf("tenant %s read tenant %s's plan", mine.OrgSlug, theirs.OrgSlug)
		}
	})

	t.Run("notfound/an organization that never existed", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)

		res, err := tn.Admin.API.GetOrganizationPlanWithResponse(t.Context(), uuid.NewString(), nil)
		if err != nil {
			t.Fatalf("reading an absent organization: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("an organization that does not exist returned a plan")
		}
	})
}
