package access_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// rolesBody is an update body giving one permanent role. Its items are a union the
// generated client cannot serialise.
func rolesBody(t *testing.T, role string) io.Reader {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"roles": []map[string]any{{"role": role, "isTemporary": false}}})
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

func policyBody(t *testing.T, tn *harness.Tenant) api.CreateCertificatePolicyJSONRequestBody {
	t.Helper()
	body := pki.AllowAll(t)
	body.ProjectId = new(pki.CertManager(t, tn).ID.String())
	body.Name = "policy-" + id.Short()
	return body
}

// requirePolicyCreated requires a principal to create a certificate policy, an action
// only a Certificate Manager admin may take, and the admin to read it back.
func requirePolicyCreated(t *testing.T, tn *harness.Tenant, as *harness.Principal) {
	t.Helper()
	body := policyBody(t, tn)
	res, err := as.API.CreateCertificatePolicyWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	read, err := tn.Admin.API.GetCertificatePolicyWithResponse(t.Context(), res.JSON200.CertificatePolicy.Id, nil)
	require.NoError(t, err)
	require.NotNilf(t, read.JSON200, "reading the policy returned %d: %s", read.StatusCode(), apierr.Body(read.Body))
	require.Equal(t, body.Name, read.JSON200.CertificatePolicy.Name)
}

// requirePolicyRefused requires a principal to be refused creating a certificate policy
// for want of permission, leaving its name free for the admin.
func requirePolicyRefused(t *testing.T, tn *harness.Tenant, as *harness.Principal) {
	t.Helper()
	body := policyBody(t, tn)
	res, err := as.API.CreateCertificatePolicyWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.Equal(t, http.StatusForbidden, res.StatusCode())
	require.Equal(t, "You are not allowed to create on certificate-policies", apierr.Message(res.Body))
	again, err := tn.Admin.API.CreateCertificatePolicyWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, again.JSON200, "the admin creating the policy returned %d: %s", again.StatusCode(), apierr.Body(again.Body))
	require.Equal(t, body.Name, again.JSON200.CertificatePolicy.Name, "a taken name gets a suffix, so the refused request must not have written the policy")
}

// listCAsStatus is the status a principal gets listing the project's CAs, which any
// Certificate Manager member may do.
func listCAsStatus(t *testing.T, as *harness.Principal) int {
	t.Helper()
	res, err := as.API.ListCertificateAuthoritiesV1GeneralWithResponse(t.Context(), nil)
	require.NoError(t, err)
	return res.StatusCode()
}

func requireOK(t *testing.T, status int, body []byte, what string) {
	t.Helper()
	require.Equalf(t, http.StatusOK, status, "%s: %s", what, apierr.Body(body))
}
