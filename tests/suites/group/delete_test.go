package group_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestGroup_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove every member's project access when the group is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		first, second := tn.NewUser(t), tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, first, second)
		proj.GrantGroup(t, group, "viewer")
		for _, p := range []*harness.Principal{first, second} {
			waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, p.API, proj.ID) })
		}

		// Action
		res, err := tn.Admin.API.DeleteGroupWithResponse(t.Context(), group.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		for _, p := range []*harness.Principal{first, second} {
			body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return listSecrets(t, p.API, proj.ID) })
			require.Contains(t, string(body), "You are not a member of this project")
		}
	})

	t.Run("should refuse deleting a root group linked into a sub-org, naming the sub-org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group)

		// Action
		res, err := tn.Admin.API.DeleteGroupWithResponse(t.Context(), group.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot delete this group because it is linked by sub-organizations")
		require.Contains(t, apierr.Message(res.Body), `"`+sub.Name+`"`)
		require.Contains(t, groupNames(t, tn.Admin.API), group.Name)
	})
}
