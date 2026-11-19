package folderaccess_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// grantRecursive gives member a tier on a folder and every folder below it, as the
// administrator.
func grantRecursive(t *testing.T, proj *fixture.Project, member *harness.Principal, secretPath string, tier secretmanager.FolderTier) grant {
	t.Helper()
	res := grantAs(t, proj.Tenant().Admin, proj, member, at(secretPath), tier, map[string]any{"isPermissionRecursive": true})
	require.Equalf(t, http.StatusOK, res.status, "granting %s on %s and its subfolders: %s", tier, secretPath, res.body)
	return res.grant
}

func TestFolderAccess_NestedRecursive(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, k := range kinds {
		t.Run(fmt.Sprintf("should give a %s access to a folder's subtree and nothing outside it when access on that folder applies to subfolders", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/apps/payments")
			secretmanager.CreateFolder(t, proj, "dev", "/infra")
			secretmanager.CreateSecret(t, proj, "dev", "ROOT_KEY", "root")
			secretmanager.CreateSecret(t, proj, "dev", "APPS_KEY", "apps", secretmanager.WithPath("/apps"))
			secretmanager.CreateSecret(t, proj, "dev", "PAYMENTS_KEY", "payments", secretmanager.WithPath("/apps/payments"))
			secretmanager.CreateSecret(t, proj, "dev", "INFRA_KEY", "infra", secretmanager.WithPath("/infra"))
			member := k.member(t, proj, "no-access")
			grantRecursive(t, proj, member, "/apps", secretmanager.FolderRead)

			// Action
			apps := listSecrets(t, member, proj, "/apps", false)
			payments := listSecrets(t, member, proj, "/apps/payments", false)
			root := listSecrets(t, member, proj, "/", false)
			infra := listSecrets(t, member, proj, "/infra", false)

			// Assert
			require.Equal(t, map[string]string{"APPS_KEY": "apps"}, apps.values)
			require.Equal(t, map[string]string{"PAYMENTS_KEY": "payments"}, payments.values)
			require.Emptyf(t, root.values, "listing /: %s", root.body)
			require.Emptyf(t, infra.values, "listing /infra: %s", infra.body)
		})

		t.Run(fmt.Sprintf("should let the deepest access that applies to subfolders decide what a %s can do in each folder", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/apps/payments/keys")
			secretmanager.CreateFolder(t, proj, "dev", "/apps/web")
			secretmanager.CreateSecret(t, proj, "dev", "CARD_KEY", "card", secretmanager.WithPath("/apps/payments/keys"))
			member := k.member(t, proj, "no-access")
			grantRecursive(t, proj, member, "/", secretmanager.FolderRead)
			grantRecursive(t, proj, member, "/apps", secretmanager.FolderEdit)
			grantRecursive(t, proj, member, "/apps/payments", secretmanager.FolderList)

			// Action
			createdAtRoot := createSecret(t, member, proj, "/", "NEW_KEY", "v")
			createdInWeb := createSecret(t, member, proj, "/apps/web", "NEW_KEY", "v")
			createdInKeys := createSecret(t, member, proj, "/apps/payments/keys", "NEW_KEY", "v")
			valuesInKeys := listSecrets(t, member, proj, "/apps/payments/keys", false)

			// Assert
			require.Equal(t, http.StatusForbidden, createdAtRoot, "read on / must not create")
			require.Equal(t, http.StatusOK, createdInWeb, "edit on /apps must reach /apps/web")
			require.Equal(t, http.StatusForbidden, createdInKeys, "list on /apps/payments must hold /apps/payments/keys below edit")
			require.Equalf(t, http.StatusForbidden, valuesInKeys.status, "reading values in /apps/payments/keys: %s", valuesInKeys.body)
			require.Equal(t, map[string]string{"CARD_KEY": "card"}, secretsAt(t, proj, "/apps/payments/keys"))
		})

		t.Run(fmt.Sprintf("should hold a %s to a lower role across a folder's subtree under a higher role applied from the root", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/prod/db")
			secretmanager.CreateFolder(t, proj, "dev", "/staging")
			secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "postgres", secretmanager.WithPath("/prod/db"))
			member := k.member(t, proj, "no-access")
			grantRecursive(t, proj, member, "/", secretmanager.FolderEdit)
			grantRecursive(t, proj, member, "/prod", secretmanager.FolderRead)

			// Action
			createdInProd := createSecret(t, member, proj, "/prod", "NEW_KEY", "v")
			createdInProdDB := createSecret(t, member, proj, "/prod/db", "NEW_KEY", "v")
			createdInStaging := createSecret(t, member, proj, "/staging", "NEW_KEY", "v")
			prodDB := listSecrets(t, member, proj, "/prod/db", false)

			// Assert
			require.Equal(t, http.StatusForbidden, createdInProd)
			require.Equal(t, http.StatusForbidden, createdInProdDB)
			require.Equal(t, http.StatusOK, createdInStaging)
			require.Equal(t, map[string]string{"DB_URL": "postgres"}, prodDB.values)
		})

		t.Run(fmt.Sprintf("should refuse a %s deleting a folder they hold a lower role in or below, under full access applied from above", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/apps/held")
			secretmanager.CreateFolder(t, proj, "dev", "/apps/outer/held-below")
			secretmanager.CreateFolder(t, proj, "dev", "/apps/free/child")
			member := k.member(t, proj, "no-access")
			grantRecursive(t, proj, member, "/apps", secretmanager.FolderFullAccess)
			grantRecursive(t, proj, member, "/apps/held", secretmanager.FolderList)
			secretmanager.GrantFolderAccess(t, proj, member, at("/apps/outer/held-below"), secretmanager.FolderRead)
			deleteFolder := func(name string) reply {
				res, err := member.API.DeleteSecretFolderWithResponse(t.Context(), name, api.DeleteSecretFolderJSONRequestBody{
					ProjectId: proj.ID, Environment: "dev", Path: new("/apps"), ForceDelete: new(true),
				})
				require.NoError(t, err)
				return decodeReply(t, res.StatusCode(), res.Body)
			}

			// Action
			held := deleteFolder("held")
			outer := deleteFolder("outer")
			free := deleteFolder("free")

			// Assert
			refusal := "Deleting the folder '%s' requires permission to delete folders in it and in every folder below it " +
				"in environment with slug 'dev'. Your access on '%s' does not allow deleting folders. Ask someone who can " +
				"delete folders there to delete it."
			require.Equalf(t, http.StatusForbidden, held.status, "deleting /apps/held: %s", held.body)
			require.Equal(t, fmt.Sprintf(refusal, "/apps/held", "/apps/held"), held.message)
			require.Equalf(t, http.StatusForbidden, outer.status, "deleting /apps/outer: %s", outer.body)
			require.Equal(t, fmt.Sprintf(refusal, "/apps/outer", "/apps/outer/held-below"), outer.message)
			require.Equalf(t, http.StatusOK, free.status, "deleting /apps/free: %s", free.body)
			require.ElementsMatch(t, []string{"held", "outer"}, folderNamesAt(t, proj, "/apps"))
			paths := []string{}
			for _, g := range grantsOf(t, proj, member) {
				paths = append(paths, g.SecretPath)
			}
			require.ElementsMatch(t, []string{"/apps", "/apps/held", "/apps/outer/held-below"}, paths)
		})

		t.Run(fmt.Sprintf("should list the nearest access that applies to subfolders as a %s's inherited access on a nested folder", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := newProject(t, tn)
			secretmanager.CreateFolder(t, proj, "dev", "/apps/payments/keys")
			member := k.member(t, proj, "no-access")
			onRoot := grantRecursive(t, proj, member, "/", secretmanager.FolderRead)
			onApps := grantRecursive(t, proj, member, "/apps", secretmanager.FolderEdit)
			id := member.ID.String()

			// Action
			root := listAccess(t, tn.Admin, proj, k.kind, at("/"), page{})
			apps := listAccess(t, tn.Admin, proj, k.kind, at("/apps"), page{})
			keys := listAccess(t, tn.Admin, proj, k.kind, at("/apps/payments/keys"), page{})
			revoked := revokeGrant(t, tn.Admin, proj, member, at("/apps"))
			require.Equalf(t, http.StatusOK, revoked.status, "revoking on /apps: %s", revoked.body)
			keysAfter := listAccess(t, tn.Admin, proj, k.kind, at("/apps/payments/keys"), page{})

			// Assert
			require.Equalf(t, http.StatusOK, keys.status, "listing /apps/payments/keys: %s", keys.body)
			require.Nil(t, root.with[id].Inherited)
			require.Equal(t, onApps.ID, apps.with[id].Grant.ID)
			require.Equal(t, onRoot.ID, apps.with[id].Inherited.ID)
			require.Nil(t, keys.with[id].Grant)
			require.Equal(t, onApps.ID, keys.with[id].Inherited.ID)
			require.Equal(t, "/apps", keys.with[id].Inherited.SecretPath)
			require.Equal(t, "edit", keys.with[id].Inherited.Permission)
			require.Equal(t, onRoot.ID, keysAfter.with[id].Inherited.ID)
			require.Equal(t, "/", keysAfter.with[id].Inherited.SecretPath)
		})
	}

	t.Run("should let access on one folder decide that folder only under access applied to subfolders above it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/apps/payments/keys")
		member := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		grantRecursive(t, proj, member, "/", secretmanager.FolderRead)
		grantRecursive(t, proj, member, "/apps", secretmanager.FolderEdit)
		secretmanager.GrantFolderAccess(t, proj, member, at("/apps/payments"), secretmanager.FolderList)

		// Action
		createdInPayments := createSecret(t, member, proj, "/apps/payments", "NEW_KEY", "v")
		createdInKeys := createSecret(t, member, proj, "/apps/payments/keys", "NEW_KEY", "v")

		// Assert
		require.Equal(t, http.StatusForbidden, createdInPayments)
		require.Equal(t, http.StatusOK, createdInKeys)
	})

	t.Run("should not list access on a sibling folder, or access above that does not apply to subfolders, as inherited", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/apps/payments")
		secretmanager.CreateFolder(t, proj, "dev", "/infra")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"), fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, member, at("/apps"), secretmanager.FolderRead)
		grantRecursive(t, proj, member, "/infra", secretmanager.FolderRead)

		// Action
		payments := listUsersAs(t, tn.Admin, proj, at("/apps/payments"), member.Email)

		// Assert
		require.Equalf(t, http.StatusOK, payments.status, "listing /apps/payments: %s", payments.body)
		require.NotContains(t, payments.with, member.ID.String())
		require.Nil(t, payments.without[member.ID.String()].Inherited)
	})

	t.Run("should let a holder of full access on a folder and its subfolders apply access to subfolders inside it and refuse it outside", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/team/api")
		secretmanager.CreateFolder(t, proj, "dev", "/other")
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"), fixture.WithRoles("no-access"))
		grantRecursive(t, proj, owner, "/team", secretmanager.FolderFullAccess)
		member := proj.NewUser(t, fixture.WithPrincipalName("member"), fixture.WithRoles("no-access"))
		recursive := map[string]any{"isPermissionRecursive": true}

		// Action
		inside := grantAs(t, owner, proj, member, at("/team/api"), secretmanager.FolderRead, recursive)
		outside := grantAs(t, owner, proj, member, at("/other"), secretmanager.FolderRead, recursive)
		onRoot := grantAs(t, owner, proj, member, at("/"), secretmanager.FolderRead, recursive)

		// Assert
		require.Equalf(t, http.StatusOK, inside.status, "granting on /team/api: %s", inside.body)
		require.Equalf(t, http.StatusForbidden, outside.status, "granting on /other: %s", outside.body)
		require.Equalf(t, http.StatusForbidden, onRoot.status, "granting on /: %s", onRoot.body)
		grants := grantsOf(t, proj, member)
		require.Len(t, grants, 1)
		require.Equal(t, "/team/api", grants[0].SecretPath)
		require.True(t, grants[0].IsPermissionRecursive)
	})

	t.Run("should let an edit holder on one folder create and rename folders in it when manage access applied from the root reaches it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		oldID := secretmanager.CreateFolder(t, proj, "dev", "/payments/old")
		member := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		grantRecursive(t, proj, member, "/", secretmanager.FolderManage)
		secretmanager.GrantFolderAccess(t, proj, member, at("/payments"), secretmanager.FolderEdit)

		// Action
		created, err := member.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/payments"), Name: "new",
		})
		require.NoError(t, err)
		renamed, err := member.API.UpdateSecretFolderWithResponse(t.Context(), oldID, api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/payments"), Name: "renamed",
		})
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, created.StatusCode(), "creating under /payments: %s", created.Body)
		require.Equalf(t, http.StatusOK, renamed.StatusCode(), "renaming under /payments: %s", renamed.Body)
		require.ElementsMatch(t, []string{"new", "renamed"}, folderNamesAt(t, proj, "/payments"))
	})

	t.Run("should let an edit holder on one folder create folders in it only when manage access applied from a folder above reaches it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/apps/payments")
		secretmanager.CreateFolder(t, proj, "dev", "/infra/db")
		member := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		grantRecursive(t, proj, member, "/apps", secretmanager.FolderManage)
		secretmanager.GrantFolderAccess(t, proj, member, at("/apps/payments"), secretmanager.FolderEdit)
		secretmanager.GrantFolderAccess(t, proj, member, at("/infra/db"), secretmanager.FolderEdit)

		// Action
		reached, err := member.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/apps/payments"), Name: "new",
		})
		require.NoError(t, err)
		notReached, err := member.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/infra/db"), Name: "new",
		})
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, reached.StatusCode(), "creating under /apps/payments: %s", reached.Body)
		require.Equalf(t, http.StatusForbidden, notReached.StatusCode(), "creating under /infra/db: %s", notReached.Body)
		require.Equal(t, []string{"new"}, folderNamesAt(t, proj, "/apps/payments"))
		require.Empty(t, folderNamesAt(t, proj, "/infra/db"))
	})

	t.Run("should let an edit holder create folders across the subtree its access applies to and refuse them outside it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/apps/web")
		secretmanager.CreateFolder(t, proj, "dev", "/infra")
		member := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		grantRecursive(t, proj, member, "/apps", secretmanager.FolderEdit)

		// Action
		inside, err := member.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/apps/web"), Name: "assets",
		})
		require.NoError(t, err)
		outside, err := member.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/infra"), Name: "assets",
		})
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, inside.StatusCode(), "creating under /apps/web: %s", inside.Body)
		require.Equalf(t, http.StatusForbidden, outside.StatusCode(), "creating under /infra: %s", outside.Body)
		require.Equal(t, []string{"assets"}, folderNamesAt(t, proj, "/apps/web"))
		require.Empty(t, folderNamesAt(t, proj, "/infra"))
	})
}
