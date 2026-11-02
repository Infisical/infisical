package access_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestAdditionalPrivilege_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	jsonBody := func(t *testing.T, body map[string]any) *bytes.Reader {
		t.Helper()
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		return bytes.NewReader(raw)
	}
	readSecrets := []map[string]any{{"subject": "secrets", "action": "read"}}

	routes := []struct {
		name string
		call func(t *testing.T, proj *fixture.Project, user, identity *harness.Principal) (int, []byte)
	}{
		{"the user privilege route", func(t *testing.T, proj *fixture.Project, user, _ *harness.Principal) (int, []byte) {
			res, err := proj.Tenant().Admin.API.CreateUserProjectAdditionalPrivilegeWithBodyWithResponse(t.Context(), "application/json",
				jsonBody(t, map[string]any{
					"projectMembershipId": membershipID(t, proj, user),
					"permissions":         readSecrets,
					"type":                map[string]any{"isTemporary": false},
				}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the v1 permanent identity privilege route", func(t *testing.T, proj *fixture.Project, _, identity *harness.Principal) (int, []byte) {
			res, err := proj.Tenant().Admin.API.CreateIdentityProjectPermanentPrivilegeV1WithBodyWithResponse(t.Context(), "application/json",
				jsonBody(t, map[string]any{
					"identityId":  identity.ID.String(),
					"projectSlug": proj.Slug,
					"permissions": readSecrets,
				}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the v1 temporary identity privilege route", func(t *testing.T, proj *fixture.Project, _, identity *harness.Principal) (int, []byte) {
			res, err := proj.Tenant().Admin.API.CreateIdentityProjectTemporaryPrivilegeV1WithBodyWithResponse(t.Context(), "application/json",
				jsonBody(t, map[string]any{
					"identityId":               identity.ID.String(),
					"projectSlug":              proj.Slug,
					"permissions":              readSecrets,
					"temporaryMode":            "relative",
					"temporaryRange":           "1h",
					"temporaryAccessStartTime": time.Now().UTC().Format(time.RFC3339),
				}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the v2 identity privilege route", func(t *testing.T, proj *fixture.Project, _, identity *harness.Principal) (int, []byte) {
			res, err := proj.Tenant().Admin.API.CreateIdentityProjectAdditionalPrivilegeWithBodyWithResponse(t.Context(), "application/json",
				jsonBody(t, map[string]any{
					"identityId":  identity.ID.String(),
					"projectId":   proj.ID,
					"permissions": readSecrets,
					"type":        map[string]any{"isTemporary": false},
				}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
	}

	for _, route := range routes {
		t.Run(fmt.Sprintf("should refuse %s on a new project and create nothing", route.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
			user := proj.NewUser(t, fixture.WithRoles("viewer"))
			identity := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

			// Action
			status, body := route.call(t, proj, user, identity)

			// Assert
			require.Equalf(t, http.StatusBadRequest, status, "answered %s", apierr.Body(body))
			require.Contains(t, string(body), "Additional privileges are not available")
			require.Empty(t, userPrivileges(t, proj, user))
			require.Empty(t, identityPrivileges(t, proj, identity))
		})
	}
}

func userPrivileges(t *testing.T, proj *fixture.Project, user *harness.Principal) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListUserProjectAdditionalPrivilegesWithResponse(t.Context(),
		&api.ListUserProjectAdditionalPrivilegesParams{ProjectMembershipId: membershipID(t, proj, user)})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing user privileges returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, p := range res.JSON200.Privileges {
		ids = append(ids, p.Id.String())
	}
	return ids
}

func identityPrivileges(t *testing.T, proj *fixture.Project, identity *harness.Principal) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListIdentityProjectAdditionalPrivilegesWithResponse(t.Context(),
		&api.ListIdentityProjectAdditionalPrivilegesParams{IdentityId: identity.ID.String(), ProjectId: proj.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing identity privileges returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, p := range res.JSON200.Privileges {
		ids = append(ids, p.Id.String())
	}
	return ids
}
