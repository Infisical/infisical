package history_test

import (
	"encoding/json"
	"fmt"
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

func TestSecretVersion_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the version list naming the commits permission when the role has secret read but no commits read", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "hunter2")
		proj.NewRole(t, "secret-reader", fixture.Permission{Subject: "secrets", Action: []string{"read"}})
		reader := proj.NewUser(t, fixture.WithPrincipalName("reader"), fixture.WithRoles("secret-reader"))

		// Action
		dashboard, err := reader.API.ListSecretVersionsWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsParams{Offset: 0, Limit: 10})
		require.NoError(t, err)
		byID, err := reader.API.ListSecretVersionsByIdWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 10})
		require.NoError(t, err)

		// Assert
		for _, res := range []struct {
			status int
			body   []byte
		}{{dashboard.StatusCode(), dashboard.Body}, {byID.StatusCode(), byID.Body}} {
			requireStatus(t, http.StatusForbidden, res.status, res.body)
			require.Equal(t, "You do not have permission to read secret versions", apierr.Message(res.body))
			require.NotContains(t, string(res.body), "hunter2")
		}
	})

	t.Run("should hide version values without read-value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "hunter2")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "hunter3")
		proj.NewRole(t, "describer",
			fixture.Permission{Subject: "secrets", Action: []string{"describeSecret"}},
			fixture.Permission{Subject: "commits", Action: []string{"read"}})
		describer := proj.NewUser(t, fixture.WithPrincipalName("describer"), fixture.WithRoles("describer"))

		// Action
		res, err := describer.API.ListSecretVersionsByIdWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 10})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing versions returned %d: %s", res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.SecretVersions, 2)
		for _, v := range res.JSON200.SecretVersions {
			require.True(t, v.SecretValueHidden)
			require.Equal(t, "<hidden-by-infisical>", v.SecretValue)
		}
		require.Equal(t, "<hidden-by-infisical>", versionValue(t, describer, secret.ID, "1"))
	})

	t.Run("should list versions newest first, with a limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "third")

		// Action
		res, err := tn.Admin.API.ListSecretVersionsByIdWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 2})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing versions returned %d: %s", res.StatusCode(), res.Body)
		got := map[float32]string{}
		order := []float32{}
		for _, v := range res.JSON200.SecretVersions {
			got[v.Version] = v.SecretValue
			order = append(order, v.Version)
		}
		require.Equal(t, []float32{3, 2}, order)
		require.Equal(t, map[float32]string{3: "third", 2: "second"}, got)
	})
}

func TestSecretVersion_TagConditions(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the current value and the tagged version to a role denied the tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, reader := sensitiveHistory(t, h.NewTenant(t))

		// Action
		current := readVersion(t, reader, proj, nil)
		tagged := readVersion(t, reader, proj, new(float32(2)))

		// Assert
		requireStatus(t, http.StatusForbidden, current.StatusCode(), current.Body)
		requireStatus(t, http.StatusForbidden, tagged.StatusCode(), tagged.Body)
	})

	t.Run("should refuse a version written without tags after the secret was tagged", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, reader := sensitiveHistory(t, h.NewTenant(t))

		// Action
		res := readVersion(t, reader, proj, new(float32(3)))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotContains(t, string(res.Body), "second")
	})

	t.Run("should refuse a version written before the secret was tagged", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, reader := sensitiveHistory(t, h.NewTenant(t))

		// Action
		res := readVersion(t, reader, proj, new(float32(1)))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotContains(t, string(res.Body), "first")
	})

	t.Run("should hide every version's value in the version lists when the role is denied the tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		_, secretID, reader := sensitiveHistory(t, h.NewTenant(t))

		// Action
		dashboard, err := reader.API.ListSecretVersionsWithResponse(t.Context(), secretID, &api.ListSecretVersionsParams{Offset: 0, Limit: 10})
		require.NoError(t, err)
		byID, err := reader.API.ListSecretVersionsByIdWithResponse(t.Context(), secretID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 10})
		require.NoError(t, err)

		// Assert
		require.NotNilf(t, dashboard.JSON200, "dashboard list returned %d: %s", dashboard.StatusCode(), dashboard.Body)
		require.NotNilf(t, byID.JSON200, "list by ID returned %d: %s", byID.StatusCode(), byID.Body)
		hidden := map[string]bool{}
		for _, v := range dashboard.JSON200.SecretVersions {
			hidden[fmt.Sprintf("dashboard v%v", v.Version)] = v.SecretValueHidden
		}
		for _, v := range byID.JSON200.SecretVersions {
			hidden[fmt.Sprintf("by ID v%v", v.Version)] = v.SecretValueHidden && v.SecretValue == "<hidden-by-infisical>"
		}
		require.Equal(t, map[string]bool{
			"dashboard v1": true, "dashboard v2": true, "dashboard v3": true,
			"by ID v1": true, "by ID v2": true, "by ID v3": true,
		}, hidden)
	})

	t.Run("should hide each version's value from the version value route when the role is denied the tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		_, secretID, reader := sensitiveHistory(t, h.NewTenant(t))

		// Action
		values := map[string]string{}
		for _, n := range []string{"1", "2", "3"} {
			values[n] = versionValue(t, reader, secretID, n)
		}

		// Assert
		require.Equal(t, map[string]string{
			"1": "<hidden-by-infisical>", "2": "<hidden-by-infisical>", "3": "<hidden-by-infisical>",
		}, values)
	})

	t.Run("should hide every version's value in commit changes when the role is denied the tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, reader := sensitiveHistory(t, h.NewTenant(t))

		// Action
		versions := commitChangeVersions(t, reader, proj)

		// Assert
		values := map[string]bool{}
		for _, v := range versions {
			values[v.SecretValue] = true
		}
		require.Equal(t, map[string]bool{"<hidden-by-infisical>": true}, values)
	})

	t.Run("should hide a deleted secret's tagged version in commit changes when the role is denied the tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, reader := sensitiveHistory(t, h.NewTenant(t))
		secretmanager.DeleteSecret(t, proj, "dev", "DB_PASS")

		// Action
		versions := commitChangeVersions(t, reader, proj)

		// Assert
		values := map[string]bool{}
		for _, v := range versions {
			if slices.Contains(v.Tags, "sensitive") {
				values[v.SecretValue] = true
			}
		}
		require.Equal(t, map[string]bool{"<hidden-by-infisical>": true}, values)
	})

	t.Run("should refuse an untagged version's value to a role that can describe the secret but not read its value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, _ := sensitiveHistory(t, h.NewTenant(t))
		proj.NewRole(t, "no-sensitive-values",
			fixture.Permission{Subject: "secrets", Action: []string{"describeSecret", "readValue"}},
			fixture.Permission{Subject: "secrets", Action: []string{"readValue"}, Inverted: true,
				Conditions: map[string]any{"secretTags": map[string]any{"$in": []string{"sensitive"}}}})
		describer := proj.NewUser(t, fixture.WithPrincipalName("describer"), fixture.WithRoles("no-sensitive-values"))

		// Action
		res := readVersion(t, describer, proj, new(float32(3)))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You do not have permission to view secret value on secret with name 'DB_PASS'", apierr.Message(res.Body))
	})

	t.Run("should refuse a version read by its old name when the secret's current name and tags are denied", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sensitive := secretmanager.CreateTag(t, proj, "sensitive")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		renaming, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "DB_PASS", api.UpdateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/"), NewSecretName: new("PROD_DB_PASS"), TagIds: &[]string{sensitive},
		})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, renaming.StatusCode(), renaming.Body)
		proj.NewRole(t, "no-sensitive-prod",
			fixture.Permission{Subject: "secrets", Action: []string{"read"}},
			fixture.Permission{Subject: "secrets", Action: []string{"read"}, Inverted: true, Conditions: map[string]any{
				"secretName": "PROD_DB_PASS", "secretTags": map[string]any{"$in": []string{"sensitive"}}}})
		reader := proj.NewUser(t, fixture.WithPrincipalName("reader"), fixture.WithRoles("no-sensitive-prod"))

		// Action
		res := readVersion(t, reader, proj, new(float32(1)))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotContains(t, string(res.Body), "first")
	})
}

