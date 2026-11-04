package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAssumePrivilege_Scope(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should not carry the assumed identity's access into another project the requester is not in", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		assumed := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		requester := assumed.NewUser(t, fixture.WithRoles("admin"))
		target := tn.NewMachineIdentity(t)
		assumed.Grant(t, target, "viewer")
		other.Grant(t, target, "admin")
		session := startSession(t, requester, assumed, target)

		// Action
		created := createSecret(t, requester.API, other, "dev", "/", "THROUGH_COOKIE", "value", withCookie(session))

		// Assert
		requireStatus(t, http.StatusForbidden, created.StatusCode(), created.Body)
		require.Empty(t, keysOf(listSecrets(t, tn.Admin.API, other, "dev", "/")))
		asViewer := createSecret(t, requester.API, assumed, "dev", "/", "AS_VIEWER", "value", withCookie(session))
		require.Equal(t, http.StatusForbidden, asViewer.StatusCode(), "the session should still hold the viewer's access in its own project")
	})
}
