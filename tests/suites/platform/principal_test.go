package platform_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestIdentity_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/an identity can act in its own organization", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		id := tn.NewIdentity(t, harness.OrgRole("admin"))

		if id.Token == "" {
			t.Fatal("identity has no access token, so nothing below it can authenticate")
		}
		res, err := id.API.GetOrganizationPlanWithResponse(t.Context(), tn.OrgID.String(), nil)
		if err != nil {
			t.Fatalf("reading the plan as an identity: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("identity cannot read its own organization: %d", res.StatusCode())
		}
	})

	t.Run("forbidden/a no-access identity cannot create a project", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The org role on the identity has to reach the permission layer. If it
			did not, every identity would behave like an admin and no authorization test
			below this one would mean anything.

			Project creation rather than a read: reading the plan only proves membership,
			which no-access still has.`)

		tn := h.NewTenant(t)
		id := tn.NewIdentity(t, harness.OrgRole("no-access"))

		res, err := id.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
			ProjectName: "should-not-exist",
		})
		if err != nil {
			t.Fatalf("creating a project as a no-access identity: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("a no-access identity created a project")
		}
	})

	t.Run("cross-tenant/an identity cannot reach another organization", func(t *testing.T) {
		t.Parallel()
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		id := mine.NewIdentity(t, harness.OrgRole("admin"))

		res, err := id.API.GetOrganizationPlanWithResponse(t.Context(), theirs.OrgID.String(), nil)
		if err != nil {
			t.Fatalf("reading another organization: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatalf("identity in %s read %s's plan", mine.OrgSlug, theirs.OrgSlug)
		}
	})
}

func TestUser_Invite(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/an invited user becomes a member", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The invite link only comes back in the response when SMTP is
			unconfigured, and the harness configures it. So this is also the proof that
			the harness can read a mailbox at all: every email-driven flow depends on it.`)

		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))

		if alice.Email != tn.Address("alice") {
			t.Errorf("user got mailbox %q, want %q", alice.Email, tn.Address("alice"))
		}
		res, err := alice.API.GetOrganizationPlanWithResponse(t.Context(), tn.OrgID.String(), nil)
		if err != nil {
			t.Fatalf("reading the plan as the invited user: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("invited user cannot read the organization they joined: %d", res.StatusCode())
		}
	})

	t.Run("cross-tenant/two tenants can invite the same local part", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Mail isolation is by address, not by server: one Mailpit serves the
			whole run. If the domains did not differ, two parallel tests inviting "alice"
			would read each other's invitation and both would pass or fail at random.`)

		a, b := h.NewTenant(t), h.NewTenant(t)
		ua, ub := a.NewUser(t, harness.WithName("alice")), b.NewUser(t, harness.WithName("alice"))

		if ua.Email == ub.Email {
			t.Fatalf("both tenants issued %s", ua.Email)
		}
		res, err := ua.API.GetOrganizationPlanWithResponse(t.Context(), b.OrgID.String(), nil)
		if err != nil {
			t.Fatalf("reading the other organization: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatalf("%s read %s's plan", ua.Email, b.OrgSlug)
		}
	})
}

func TestProject_Access(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/an identity created in a project can read it", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		proj := tn.NewProject(t)
		id := proj.NewIdentity(t, harness.ProjectRole("admin"))

		res, err := id.API.ListProjectMachineIdentitiesWithResponse(t.Context(), proj.ID, nil)
		if err != nil {
			t.Fatalf("listing project identities: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("identity created in the project cannot read it: %d: %s", res.StatusCode(), res.Body)
		}
	})

	t.Run("forbidden/an org identity outside the project is refused", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Organization membership is not project membership. Conflating them is
			the mistake that would make every project-scoped authorization test vacuous.`)

		tn := h.NewTenant(t)
		proj := tn.NewProject(t)
		outsider := tn.NewIdentity(t, harness.OrgRole("member"))

		res, err := outsider.API.ListProjectMachineIdentitiesWithResponse(t.Context(), proj.ID, nil)
		if err != nil {
			t.Fatalf("listing project identities: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("an identity with no project membership read the project")
		}
	})

	t.Run("ok/granting an existing identity opens the project", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		proj := tn.NewProject(t)
		id := tn.NewIdentity(t, harness.OrgRole("member"))

		proj.Grant(t, id, "admin")

		res, err := id.API.ListProjectMachineIdentitiesWithResponse(t.Context(), proj.ID, nil)
		if err != nil {
			t.Fatalf("listing project identities: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("identity granted project access still refused: %d: %s", res.StatusCode(), res.Body)
		}
	})

	t.Run("ok/a user can be added to a project", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		proj := tn.NewProject(t)
		bob := proj.NewUser(t, harness.WithName("bob"), harness.ProjectRole("admin"))

		res, err := bob.API.ListProjectMachineIdentitiesWithResponse(t.Context(), proj.ID, nil)
		if err != nil {
			t.Fatalf("listing project identities: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("user added to the project cannot read it: %d: %s", res.StatusCode(), res.Body)
		}
	})
}
