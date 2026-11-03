package machineidentity_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestMachineIdentity_AuthTemplate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a template when the plan lacks auth templates", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.MachineIdentityAuthTemplates)))

		// Action
		res := createOidcTemplate(t, tn, "https://issuer.test")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Upgrade plan to access machine identity auth templates")
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, oidcTemplateIDs(t, tn))
	})

	t.Run("should apply template changes to every identity using it, and report usage", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		created := createOidcTemplate(t, tn, "https://issuer.test")
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		templateID := templateIDOf(t, created.Body)
		first, second := oidcFromTemplate(t, tn, templateID), oidcFromTemplate(t, tn, templateID)

		// Action
		res, err := tn.Admin.API.UpdateIdentityAuthTemplateWithBodyWithResponse(t.Context(), templateID.String(), "application/json",
			jsonBody(t, map[string]any{"templateFields": map[string]any{"boundIssuer": "https://rotated-issuer.test"}}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "https://rotated-issuer.test", oidcIssuer(t, tn, first))
		require.Equal(t, "https://rotated-issuer.test", oidcIssuer(t, tn, second))
		usage, err := tn.Admin.API.GetIdentityAuthTemplateUsageWithResponse(t.Context(), templateID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, usage.StatusCode(), usage.Body)
		used := []string{}
		for _, u := range *usage.JSON200 {
			used = append(used, u.IdentityId)
		}
		require.ElementsMatch(t, []string{first.String(), second.String()}, used)
	})
}

// createOidcTemplate creates an OIDC auth template. The discovery host only has to
// resolve: nothing logs in through it here.
func createOidcTemplate(t *testing.T, tn *harness.Tenant, issuer string) *api.CreateIdentityAuthTemplateResponse {
	t.Helper()
	res, err := tn.Admin.API.CreateIdentityAuthTemplateWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{
		"name":       "tpl-" + id.Short(),
		"authMethod": "oidc",
		"templateFields": map[string]any{
			"oidcDiscoveryUrl": oidcidp.IssuerURL(id.Nonce()),
			"boundIssuer":      issuer,
		},
	}))
	require.NoError(t, err)
	return res
}

func templateIDOf(t *testing.T, body []byte) uuid.UUID {
	t.Helper()
	var tpl struct {
		ID uuid.UUID `json:"id"`
	}
	require.NoError(t, json.Unmarshal(body, &tpl))
	require.NotEqual(t, uuid.Nil, tpl.ID, "template response carried no id: %s", apierr.Body(body))
	return tpl.ID
}

func oidcTemplateIDs(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.ListIdentityAuthTemplatesWithResponse(t.Context(),
		&api.ListIdentityAuthTemplatesParams{AuthMethod: api.ListIdentityAuthTemplatesParamsAuthMethod("oidc")})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var templates []struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &templates))
	ids := []string{}
	for _, tpl := range templates {
		ids = append(ids, tpl.ID)
	}
	return ids
}

// oidcFromTemplate creates an identity with OIDC auth linked to the template. A linked
// identity has to bind a subject of its own.
func oidcFromTemplate(t *testing.T, tn *harness.Tenant, templateID uuid.UUID) uuid.UUID {
	t.Helper()
	identityID := createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{})
	tid := openapi_types.UUID(templateID)
	res, err := tn.Admin.API.AttachOidcAuthWithResponse(t.Context(), identityID.String(), api.AttachOidcAuthJSONRequestBody{
		TemplateId:   &tid,
		BoundSubject: new("workload-" + id.Short()),
		BoundClaims:  map[string]string{},
	})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return identityID
}

func oidcIssuer(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.GetOidcAuthWithResponse(t.Context(), identityID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading OIDC auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.IdentityOidcAuth.BoundIssuer
}
