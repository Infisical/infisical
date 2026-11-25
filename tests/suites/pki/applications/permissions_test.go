package applications_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// permissions reads the member's effective permissions on the graph's application,
// unpacked from CASL's packed rules ([actions, subject, ...], each comma-joined) into
// subject -> actions. It also returns the roles the member holds there.
func permissions(t *testing.T, as *harness.Principal, g *pki.Graph) (map[string][]string, []string) {
	t.Helper()
	res, err := as.API.GetPkiApplicationPermissionsWithResponse(t.Context(), g.App.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading permissions returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	can := map[string][]string{}
	for _, raw := range res.JSON200.Data.Permissions {
		rule, ok := raw.([]any)
		require.Truef(t, ok, "not a packed rule: %v", raw)
		require.GreaterOrEqual(t, len(rule), 2)
		actions, _ := rule[0].(string)
		subjects, _ := rule[1].(string)
		for _, s := range strings.Split(subjects, ",") {
			can[s] = append(can[s], strings.Split(actions, ",")...)
		}
	}
	var roles []string
	for _, m := range res.JSON200.Data.Memberships {
		for _, r := range m.Roles {
			roles = append(roles, r.Role)
		}
	}
	return can, roles
}

func TestApplication_Permissions(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let an application admin edit and delete the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		admin := member(t, tn, g, "admin")

		// Action
		can, roles := permissions(t, admin, g)

		// Assert
		require.Equal(t, []string{"admin"}, roles)
		require.Subset(t, can["certificate-application"], []string{"read", "edit", "delete"})
		require.Contains(t, can["certificates"], "delete")
	})

	t.Run("should let an operator issue but not edit the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		can, roles := permissions(t, g.Operator, g)

		// Assert
		require.Equal(t, []string{"operator"}, roles)
		require.Equal(t, []string{"read"}, can["certificate-application"])
		require.Subset(t, can["certificates"], []string{"create", "read-private-key"})
		require.NotContains(t, can["certificates"], "delete")
	})

	t.Run("should let an auditor only read and list certificates", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		auditor := member(t, tn, g, "auditor")

		// Action
		can, roles := permissions(t, auditor, g)

		// Assert
		require.Equal(t, []string{"auditor"}, roles)
		require.Equal(t, []string{"read"}, can["certificate-application"])
		require.ElementsMatch(t, []string{"read", "list"}, can["certificates"])
	})
}
