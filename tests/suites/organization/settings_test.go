package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestOrganization_PrivilegeUpgrade(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a non-admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.UpgradePrivilegeSystemWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "only the organization admin can upgrade the privilege system")
	})

	t.Run("should refuse an upgrade when the org is already on the new privilege system", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpgradePrivilegeSystemWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Privilege system already upgraded")
	})
}

func TestOrganization_IncidentContacts(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list an added contact and drop it once removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		addr := tn.Email("oncall")
		added := addIncidentContact(t, tn, tn.Admin, addr)
		requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
		require.Equal(t, []string{addr}, incidentContacts(t, tn))

		// Action
		res, err := tn.Admin.API.DeleteOrganizationIncidentContactWithResponse(t.Context(), tn.OrgID.String(),
			added.JSON200.IncidentContactsOrg.Id.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, incidentContacts(t, tn))
	})

	t.Run("should refuse a duplicate contact and keep one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		addr := tn.Email("oncall")
		first := addIncidentContact(t, tn, tn.Admin, addr)
		requireStatus(t, http.StatusOK, first.StatusCode(), first.Body)

		// Action
		res := addIncidentContact(t, tn, tn.Admin, addr)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Incident contact already exists")
		require.Equal(t, []string{addr}, incidentContacts(t, tn))
	})

	t.Run("should refuse a member adding a contact", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res := addIncidentContact(t, tn, member, tn.Email("oncall"))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Empty(t, incidentContacts(t, tn))
	})
}

func addIncidentContact(t *testing.T, tn *harness.Tenant, actor *harness.Principal, addr string) *api.CreateOrganizationIncidentContactResponse {
	t.Helper()
	res, err := actor.API.CreateOrganizationIncidentContactWithResponse(t.Context(), tn.OrgID.String(),
		api.CreateOrganizationIncidentContactJSONRequestBody{Email: openapi_types.Email(addr)})
	require.NoError(t, err)
	return res
}

func incidentContacts(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).ListOrganizationIncidentContactsWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var out []string
	for _, c := range res.JSON200.IncidentContactsOrg {
		out = append(out, c.Email)
	}
	return out
}
