package sharedsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func anyoneAccess() *api.CreateSharedSecretJSONBodyAccessType {
	return new(api.CreateSharedSecretJSONBodyAccessType("anyone"))
}

func emails(addrs ...string) *[]openapi_types.Email {
	out := make([]openapi_types.Email, len(addrs))
	for i, a := range addrs {
		out[i] = openapi_types.Email(a)
	}
	return &out
}

func share(t *testing.T, client *api.ClientWithResponses, body api.CreateSharedSecretJSONRequestBody) string {
	t.Helper()
	res, err := client.CreateSharedSecretWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "sharing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Id
}

func access(t *testing.T, client *api.ClientWithResponses, id string, password *string) *api.AccessSharedSecretResponse {
	t.Helper()
	res, err := client.AccessSharedSecretWithResponse(t.Context(), id, api.AccessSharedSecretJSONRequestBody{Password: password})
	require.NoError(t, err)
	return res
}

// revealed fails unless the access answered with the value, and returns it.
func revealed(t *testing.T, res *api.AccessSharedSecretResponse) string {
	t.Helper()
	require.NotNilf(t, res.JSON200, "accessing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.NotNil(t, res.JSON200.SecretValue)
	return *res.JSON200.SecretValue
}

func shareNames(t *testing.T, pr *harness.Principal, limit *float32) ([]string, int) {
	t.Helper()
	res, err := pr.API.ListSharedSecretsWithResponse(t.Context(), &api.ListSharedSecretsParams{Limit: limit})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing shares returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	names := make([]string, 0, len(res.JSON200.Secrets))
	for _, s := range res.JSON200.Secrets {
		name := ""
		if s.Name != nil {
			name = *s.Name
		}
		names = append(names, name)
	}
	return names, int(res.JSON200.TotalCount)
}

func updateOrg(t *testing.T, tn *harness.Tenant, body api.UpdateOrganizationJSONRequestBody) {
	t.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(), body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the organization returned %s", apierr.Body(res.Body))
}

func requestSecret(t *testing.T, requester *harness.Principal, accessType string) string {
	t.Helper()
	res, err := requester.API.CreateSecretRequestWithResponse(t.Context(), api.CreateSecretRequestJSONRequestBody{
		ExpiresIn:  "1h",
		Name:       new("db-password"),
		AccessType: new(api.CreateSecretRequestJSONBodyAccessType(accessType)),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "requesting a secret returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Id
}

func setRequestValue(t *testing.T, client *api.ClientWithResponses, id, value string) *api.SetSecretRequestValueResponse {
	t.Helper()
	res, err := client.SetSecretRequestValueWithResponse(t.Context(), id, api.SetSecretRequestValueJSONRequestBody{SecretValue: value})
	require.NoError(t, err)
	return res
}

func reveal(t *testing.T, pr *harness.Principal, id string) *api.RevealSecretRequestValueResponse {
	t.Helper()
	res, err := pr.API.RevealSecretRequestValueWithResponse(t.Context(), id)
	require.NoError(t, err)
	return res
}
