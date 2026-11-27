package ldap_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/ldap"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// mappable gives the tenant an LDAP config that searches ou=groups for group mappings, and returns
// the directory and the config ID.
func mappable(t *testing.T, tn *harness.Tenant) (*directory, uuid.UUID) {
	t.Helper()
	fixture.VerifiedEmailDomain(t, tn)
	d := newDirectory(t, tn)
	body := d.configBody()
	body.GroupSearchBase = "ou=groups," + d.BaseDN
	res := createConfig(t, tn.Admin.API, body)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return d, res.JSON200.Id
}

// addGroup adds a group entry under ou=groups and returns its CN.
func (d *directory) addGroup(t *testing.T) string {
	t.Helper()
	cn := "grp-" + id.Short()
	d.Scope.Seed(t, map[string]any{"entries": []ldap.Entry{{
		DN:         "cn=" + cn + ",ou=groups," + d.BaseDN,
		Attributes: map[string][]string{"cn": {cn}, "objectClass": {"groupOfNames"}},
	}}})
	return cn
}

func createGroupMap(t *testing.T, actor *api.ClientWithResponses, configID uuid.UUID, cn, groupSlug string) *api.CreateLdapGroupMapResponse {
	t.Helper()
	res, err := actor.CreateLdapGroupMapWithResponse(t.Context(), configID, api.CreateLdapGroupMapJSONRequestBody{
		LdapGroupCN: cn,
		GroupSlug:   groupSlug,
	})
	require.NoError(t, err)
	return res
}

func listGroupMaps(t *testing.T, tn *harness.Tenant, configID uuid.UUID) []string {
	t.Helper()
	res, err := tn.Admin.API.ListLdapGroupMapsWithResponse(t.Context(), configID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ids := []string{}
	for _, m := range *res.JSON200 {
		ids = append(ids, m.Id)
	}
	return ids
}

func TestLDAPGroupMap(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create, list and delete a mapping when a machine identity with the admin role manages it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d, configID := mappable(t, tn)
		cn := d.addGroup(t)
		group := fixture.NewGroup(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		created := createGroupMap(t, identity.API, configID, cn, group.Slug)
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		listed, err := identity.API.ListLdapGroupMapsWithResponse(t.Context(), configID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		deleted, err := identity.API.DeleteLdapGroupMapWithResponse(t.Context(), configID, created.JSON200.Id)
		require.NoError(t, err)

		// Assert
		require.Equal(t, cn, created.JSON200.LdapGroupCN)
		require.Equal(t, group.ID, created.JSON200.GroupId)
		require.Len(t, *listed.JSON200, 1)
		require.Equal(t, created.JSON200.Id.String(), (*listed.JSON200)[0].Id)
		require.Equal(t, group.Slug, (*listed.JSON200)[0].Group.Slug)
		requireStatus(t, http.StatusOK, deleted.StatusCode(), deleted.Body)
		require.Empty(t, listGroupMaps(t, tn, configID))
	})

	t.Run("should refuse every group mapping call when the machine identity has no LDAP permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d, configID := mappable(t, tn)
		cn := d.addGroup(t)
		group := fixture.NewGroup(t, tn)
		existing := createGroupMap(t, tn.Admin.API, configID, cn, group.Slug)
		requireStatus(t, http.StatusOK, existing.StatusCode(), existing.Body)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("no-access"))

		// Action
		listed, err := identity.API.ListLdapGroupMapsWithResponse(t.Context(), configID)
		require.NoError(t, err)
		created := createGroupMap(t, identity.API, configID, d.addGroup(t), group.Slug)
		deleted, err := identity.API.DeleteLdapGroupMapWithResponse(t.Context(), configID, existing.JSON200.Id)
		require.NoError(t, err)

		// Assert
		requireStatus(t, http.StatusForbidden, listed.StatusCode(), listed.Body)
		requireStatus(t, http.StatusForbidden, created.StatusCode(), created.Body)
		requireStatus(t, http.StatusForbidden, deleted.StatusCode(), deleted.Body)
		require.Equal(t, []string{existing.JSON200.Id.String()}, listGroupMaps(t, tn, configID))
	})

	t.Run("should refuse a duplicate mapping with a conflict and keep one mapping", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d, configID := mappable(t, tn)
		cn := d.addGroup(t)
		group := fixture.NewGroup(t, tn)
		first := createGroupMap(t, tn.Admin.API, configID, cn, group.Slug)
		requireStatus(t, http.StatusOK, first.StatusCode(), first.Body)

		// Action
		res := createGroupMap(t, tn.Admin.API, configID, cn, group.Slug)

		// Assert
		requireStatus(t, http.StatusConflict, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "is already mapped to group")
		require.Len(t, listGroupMaps(t, tn, configID), 1)
	})

	t.Run("should reject a malformed config ID before reaching the database", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mappable(t, tn)

		// Action
		res, err := tn.Admin.API.ListLdapGroupMapsWithResponse(t.Context(), uuid.UUID{}, func(_ context.Context, req *http.Request) error {
			req.URL.Path = strings.Replace(req.URL.Path, uuid.UUID{}.String(), "not-a-uuid", 1)
			return nil
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
	})

	t.Run("should remove the mappings when the config is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d, configID := mappable(t, tn)
		group := fixture.NewGroup(t, tn)
		created := createGroupMap(t, tn.Admin.API, configID, d.addGroup(t), group.Slug)
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)

		// Action
		res, err := tn.Admin.API.DeleteLdapConfigWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := d.configBody()
		body.GroupSearchBase = "ou=groups," + d.BaseDN
		recreated := createConfig(t, tn.Admin.API, body)
		requireStatus(t, http.StatusOK, recreated.StatusCode(), recreated.Body)

		// Assert
		require.Empty(t, listGroupMaps(t, tn, recreated.JSON200.Id))
		gone, err := tn.Admin.API.DeleteLdapGroupMapWithResponse(t.Context(), recreated.JSON200.Id, created.JSON200.Id)
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, gone.StatusCode(), gone.Body)
	})
}

func TestLDAPGroupMap_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record the CN and group slug when an admin creates and deletes a mapping", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d, configID := mappable(t, tn)
		cn := d.addGroup(t)
		group := fixture.NewGroup(t, tn)

		// Action
		created := createGroupMap(t, tn.Admin.API, configID, cn, group.Slug)
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		deleted, err := tn.Admin.API.DeleteLdapGroupMapWithResponse(t.Context(), configID, created.JSON200.Id)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, deleted.StatusCode(), deleted.Body)

		// Assert
		mapID := created.JSON200.Id.String()
		for _, eventType := range []string{"create-ldap-group-map", "delete-ldap-group-map"} {
			event := fixture.RequireAuditedBy(t, tn, tn.Admin, eventType, "ldapGroupMapId", mapID)
			require.Equal(t, configID.String(), event["ldapConfigId"])
			require.Equal(t, cn, event["ldapGroupCN"])
			require.Equal(t, group.Slug, event["groupSlug"])
		}
	})
}
