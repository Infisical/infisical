package permissions_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestRole_Conditions(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// pathReader seeds one secret per path in dev and an identity whose role reads secrets
	// under the condition.
	pathReader := func(t *testing.T, condition map[string]any, paths ...string) (*fixture.Project, *harness.Principal) {
		t.Helper()
		proj := newProject(t, h.NewTenant(t))
		for _, p := range paths {
			if p != "/" {
				secretmanager.CreateFolder(t, proj, "dev", p)
			}
			secretmanager.CreateSecret(t, proj, "dev", "KEY", "v", secretmanager.WithPath(p))
		}
		proj.NewRole(t, "conditional", allowWhere("secrets", condition, "read"))
		return proj, proj.NewMachineIdentity(t, fixture.WithRoles("conditional"))
	}

	// readableAt is the paths whose list the reader is allowed.
	readableAt := func(t *testing.T, reader *harness.Principal, proj *fixture.Project, paths ...string) []string {
		t.Helper()
		allowed := []string{}
		for _, p := range paths {
			got := listSecrets(t, reader, proj, "dev", p, false)
			if got.status == http.StatusOK && got.values["KEY"] == "v" {
				allowed = append(allowed, p)
			}
		}
		return allowed
	}

	t.Run("should allow only the exact path when secretPath is a plain string", func(t *testing.T) {
		t.Parallel()

		// Setup
		paths := []string{"/", "/a", "/a/b"}
		proj, reader := pathReader(t, map[string]any{"secretPath": "/a"}, paths...)

		// Action
		allowed := readableAt(t, reader, proj, paths...)

		// Assert
		require.Equal(t, []string{"/a"}, allowed)
	})

	t.Run("should allow the folder itself and every descendant for a recursive glob", func(t *testing.T) {
		t.Parallel()

		// Setup
		paths := []string{"/", "/a", "/a/b", "/a/b/c", "/ab"}
		proj, reader := pathReader(t, map[string]any{"secretPath": map[string]any{"$glob": "/a/**"}}, paths...)

		// Action
		allowed := readableAt(t, reader, proj, paths...)

		// Assert
		require.Equal(t, []string{"/a", "/a/b", "/a/b/c"}, allowed)
	})

	t.Run("should allow only direct children for a single-level glob", func(t *testing.T) {
		t.Parallel()

		// Setup
		paths := []string{"/a", "/a/b", "/a/b/c"}
		proj, reader := pathReader(t, map[string]any{"secretPath": map[string]any{"$glob": "/a/*"}}, paths...)

		// Action
		allowed := readableAt(t, reader, proj, paths...)

		// Assert
		require.Equal(t, []string{"/a/b"}, allowed)
	})

	t.Run("should allow only the listed paths for $in", func(t *testing.T) {
		t.Parallel()

		// Setup
		paths := []string{"/a", "/b", "/c"}
		proj, reader := pathReader(t, map[string]any{"secretPath": map[string]any{"$in": []string{"/a", "/c"}}}, paths...)

		// Action
		allowed := readableAt(t, reader, proj, paths...)

		// Assert
		require.Equal(t, []string{"/a", "/c"}, allowed)
	})

	t.Run("should allow every path but the excluded one for $ne", func(t *testing.T) {
		t.Parallel()

		// Setup
		paths := []string{"/a", "/b", "/c"}
		proj, reader := pathReader(t, map[string]any{"secretPath": map[string]any{"$ne": "/b"}}, paths...)

		// Action
		allowed := readableAt(t, reader, proj, paths...)

		// Assert
		require.Equal(t, []string{"/a", "/c"}, allowed)
	})

	t.Run("should allow only the matching environments for environment $in and $glob", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		for _, env := range []string{"dev", "staging", "prod"} {
			secretmanager.CreateSecret(t, proj, env, "KEY", env)
		}
		proj.NewRole(t, "env-in", allowWhere("secrets", map[string]any{
			"environment": map[string]any{"$in": []string{"dev", "prod"}}}, "read"))
		proj.NewRole(t, "env-glob", allowWhere("secrets", map[string]any{
			"environment": map[string]any{"$glob": "st*"}}, "read"))
		byIn := proj.NewMachineIdentity(t, fixture.WithRoles("env-in"))
		byGlob := proj.NewMachineIdentity(t, fixture.WithRoles("env-glob"))

		readable := func(pr *harness.Principal) []string {
			envs := []string{}
			for _, env := range []string{"dev", "staging", "prod"} {
				if listSecrets(t, pr, proj, env, "/", false).values["KEY"] == env {
					envs = append(envs, env)
				}
			}
			return envs
		}

		// Action
		inEnvs, globEnvs := readable(byIn), readable(byGlob)

		// Assert
		require.Equal(t, []string{"dev", "prod"}, inEnvs)
		require.Equal(t, []string{"staging"}, globEnvs)
	})

	t.Run("should list only the names matching a secretName glob", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		for _, name := range []string{"DB_HOST", "DB_PASS", "API_KEY"} {
			secretmanager.CreateSecret(t, proj, "dev", name, "v")
		}
		proj.NewRole(t, "db-reader", allowWhere("secrets", map[string]any{
			"secretName": map[string]any{"$glob": "DB_*"}}, "read"))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("db-reader"))

		// Action
		got := listSecrets(t, reader, proj, "dev", "/", false)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing: %s", got.body)
		require.ElementsMatch(t, []string{"DB_HOST", "DB_PASS"}, keysOf(got.values))
	})

	t.Run("should require every listed tag for $all and any of them for $in", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		red, blue := secretmanager.CreateTag(t, proj, "red"), secretmanager.CreateTag(t, proj, "blue")
		tagged(t, proj, "RED_ONLY", red)
		tagged(t, proj, "BOTH", red, blue)
		proj.NewRole(t, "all-tags", allowWhere("secrets", map[string]any{
			"secretTags": map[string]any{"$all": []string{"red", "blue"}}}, "read"))
		proj.NewRole(t, "any-tag", allowWhere("secrets", map[string]any{
			"secretTags": map[string]any{"$in": []string{"red", "blue"}}}, "read"))
		needsAll := proj.NewMachineIdentity(t, fixture.WithRoles("all-tags"))
		needsAny := proj.NewMachineIdentity(t, fixture.WithRoles("any-tag"))

		// Action
		withAll := listSecrets(t, needsAll, proj, "dev", "/", false)
		withAny := listSecrets(t, needsAny, proj, "dev", "/", false)

		// Assert
		require.ElementsMatch(t, []string{"BOTH"}, keysOf(withAll.values))
		require.ElementsMatch(t, []string{"RED_ONLY", "BOTH"}, keysOf(withAny.values))
	})
}

func tagged(t *testing.T, proj *fixture.Project, name string, tagIDs ...string) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateSecretV4WithResponse(t.Context(), name,
		api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "v", TagIds: &tagIDs})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating %s: %s", name, res.Body)
}
