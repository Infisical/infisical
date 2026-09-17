package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestIdentity_HonoursItsOrgRole(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Not a claim about Infisical's RBAC, which has its own tests: this is
		whether the fixture's option is applied at all. An ignored OrgRole would make
		every identity an admin, and every authorization test written on top of one would
		pass without meaning anything. That has happened once already, with ProjectRole.

		Project creation rather than a read, because reading the plan only proves
		membership and no-access still has that.`)

	tn := harness.From(t).NewTenant(t)
	id := tn.NewIdentity(t, harness.OrgRole("no-access"))

	res, err := id.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
		ProjectName: "should-not-exist",
	})
	if err != nil {
		t.Fatalf("creating a project as a no-access identity: %v", err)
	}
	if res.StatusCode() == http.StatusOK {
		t.Fatal("an identity created with OrgRole(no-access) could create a project")
	}
}

func TestUser_IsInvitedThroughMail(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/an invited user becomes a member", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Also the only proof that the harness can read a mailbox at all. The
			invite link comes back in the response only when SMTP is unconfigured, and the
			harness configures it on purpose, so the link has to be pulled out of Mailpit.
			Every email-driven flow rests on this working.`)

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
			t.Fatalf("an invited user cannot reach the organization they joined: %d", res.StatusCode())
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
		if ua.Token == ub.Token {
			t.Fatal("two separately invited users share a session token")
		}
	})
}
