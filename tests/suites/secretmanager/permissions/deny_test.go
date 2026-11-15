package permissions_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestRole_DenyRules(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	readAll := allow("secrets", "read")

	t.Run("should let a deny on an environment win over an allow from another role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "KEY", "dev-value")
		secretmanager.CreateSecret(t, proj, "prod", "KEY", "prod-value")
		proj.NewRole(t, "reads-all", readAll)
		proj.NewRole(t, "no-prod", deny(allowWhere("secrets", map[string]any{"environment": "prod"}, "read")))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("reads-all", "no-prod"))

		// Action
		prod := listSecrets(t, reader, proj, "prod", "/", false)

		// Assert
		require.Equalf(t, http.StatusOK, prod.status, "listing prod: %s", prod.body)
		require.NotContains(t, prod.values, "KEY")
		require.NotContains(t, string(prod.body), "prod-value")
		require.Equal(t, "dev-value", listSecrets(t, reader, proj, "dev", "/", false).values["KEY"])
	})

	t.Run("should let a deny on a path win over an allow from another role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/locked")
		secretmanager.CreateSecret(t, proj, "dev", "OPEN", "open-value")
		secretmanager.CreateSecret(t, proj, "dev", "LOCKED", "locked-value", secretmanager.WithPath("/locked"))
		proj.NewRole(t, "reads-all", readAll)
		proj.NewRole(t, "no-locked", deny(allowWhere("secrets", map[string]any{"secretPath": "/locked"}, "read")))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("reads-all", "no-locked"))

		// Action
		locked := listSecrets(t, reader, proj, "dev", "/locked", false)

		// Assert
		require.Equalf(t, http.StatusOK, locked.status, "listing /locked: %s", locked.body)
		require.NotContains(t, locked.values, "LOCKED")
		require.NotContains(t, string(locked.body), "locked-value")
		require.Equal(t, "open-value", listSecrets(t, reader, proj, "dev", "/", false).values["OPEN"])
	})

	t.Run("should let a deny on a secret name win over an allow from another role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "OPEN", "open-value")
		secretmanager.CreateSecret(t, proj, "dev", "TOP_SECRET", "hidden-value")
		proj.NewRole(t, "reads-all", readAll)
		proj.NewRole(t, "no-top-secret", deny(allowWhere("secrets", map[string]any{"secretName": "TOP_SECRET"}, "read")))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("reads-all", "no-top-secret"))

		// Action
		got := listSecrets(t, reader, proj, "dev", "/", false)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing: %s", got.body)
		require.Equal(t, map[string]string{"OPEN": "open-value"}, got.values)
		require.NotContains(t, string(got.body), "hidden-value")
	})

	t.Run("should let a deny from a group role win over an allow on the direct role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/locked")
		secretmanager.CreateSecret(t, proj, "dev", "OPEN", "open-value")
		secretmanager.CreateSecret(t, proj, "dev", "LOCKED", "locked-value", secretmanager.WithPath("/locked"))
		proj.NewRole(t, "group-deny", deny(allowWhere("secrets", map[string]any{"secretPath": "/locked"},
			"describeSecret", "readValue")))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		proj.GrantGroup(t, group, "group-deny")

		// Action
		locked := listSecrets(t, member, proj, "dev", "/locked", false)

		// Assert
		require.Equalf(t, http.StatusOK, locked.status, "listing /locked: %s", locked.body)
		require.NotContains(t, locked.values, "LOCKED")
		require.NotContains(t, string(locked.body), "locked-value")
		require.Equal(t, "open-value", listSecrets(t, member, proj, "dev", "/", false).values["OPEN"])
	})

	t.Run("should refuse the list when one role allows the legacy read and another denies readValue", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")
		proj.NewRole(t, "legacy-read", readAll)
		proj.NewRole(t, "no-values", deny(allow("secrets", "readValue")))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("legacy-read", "no-values"))

		// Action
		got := listSecrets(t, reader, proj, "dev", "/", false)

		// Assert
		require.Equalf(t, http.StatusForbidden, got.status, "listing: %s", got.body)
		require.NotContains(t, string(got.body), "plaintext")
	})
}
