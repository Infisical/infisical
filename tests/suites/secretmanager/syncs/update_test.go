package syncs_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Update(t *testing.T) {
	t.Parallel()

	t.Run("should refuse and keep the old name when a sync is renamed to a name another sync holds", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		newSync(t, proj, conn, repoScope("acme", "app"), withName("alpha"))
		beta := newSync(t, proj, conn, repoScope("acme", "other"), withName("beta"))

		// Action
		res := beta.update(t, proj.Tenant().Admin.API, map[string]any{"name": "alpha"})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`A Secret Sync with the name "alpha" already exists for the project with ID "%s"`, proj.ID),
			message(res.Body))
		require.Equal(t, "beta", beta.get(t).JSON200.SecretSync.Name)
	})

	t.Run("should refuse and keep the source when the new source folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		// Action
		res := s.update(t, proj.Tenant().Admin.API, map[string]any{"secretPath": "/missing"})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, message(res.Body), `Could not find folder with path "/missing" in environment "dev"`)
		require.Equal(t, "/", s.get(t).JSON200.SecretSync.Folder.Path)
	})

	t.Run("should refuse and keep the source when the actor may not edit syncs at the new path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/a")
		secretmanager.CreateFolder(t, proj, "dev", "/b")
		proj.NewRole(t, "a-sync-editor",
			fixture.Permission{Subject: "secret-syncs", Action: []string{"read", "edit"},
				Conditions: map[string]any{"secretPath": map[string]any{"$eq": "/a"}}},
			fixture.Permission{Subject: "secrets", Action: []string{"describeSecret", "readValue"}})
		editor := proj.NewMachineIdentity(t, fixture.WithRoles("a-sync-editor"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/a"))

		// Action
		res := s.update(t, editor.API, map[string]any{"secretPath": "/b"})

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "moving the source returned %s", apierr.Body(res.Body))
		require.Equal(t, "/a", s.get(t).JSON200.SecretSync.Folder.Path)
	})

	t.Run("should report pending and push the source when auto-sync is turned on", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "dev", "PRESENT", "1")
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		// Action
		res := s.update(t, proj.Tenant().Admin.API, map[string]any{"isAutoSyncEnabled": true})

		// Assert
		require.NotNilf(t, res.JSON200, "turning auto-sync on returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotNil(t, res.JSON200.SecretSync.SyncStatus)
		require.Equal(t, "pending", *res.JSON200.SecretSync.SyncStatus)
		gh.ExpectEvent[github.SecretCreated](t, created("PRESENT"), syncBudget)
		require.Equal(t, "1", gh.Repo(t, "acme/app").Secrets["PRESENT"].Value)
	})
}