// sensitiveHistory gives DB_PASS three versions: 1 ("first") from before the sensitive tag, 2
// ("first") from adding the tag, and 3 ("second") from a value update that sent no tags. The reader
// can read secrets and their history, except secrets tagged sensitive.
func sensitiveHistory(t *testing.T, tn *harness.Tenant) (*fixture.Project, string, *harness.Principal) {
	t.Helper()
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	sensitive := secretmanager.CreateTag(t, proj, "sensitive")
	secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
	tagging, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "DB_PASS", api.UpdateSecretV4JSONRequestBody{
		ProjectId: proj.ID, Environment: "dev", SecretPath: new("/"), TagIds: &[]string{sensitive},
	})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, tagging.StatusCode(), tagging.Body)
	require.Equal(t, float32(3), secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second").Version)
	proj.NewRole(t, "no-sensitive",
		fixture.Permission{Subject: "secrets", Action: []string{"read"}},
		fixture.Permission{Subject: "commits", Action: []string{"read"}},
		fixture.Permission{Subject: "secrets", Action: []string{"read"}, Inverted: true,
			Conditions: map[string]any{"secretTags": map[string]any{"$in": []string{"sensitive"}}}})
	reader := proj.NewUser(t, fixture.WithPrincipalName("reader"), fixture.WithRoles("no-sensitive"))
	return proj, secret.ID, reader
}

// readVersion reads DB_PASS with its value, at the given version or the current one when nil.
func readVersion(t *testing.T, pr *harness.Principal, proj *fixture.Project, version *float32) *api.GetSecretByNameV4Response {
	t.Helper()
	res, err := pr.API.GetSecretByNameV4WithResponse(t.Context(), "DB_PASS", &api.GetSecretByNameV4Params{
		ProjectId:       proj.ID,
		Environment:     new("dev"),
		SecretPath:      new("/"),
		Version:         version,
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValueTrue),
	})
	require.NoError(t, err)
	return res
}

type changeVersion struct {
	SecretKey   string   `json:"secretKey"`
	SecretValue string   `json:"secretValue"`
	Tags        []string `json:"tags"`
}

// commitChangeVersions reads the changes of every commit at dev:/ and returns the secret versions they show.
func commitChangeVersions(t *testing.T, pr *harness.Principal, proj *fixture.Project) []changeVersion {
	t.Helper()
	var versions []changeVersion
	for _, c := range commitsAt(t, pr, proj, "dev", "/") {
		res, err := pr.API.GetFolderCommitChangesWithResponse(t.Context(), c.ID, &api.GetFolderCommitChangesParams{ProjectId: proj.ID})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		var body struct {
			Changes struct {
				Changes []struct {
					Versions []changeVersion `json:"versions"`
				} `json:"changes"`
			} `json:"changes"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &body))
		for _, change := range body.Changes.Changes {
			for _, v := range change.Versions {
				if v.SecretKey != "" {
					versions = append(versions, v)
				}
			}
		}
	}
	require.NotEmpty(t, versions)
	return versions
}
