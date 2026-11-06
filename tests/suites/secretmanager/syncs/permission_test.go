package syncs_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Access(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse every operation on another tenant's sync and change nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), withName("victim"))
		outsider := h.NewTenant(t).Admin.API
		ctx := t.Context()

		// Action
		get, err := outsider.GetGitHubSecretSyncWithResponse(ctx, s.ID)
		require.NoError(t, err)
		trigger, err := outsider.SyncGitHubSecretSyncWithResponse(ctx, s.ID)
		require.NoError(t, err)
		update := s.update(t, outsider, map[string]any{"name": "taken-over"})
		del := s.delete(t, outsider, false)

		// Assert
		for op, res := range map[string]struct {
			status int
			body   []byte
		}{
			"get":     {get.StatusCode(), get.Body},
			"trigger": {trigger.StatusCode(), trigger.Body},
			"update":  {update.StatusCode(), update.Body},
			"delete":  {del.StatusCode(), del.Body},
		} {
			require.NotEqualf(t, http.StatusOK, res.status, "%s on another tenant's sync was accepted", op)
			require.NotContainsf(t, string(res.body), "victim", "%s revealed the sync's name", op)
		}
		got := s.get(t).JSON200.SecretSync
		require.Equal(t, "victim", got.Name)
		require.Nil(t, got.SyncStatus, "a sync was queued")
	})

	t.Run("should refuse a sync id on another destination's route and queue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		admin := proj.Tenant().Admin.API

		// Action
		get, err := admin.GetAwsParameterStoreSecretSyncWithResponse(t.Context(), s.ID)
		require.NoError(t, err)
		trigger, err := admin.SyncAwsParameterStoreSecretSyncWithResponse(t.Context(), s.ID)
		require.NoError(t, err)

		// Assert
		want := fmt.Sprintf(`Secret sync with ID "%s" is not configured for AWS Parameter Store`, s.ID)
		require.Equal(t, http.StatusBadRequest, get.StatusCode())
		require.Equal(t, want, message(get.Body))
		require.Equal(t, http.StatusBadRequest, trigger.StatusCode())
		require.Equal(t, want, message(trigger.Body))
		require.Nil(t, s.get(t).JSON200.SecretSync.SyncStatus, "the sync was queued through the wrong route")
	})

	t.Run("should let a viewer read and list syncs", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), withName("visible"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.GetGitHubSecretSyncWithResponse(t.Context(), s.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "a viewer reading a sync got %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "visible", res.JSON200.SecretSync.Name)
		require.Equal(t, []string{"visible"}, listSyncNames(t, viewer.API, proj))
	})

	t.Run("should refuse a viewer's create, update, trigger and delete and change nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), withName("guarded"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		create := createSync(t, proj, conn, repoScope("acme", "other"), as(viewer))
		update := s.update(t, viewer.API, map[string]any{"name": "renamed"})
		trigger, err := viewer.API.SyncGitHubSecretSyncWithResponse(t.Context(), s.ID)
		require.NoError(t, err)
		del := s.delete(t, viewer.API, false)

		// Assert
		require.Equal(t, http.StatusForbidden, create.StatusCode())
		require.Equal(t, http.StatusForbidden, update.StatusCode())
		require.Equal(t, http.StatusForbidden, trigger.StatusCode())
		require.Equal(t, http.StatusForbidden, del.StatusCode())
		got := s.get(t).JSON200.SecretSync
		require.Equal(t, "guarded", got.Name)
		require.Nil(t, got.SyncStatus, "a sync was queued")
		require.Equal(t, []string{"guarded"}, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should refuse and create nothing when the role allows a different connection", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		allowed := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		other := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		creator := connectionScopedCreator(t, proj, allowed)

		// Action
		res := createSync(t, proj, other, repoScope("acme", "app"), as(creator))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating returned %s", apierr.Body(res.Body))
		require.Empty(t, listSyncNames(t, tn.Admin.API, proj))
	})

	t.Run("should accept a create when the connection is the one the role allows", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		allowed := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		creator := connectionScopedCreator(t, proj, allowed)

		// Action
		res := createSync(t, proj, allowed, repoScope("acme", "app"), as(creator), withName("scoped"))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", apierr.Body(res.Body))
		require.Equal(t, []string{"scoped"}, listSyncNames(t, tn.Admin.API, proj))
	})

	t.Run("should list only the syncs whose source path the role allows", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/a")
		secretmanager.CreateFolder(t, proj, "dev", "/b")
		newSync(t, proj, conn, repoScope("acme", "a"), fromPath("/a"), withName("on-a"))
		hidden := newSync(t, proj, conn, repoScope("acme", "b"), fromPath("/b"), withName("on-b"))
		proj.NewRole(t, "a-sync-reader", fixture.Permission{Subject: "secret-syncs", Action: []string{"read"},
			Conditions: map[string]any{"secretPath": map[string]any{"$eq": "/a"}}})
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("a-sync-reader"))

		// Action
		names := listSyncNames(t, reader.API, proj)

		// Assert
		require.Equal(t, []string{"on-a"}, names)
		res, err := reader.API.GetGitHubSecretSyncWithResponse(t.Context(), hidden.ID)
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
	})

	t.Run("should refuse deleting a connection a sync uses and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		admin := proj.Tenant().Admin.API

		// Action
		res, err := admin.DeleteGitHubAppConnectionWithResponse(t.Context(), conn.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Cannot delete App Connection with existing connections. Remove all existing connections and try again.",
			message(res.Body))
		still, err := admin.GetGitHubAppConnectionWithResponse(t.Context(), conn.ID)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, still.StatusCode(), "the connection is gone")
		require.Equal(t, conn.ID, s.get(t).JSON200.SecretSync.ConnectionId)
	})
}

// connectionScopedCreator is a project member whose role creates syncs only over one
// connection. An organization member, because using an organization connection is an
// organization permission the project role cannot grant.
func connectionScopedCreator(tt *testing.T, p *fixture.Project, conn *fixture.AppConnection) *harness.Principal {
	tt.Helper()
	p.NewRole(tt, "one-connection-sync-creator",
		fixture.Permission{Subject: "secret-syncs", Action: []string{"read", "create"},
			Conditions: map[string]any{"connectionId": map[string]any{"$eq": conn.ID.String()}}},
		fixture.Permission{Subject: "secrets", Action: []string{"describeSecret", "readValue"}})
	creator := p.Tenant().NewMachineIdentity(tt, harness.OrgRole("member"))
	p.Grant(tt, creator, "one-connection-sync-creator")
	return creator
}
