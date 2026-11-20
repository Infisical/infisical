package permissions_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestRole_IdentityTemplating(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should scope a machine identity by its metadata in the secret path", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		for _, team := range []string{"backend", "frontend"} {
			secretmanager.CreateFolder(t, proj, "dev", "/"+team)
			secretmanager.CreateSecret(t, proj, "dev", "KEY", team, secretmanager.WithPath("/"+team))
		}
		proj.NewRole(t, "own-team", allowWhere("secrets",
			map[string]any{"secretPath": "/{{identity.metadata.team}}"}, "read"))
		identity := tn.NewMachineIdentity(t)
		setIdentityMetadata(t, tn, identity, "team", "backend")
		proj.Grant(t, identity, "own-team")

		// Action
		own := listSecrets(t, identity, proj, "dev", "/backend", false)
		other := listSecrets(t, identity, proj, "dev", "/frontend", false)

		// Assert
		require.Equalf(t, http.StatusOK, own.status, "listing its own team's folder: %s", own.body)
		require.Equal(t, map[string]string{"KEY": "backend"}, own.values)
		require.Equalf(t, http.StatusOK, other.status, "listing another team's folder: %s", other.body)
		require.NotContains(t, other.values, "KEY")
	})

	t.Run("should refuse a role whose template uses a non-identity expression or an unknown helper", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		templates := map[string]string{
			"non-identity":   "/{{user.id}}",
			"unknown-helper": "/{{lookup identity.metadata.team}}",
		}

		// Action
		statuses, messages := map[string]int{}, map[string]string{}
		for slug, template := range templates {
			res := createRole(t, proj.Tenant().Admin, proj, slug, allowWhere("secrets", map[string]any{"secretPath": template}, "read"))
			statuses[slug] = res.StatusCode()
			if res.JSON400 != nil {
				messages[slug] = res.JSON400.Message
			}
		}

		// Assert
		require.Equal(t, map[string]int{"non-identity": http.StatusBadRequest, "unknown-helper": http.StatusBadRequest}, statuses)
		require.Equal(t, map[string]string{
			"non-identity":   "Template sanitization failed: Role Creation",
			"unknown-helper": "Template sanitization failed: Role Creation",
		}, messages)
		slugs := roleSlugs(t, proj.Tenant().Admin, proj.ID)
		require.NotContains(t, slugs, "non-identity")
		require.NotContains(t, slugs, "unknown-helper")
	})
}

func setIdentityMetadata(t *testing.T, tn *harness.Tenant, identity *harness.Principal, key, value string) {
	t.Helper()
	metadata := []struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}{{Key: key, Value: value}}
	res, err := tn.Admin.API.UpdateMachineIdentityWithResponse(t.Context(), identity.ID.String(),
		api.UpdateMachineIdentityJSONRequestBody{Metadata: &metadata})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "setting %s's metadata: %s", identity.Name, apierr.Body(res.Body))
}

func roleSlugs(t *testing.T, pr *harness.Principal, projectID string) []string {
	t.Helper()
	res, err := pr.API.ListProjectRolesWithResponse(t.Context(), projectID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing roles returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	slugs := []string{}
	for _, role := range res.JSON200.Roles {
		slugs = append(slugs, role.Slug)
	}
	return slugs
}
