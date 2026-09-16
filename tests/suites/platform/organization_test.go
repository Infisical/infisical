package platform_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/license"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
)

func TestOrganization_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/a tenant gets its own organization", func(t *testing.T) {
		t.Parallel()
		a, b := h.NewTenant(t), h.NewTenant(t)

		if a.OrgID == b.OrgID {
			t.Fatal("two tenants share an organization, so nothing is isolated")
		}
		if a.OrgSlug == b.OrgSlug {
			t.Errorf("two tenants share a slug (%s), so their mail domains collide", a.OrgSlug)
		}
	})

	t.Run("ok/the admin is scoped to its own organization", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A login token carries no organization; selectOrganization binds it. An
			unbound token reaches no org-scoped route, so this is what every other test
			depends on without saying so.`)

		tn := h.NewTenant(t)
		res, err := tn.Admin.API.GetOrganizationPlanWithResponse(t.Context(), tn.OrgID.String(), nil)
		if err != nil {
			t.Fatalf("reading the plan: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("admin cannot read its own organization: %d", res.StatusCode())
		}
	})

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

func TestOrganization_Entitlements(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/a tenant is entitled by default", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Entitlements resolve per organization, which needs Cloud instance type:
			every other type short-circuits to one instance-wide feature set. If this fails,
			the license stub is not reaching the application at all.`)

		h.NewTenant(t).Verify(t, license.Enterprise())
	})

	t.Run("ok/a tenant can be given a narrower plan", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
		tn.Verify(t, license.Enterprise().Without(license.RBAC))
	})

	t.Run("ok/entitlements are per tenant, not per instance", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `This is what lets a downgrade be asserted under a live organization
			without a dedicated stack. If plans leaked across tenants, every licensing test
			would need its own instance.`)

		narrowed := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
		untouched := h.NewTenant(t)

		untouched.Verify(t, license.Enterprise())
		narrowed.Verify(t, license.Enterprise().Without(license.RBAC))
	})
}

func TestProject_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/creates a project in the tenant's organization", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)

		res, err := tn.Admin.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
			ProjectName: "app",
		})
		if err != nil {
			t.Fatalf("creating a project: %v", err)
		}
		if res.JSON200 == nil {
			t.Fatalf("creating a project returned %d: %s", res.StatusCode(), res.Body)
		}
	})
}
