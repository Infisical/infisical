package auditlogs_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAuditLog_Filter(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return only the events of the requested project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mine := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, mine, "dev", "MINE", "v")
		secretmanager.CreateSecret(t, other, "dev", "OTHER", "v")
		waitForEvents(t, other, filter{EventType: new("create-secret")}, 1)

		// Action
		got := waitForEvents(t, mine, filter{EventType: new("create-secret")}, 1)

		// Assert
		require.Equal(t, []string{"MINE"}, keysOf(got))
	})

	t.Run("should return only the events matching the environment, path and key", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "A", "v")
		secretmanager.CreateSecret(t, proj, "dev", "A", "v", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "prod", "A", "v")
		secretmanager.CreateSecret(t, proj, "dev", "B", "v")
		waitForEvents(t, proj, filter{EventType: new("create-secret")}, 4)

		// Action
		inProd := events(t, proj, filter{EventType: new("create-secret"), Environment: new("prod")})
		inApp := events(t, proj, filter{EventType: new("create-secret"), Environment: new("dev"), SecretPath: new("/app")})
		namedB := events(t, proj, filter{EventType: new("create-secret"), SecretKey: new("B")})

		// Assert
		require.Len(t, inProd, 1)
		require.Equal(t, "prod", inProd[0].Metadata["environment"])
		require.Len(t, inApp, 1)
		require.Equal(t, "/app", inApp[0].Metadata["secretPath"])
		require.Equal(t, []string{"B"}, keysOf(namedB))
	})

	t.Run("should return only the events of the requested type", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "TOKEN", "second")
		waitForEvents(t, proj, filter{EventType: new("create-secret,update-secret")}, 2)

		// Action
		got := events(t, proj, filter{EventType: new("update-secret")})

		// Assert
		require.Len(t, got, 1)
		require.Equal(t, "update-secret", got[0].Type)
	})

	t.Run("should return only the events of the requested actor", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		bot := proj.NewMachineIdentity(t, fixture.WithRoles("admin"))
		secretmanager.CreateSecret(t, proj, "dev", "BY_ADMIN", "v")
		secretmanager.CreateSecret(t, proj, "dev", "BY_BOT", "v", secretmanager.As(bot))
		waitForEvents(t, proj, filter{EventType: new("create-secret")}, 2)

		// Action
		byBot := events(t, proj, filter{
			EventType: new("create-secret"),
			ActorType: new(api.ListOrganizationAuditLogsParamsActorTypeIdentity),
			Actor:     new(bot.ID.String()),
		})

		// Assert
		require.Equal(t, []string{"BY_BOT"}, keysOf(byBot))
	})
}
