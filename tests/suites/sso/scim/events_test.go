package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func scimEvents(t *testing.T, actor *harness.Principal) (reply, []string) {
	t.Helper()
	res, err := actor.API.ListScimEventsWithResponse(t.Context(), &api.ListScimEventsParams{})
	require.NoError(t, err)
	r := reply{res.StatusCode(), res.Body}
	if r.status != http.StatusOK {
		return r, nil
	}
	types := make([]string, 0, len(res.JSON200.ScimEvents))
	for _, e := range res.JSON200.ScimEvents {
		if e.EventType != nil {
			types = append(types, *e.EventType)
		}
	}
	return r, types
}

func TestScimEvents(t *testing.T) {
	t.Parallel()

	t.Run("should record what the IdP did, newest first", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())
		deactivate(t, s, user.ID)
		s.provisionGroup(t, "engineering", user.ID)

		// Action
		r, types := scimEvents(t, s.tn.Admin)

		// Assert
		requireOK(t, r, "listing SCIM events")
		require.Equal(t, []string{"create-group", "update-user", "create-user"}, types)
	})

	t.Run("should show only the caller's organization's events", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		theirs.provision(t, theirs.person())

		// Action
		r, types := scimEvents(t, mine.tn.Admin)

		// Assert
		requireOK(t, r, "listing SCIM events")
		require.Empty(t, types)
	})

	t.Run("should refuse a member without permission to read SCIM settings", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		member := s.tn.NewUser(t)

		// Action
		r, _ := scimEvents(t, member)

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
	})
}
