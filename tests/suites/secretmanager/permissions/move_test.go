package permissions_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRole_MoveAndDuplicate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	everything := allow("secrets", "describeSecret", "readValue", "create", "edit", "delete")

	t.Run("should refuse a move and move nothing for each missing grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		missing := map[string]fixture.Permission{
			"create at the destination":    deny(allowWhere("secrets", map[string]any{"environment": "prod"}, "create")),
			"edit at the destination":      deny(allowWhere("secrets", map[string]any{"environment": "prod"}, "edit")),
			"delete at the source":         deny(allowWhere("secrets", map[string]any{"environment": "dev"}, "delete")),
			"read-value at the source":     deny(allowWhere("secrets", map[string]any{"environment": "dev"}, "readValue")),
			"describe at the source":       deny(allowWhere("secrets", map[string]any{"environment": "dev"}, "describeSecret")),
			"control: every grant present": allow("secrets", "describeSecret"),
		}
		type attempt struct {
			proj    *fixture.Project
			secret  secretmanager.Secret
			movedBy *harness.Principal
		}
		attempts := map[string]attempt{}
		for name, rule := range missing {
			proj := newProject(t, tn)
			secret := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
			proj.NewRole(t, "mover", everything, rule)
			attempts[name] = attempt{proj: proj, secret: secret, movedBy: proj.NewMachineIdentity(t, fixture.WithRoles("mover"))}
		}

		// Action
		statuses := map[string]int{}
		for name, a := range attempts {
			res, err := a.movedBy.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
				ProjectId:              a.proj.ID,
				SourceEnvironment:      "dev",
				DestinationEnvironment: "prod",
				SecretIds:              []string{a.secret.ID},
			})
			require.NoError(t, err)
			statuses[name] = res.StatusCode()
		}

		// Assert
		for name, a := range attempts {
			if name == "control: every grant present" {
				require.Equal(t, http.StatusOK, statuses[name], name)
				continue
			}
			require.Equal(t, http.StatusForbidden, statuses[name], "missing %s", name)
			require.Equal(t, map[string]string{"API_KEY": "value"}, secretsAt(t, a.proj, "dev", "/"), "missing %s", name)
			require.Empty(t, secretsAt(t, a.proj, "prod", "/"), "missing %s", name)
		}
	})

	t.Run("should refuse a duplicate into an environment the actor cannot write", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		source := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		proj.NewRole(t, "dev-writer",
			allowWhere("secrets", map[string]any{"environment": "dev"}, "describeSecret", "readValue", "create", "edit"),
			allowWhere("secrets", map[string]any{"environment": "prod"}, "describeSecret", "readValue"))
		writer := proj.NewMachineIdentity(t, fixture.WithRoles("dev-writer"))

		// Action
		res, err := writer.API.DuplicateSecretV4WithResponse(t.Context(), api.DuplicateSecretV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []uuid.UUID{uuid.MustParse(source.ID)},
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "duplicating: %s", res.Body)
		require.Empty(t, secretsAt(t, proj, "prod", "/"))
	})
}
