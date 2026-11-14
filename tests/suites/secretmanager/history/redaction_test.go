package history_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestSecretVersion_Redact(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read a redacted version as empty with who and when, and keep later versions intact", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "third")
		first := versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 1)

		// Action
		res, err := tn.Admin.API.RedactSecretVersionValueWithResponse(t.Context(), first.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		versions := versionsOf(t, tn.Admin, secret.ID)
		redacted := versionNumber(t, versions, 1)
		require.True(t, redacted.IsRedacted)
		require.Equal(t, tn.Admin.Email, redacted.RedactedBy)
		require.True(t, redacted.RedactedAt)
		require.False(t, versionNumber(t, versions, 2).IsRedacted)
		require.Equal(t, "", versionValue(t, tn.Admin, secret.ID, "1"))
		require.Equal(t, "second", versionValue(t, tn.Admin, secret.ID, "2"))
		require.Equal(t, "third", secretmanager.GetSecret(t, proj, "dev", "DB_PASS").Value)
	})

	t.Run("should refuse redacting the latest version", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		latest := versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 2)

		// Action
		res, err := tn.Admin.API.RedactSecretVersionValueWithResponse(t.Context(), latest.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Cannot redact the latest version", apierr.Message(res.Body))
		require.False(t, versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 2).IsRedacted)
		require.Equal(t, "second", versionValue(t, tn.Admin, secret.ID, "2"))
	})

	t.Run("should refuse redacting a version twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		first := versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 1)
		res, err := tn.Admin.API.RedactSecretVersionValueWithResponse(t.Context(), first.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Action
		again, err := tn.Admin.API.RedactSecretVersionValueWithResponse(t.Context(), first.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, again.StatusCode(), again.Body)
		require.Equal(t, fmt.Sprintf("Secret version with ID '%s' is already redacted", first.ID), apierr.Message(again.Body))
		require.True(t, versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 1).IsRedacted)
	})

	t.Run("should refuse redacting without edit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		first := versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 1)

		// Action
		res, err := viewer.API.RedactSecretVersionValueWithResponse(t.Context(), first.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.False(t, versionNumber(t, versionsOf(t, tn.Admin, secret.ID), 1).IsRedacted)
		require.Equal(t, "first", versionValue(t, tn.Admin, secret.ID, "1"))
	})

	t.Run("should redact the replicated copy of a redacted source version", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		source := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "dev", Path: "/"}, secretmanager.Replicated())
		replicaID := replicatedSecretID(t, proj, "prod", "DB_PASS")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		first := versionNumber(t, versionsOf(t, tn.Admin, source.ID), 1)

		// Action
		res, err := tn.Admin.API.RedactSecretVersionValueWithResponse(t.Context(), first.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.True(t, versionNumber(t, versionsOf(t, tn.Admin, replicaID), 1).IsRedacted)
		require.Equal(t, "", versionValue(t, tn.Admin, replicaID, "1"))
	})

	t.Run("should refuse redacting another user's personal override", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		other := proj.NewUser(t, fixture.WithPrincipalName("other"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		override := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine-1", secretmanager.As(owner), secretmanager.WithPersonal())
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "mine-2", secretmanager.As(owner), secretmanager.WithPersonal())
		first := versionNumber(t, versionsOf(t, owner, override.ID), 1)

		// Action
		res, err := other.API.RedactSecretVersionValueWithResponse(t.Context(), first.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to access this secret", apierr.Message(res.Body))
		require.False(t, versionNumber(t, versionsOf(t, owner, override.ID), 1).IsRedacted)
		require.Equal(t, "mine-1", versionValue(t, owner, override.ID, "1"))
	})
}

// replicatedSecretID waits for a replication import to copy a secret into env and
// returns the copy's ID. Replication runs on a queue after the import is created.
func replicatedSecretID(t *testing.T, proj *fixture.Project, env, key string) string {
	t.Helper()
	var id string
	// One worker serves every tenant's replication jobs, so a run can queue behind others.
	wait.Until(t, fmt.Sprintf("%s to be replicated into %s", key, env), func() bool {
		res, err := proj.Tenant().Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId:      &proj.ID,
			Environment:    &env,
			IncludeImports: new(api.ListSecretsV4ParamsIncludeImportsTrue),
		})
		if err != nil || res.JSON200 == nil || res.JSON200.Imports == nil {
			return false
		}
		for _, imp := range *res.JSON200.Imports {
			for _, s := range imp.Secrets {
				if s.SecretKey == key {
					id = s.Id
					return true
				}
			}
		}
		return false
	}, wait.Timeout(60*time.Second))
	return id
}
