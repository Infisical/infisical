package servicenow_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/servicenow"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

// A fake is a plain http.Handler, so it is provable without Docker.
func TestCurrentUser(t *testing.T) {
	t.Parallel()

	// Setup
	ts := httptest.NewServer(fakenet.New(servicenow.Service))
	t.Cleanup(ts.Close)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+"/api/now/ui/user/current_user", nil)
	require.NoError(t, err)
	req.Host = servicenow.Service.Host()
	req.SetBasicAuth("integration-user", "password")

	// Action
	res, err := ts.Client().Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = res.Body.Close() })

	// Assert
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode, "current_user: %s", body)

	var reply struct {
		Result struct {
			UserName string `json:"user_name"`
		} `json:"result"`
	}
	require.NoError(t, json.Unmarshal(body, &reply))
	require.Equal(t, "integration-user", reply.Result.UserName)
}
