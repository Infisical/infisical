package auditlogs_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestAuditLog_SecretEvents(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record create, read, update and delete with the environment, path, key and version", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "first")
		secretmanager.GetSecret(t, proj, "dev", "DB_URL")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_URL", "second")
		secretmanager.DeleteSecret(t, proj, "dev", "DB_URL")

		// Assert
		got := byType(waitForEvents(t, proj, filter{EventType: new("create-secret,get-secret,update-secret,delete-secret")}, 4))
		wantVersion := map[string]float64{"create-secret": 1, "get-secret": 1, "update-secret": 2, "delete-secret": 2}
		for eventType, version := range wantVersion {
			e, ok := got[eventType]
			require.Truef(t, ok, "no %s event in %+v", eventType, got)
			require.Equal(t, "user", e.ActorType, eventType)
			require.Equal(t, tn.Admin.ID.String(), e.Actor["userId"], eventType)
			require.Equal(t, "dev", e.Metadata["environment"], eventType)
			require.Equal(t, "/", e.Metadata["secretPath"], eventType)
			require.Equal(t, "DB_URL", e.Metadata["secretKey"], eventType)
			require.Equal(t, version, e.Metadata["secretVersion"], eventType)
		}
	})

	t.Run("should name the machine identity as the actor when an identity writes a secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		bot := proj.NewMachineIdentity(t, fixture.WithRoles("admin"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "value", secretmanager.As(bot))

		// Assert
		got := waitForEvents(t, proj, filter{EventType: new("create-secret")}, 1)
		require.Len(t, got, 1)
		require.Equal(t, "identity", got[0].ActorType)
		require.Equal(t, bot.ID.String(), got[0].Actor["identityId"])
		require.Equal(t, bot.Name, got[0].Actor["name"])
	})

	t.Run("should record a batch create as one event listing every secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "A", "a"
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "B", "b"

		// Action
		res, err := tn.Admin.API.CreateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch create: %s", apierr.Body(res.Body))
		got := waitForEvents(t, proj, filter{EventType: new("create-secrets")}, 1)
		require.Len(t, got, 1)
		secrets, ok := got[0].Metadata["secrets"].([]any)
		require.Truef(t, ok, "metadata has no secrets list: %+v", got[0].Metadata)
		keys := make([]string, 0, len(secrets))
		for _, s := range secrets {
			keys = append(keys, s.(map[string]any)["secretKey"].(string))
		}
		require.ElementsMatch(t, []string{"A", "B"}, keys)
		require.Empty(t, events(t, proj, filter{EventType: new("create-secret")}))
	})
}
