package unlicensed_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestUnlicensedInstance_FolderAccess(t *testing.T) {
	h := harness.From(t)

	grant := func(t *testing.T, proj *fixture.Project, target *harness.Principal, body map[string]any) (int, string) {
		t.Helper()
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		res, err := proj.Tenant().Admin.API.CreateIdentityFolderAccessWithBodyWithResponse(t.Context(), proj.ID, target.ID,
			"application/json", bytes.NewReader(raw))
		require.NoError(t, err)
		return res.StatusCode(), string(res.Body)
	}

	t.Run("should grant folder access on the root folder, including its subfolders", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		status, body := grant(t, proj, pr, map[string]any{
			"environmentSlug": "dev", "secretPath": "/", "permission": "read", "isPermissionRecursive": true,
		})

		// Assert
		require.Equalf(t, http.StatusOK, status, "granting on /: %s", body)
		res, err := tn.Admin.API.ListIdentityFolderAccessWithResponse(t.Context(), proj.ID, pr.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "listing grants: %s", res.Body)
		var parsed struct {
			FolderAccess []struct {
				SecretPath            string `json:"secretPath"`
				IsPermissionRecursive bool   `json:"isPermissionRecursive"`
			} `json:"folderAccess"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &parsed))
		require.Len(t, parsed.FolderAccess, 1)
		require.Equal(t, "/", parsed.FolderAccess[0].SecretPath)
		require.True(t, parsed.FolderAccess[0].IsPermissionRecursive)
	})

	t.Run("should refuse folder access on a folder below the root folder", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		status, body := grant(t, proj, pr, map[string]any{
			"environmentSlug": "dev", "secretPath": "/app", "permission": "read",
		})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, body, "Without a license, folder access can only be granted on the root folder '/'.")
	})
}
