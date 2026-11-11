package kmip_test

import (
	"net/http"
	"sort"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

type clientPage struct {
	KmipClients []kmipClient `json:"kmipClients"`
	TotalCount  int          `json:"totalCount"`
}

func listClients(t *testing.T, client *api.ClientWithResponses, params api.ListKmipClientsParams) clientPage {
	t.Helper()
	res, err := client.ListKmipClientsWithResponse(t.Context(), &params)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[clientPage](t, res.Body)
}

func clientNames(clients []kmipClient) []string {
	out := make([]string, 0, len(clients))
	for _, c := range clients {
		out = append(out, c.Name)
	}
	sort.Strings(out)
	return out
}

func TestKmipClient(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a client with its operations and read it back", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		created := newClient(t, proj, "create", "get")

		// Assert
		require.Equal(t, []string{"create", "get"}, created.Permissions)
		require.Equal(t, proj.ID, created.ProjectID)
		require.Equal(t, created, getClient(t, proj, created.ID))
	})

	t.Run("should page clients with the full total count, including past the last client, and search by name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		for _, name := range []string{"array-a", "array-b", "backup"} {
			body := createClientBody(proj, "get")
			body["name"] = name
			res, err := tn.Admin.API.CreateKmipClientWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, body))
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}
		page := func(offset float32) clientPage {
			return listClients(t, tn.Admin.API, api.ListKmipClientsParams{ProjectId: proj.ID, Offset: new(offset), Limit: new(float32(2))})
		}

		// Action
		first, past := page(0), page(5)
		searched := listClients(t, tn.Admin.API, api.ListKmipClientsParams{ProjectId: proj.ID, Search: new("ARRAY")})

		// Assert
		require.Len(t, first.KmipClients, 2)
		require.Empty(t, past.KmipClients)
		require.Equal(t, []int{3, 3}, []int{first.TotalCount, past.TotalCount})
		require.Equal(t, []string{"array-a", "array-b"}, clientNames(searched.KmipClients))
	})

	t.Run("should update a client's name and operations", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		c := newClient(t, proj, "get")

		// Action
		res, err := tn.Admin.API.UpdateKmipClientWithBodyWithResponse(t.Context(), c.ID, "application/json",
			kms.JSON(t, map[string]any{"name": "renamed", "permissions": []string{"get", "locate"}}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		updated := getClient(t, proj, c.ID)
		require.Equal(t, "renamed", updated.Name)
		require.Equal(t, []string{"get", "locate"}, updated.Permissions)
	})

	t.Run("should refuse KMIP operations from a client once it is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, c := newSession(t, proj, "locate")
		callOK[struct{}](t, s, "locate", nil)

		// Action
		res, err := proj.Tenant().Admin.API.DeleteKmipClientWithResponse(t.Context(), c.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		status, body := s.call(t, "locate", nil)
		requireStatus(t, http.StatusNotFound, status, body)
		require.Equal(t, "KMIP client cannot be found.", apierr.Message(body))
		require.Empty(t, listClients(t, proj.Tenant().Admin.API, api.ListKmipClientsParams{ProjectId: proj.ID}).KmipClients)
	})

	t.Run("should refuse a project member and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))

		// Action
		res, err := member.API.CreateKmipClientWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, createClientBody(proj, "get")))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to create-clients on kmip", apierr.Message(res.Body))
		require.Empty(t, listClients(t, proj.Tenant().Admin.API, api.ListKmipClientsParams{ProjectId: proj.ID}).KmipClients)
	})

	t.Run("should refuse a client in a project that is not a KMS project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateKmipClientWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, createClientBody(proj, "get")))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "The project is of type secret-manager. Operations of type kms are not allowed.", apierr.Message(res.Body))
	})

	t.Run("should refuse creating and updating clients when the plan does not include KMIP, and still list and read them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		c := newClient(t, proj, "get")
		tn.SetPlan(t, license.Enterprise().Without(license.KMIP))

		// Action
		create, err := tn.Admin.API.CreateKmipClientWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, createClientBody(proj, "get")))
		require.NoError(t, err)
		update, err := tn.Admin.API.UpdateKmipClientWithBodyWithResponse(t.Context(), c.ID, "application/json",
			kms.JSON(t, map[string]any{"name": "renamed", "permissions": []string{"get"}}))
		require.NoError(t, err)

		// Assert
		requireStatus(t, http.StatusBadRequest, create.StatusCode(), create.Body)
		require.Equal(t, "Failed to create KMIP client. Upgrade your plan to enterprise.", apierr.Message(create.Body))
		requireStatus(t, http.StatusBadRequest, update.StatusCode(), update.Body)
		require.Equal(t, "Failed to update KMIP client. Upgrade your plan to enterprise.", apierr.Message(update.Body))
		require.Equal(t, c, getClient(t, proj, c.ID))
		require.Len(t, listClients(t, tn.Admin.API, api.ListKmipClientsParams{ProjectId: proj.ID}).KmipClients, 1)
	})

	t.Run("should delete a client when the plan no longer includes KMIP", func(t *testing.T) {
		t.Parallel()
		spec.Ref(t, "backend/CODE_QUALITY.md#license-checks: never gate a delete or a revoke")

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		c := newClient(t, proj, "get")
		tn.SetPlan(t, license.Enterprise().Without(license.KMIP))

		// Action
		res, err := tn.Admin.API.DeleteKmipClientWithResponse(t.Context(), c.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, listClients(t, tn.Admin.API, api.ListKmipClientsParams{ProjectId: proj.ID}).KmipClients)
	})
}
