package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestIdentity_HonoursItsOrgRole(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Whether the option is applied at all: an ignored OrgRole would make every
		identity an admin and every authorization test vacuous. Project creation rather
		than a read, because no-access still has membership.`)

	// Setup
	tn := harness.From(t).NewTenant(t)
	identity := tn.NewIdentity(t, harness.OrgRole("no-access"))

	// Action
	res, err := identity.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
		ProjectName: "should-not-exist",
	})

	// Assert
	require.NoError(t, err)
	require.NotEqual(t, http.StatusOK, res.StatusCode(), "a no-access identity created a project")
}

func TestUser_IsInvitedThroughMail(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should make an invited user a member of the organization", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The invite link only comes back in the response when SMTP is
			unconfigured, so this also proves the harness can read a mailbox.`)

		// Setup
		tn := h.NewTenant(t)

		// Action
		alice := tn.NewUser(t, harness.WithName("alice"))

		// Assert
		require.Equal(t, tn.Address("alice"), alice.Email)
		res, err := alice.API.GetOrganizationPlanWithResponse(t.Context(), tn.OrgID.String(), nil)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode(), "an invited user cannot reach the organization")
	})

	t.Run("should keep users apart when two tenants invite the same local part", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `One SMTP server serves the run, so mail isolation is by address. Equal
			domains would let parallel tests read each other's invitations.`)

		// Setup
		a, b := h.NewTenant(t), h.NewTenant(t)

		// Action
		ua, ub := a.NewUser(t, harness.WithName("alice")), b.NewUser(t, harness.WithName("alice"))

		// Assert
		require.NotEqual(t, ua.Email, ub.Email)
		require.NotEqual(t, ua.Token, ub.Token, "two separately invited users share a session")
	})
}
