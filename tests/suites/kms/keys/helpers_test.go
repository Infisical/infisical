package keys_test

import (
	"encoding/base64"
	"net/http"
	"sort"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "body: %s", apierr.Body(body))
}

func newProject(t *testing.T, tn *harness.Tenant) *fixture.Project {
	t.Helper()
	return fixture.NewProject(t, tn, fixture.WithProjectType("kms"))
}

type keyPage struct {
	Keys       []kms.Key
	TotalCount int
}

func listKeys(t *testing.T, client *api.ClientWithResponses, params api.ListKmsKeysParams) keyPage {
	t.Helper()
	res, err := client.ListKmsKeysWithResponse(t.Context(), &params)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[keyPage](t, res.Body)
}

// keyNames lists the project's keys as the administrator, sorted, for checking what a call left behind.
func keyNames(t *testing.T, p *fixture.Project) []string {
	t.Helper()
	page := listKeys(t, p.Tenant().Admin.API, api.ListKmsKeysParams{ProjectId: p.ID})
	return names(page.Keys)
}

func names(keys []kms.Key) []string {
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, k.Name)
	}
	sort.Strings(out)
	return out
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func signWith(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, signingAlgorithm string) (int, []byte) {
	t.Helper()
	res, err := client.SignWithKmsKeyWithBodyWithResponse(t.Context(), keyID, "application/json",
		kms.JSON(t, map[string]any{"signingAlgorithm": signingAlgorithm, "data": b64("message")}))
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func setDisabled(t *testing.T, p *fixture.Project, keyID uuid.UUID, disabled bool) {
	t.Helper()
	res, err := p.Tenant().Admin.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), keyID, "application/json",
		kms.JSON(t, map[string]any{"isDisabled": disabled}))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}
