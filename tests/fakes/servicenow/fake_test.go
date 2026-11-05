package servicenow_test

import (
	"bytes"
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

func TestAccessRequests(t *testing.T) {
	t.Parallel()

	send := func(t *testing.T, fake http.Handler, method, path string, body any) (int, []byte) {
		t.Helper()
		var payload io.Reader
		if body != nil {
			raw, err := json.Marshal(body)
			require.NoError(t, err)
			payload = bytes.NewReader(raw)
		}
		rec := httptest.NewRecorder()
		fake.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), method, path, payload))
		return rec.Code, rec.Body.Bytes()
	}
	create := func(t *testing.T, fake http.Handler, requestID string) (int, string) {
		t.Helper()
		code, body := send(t, fake, http.MethodPost, "/api/x_infis_approvals/v1/infisical/access_request", map[string]any{
			"request_id":     requestID,
			"callback_url":   "https://infisical.test/api/v1/delegated-approvals/callback",
			"callback_token": "inf_ext_token",
			"permissions":    []string{"secrets: read", "secret-folders: read"},
		})
		var reply struct {
			Result struct {
				SysID string `json:"sys_id"`
			} `json:"result"`
		}
		require.NoErrorf(t, json.Unmarshal(body, &reply), "create: %s", body)
		return code, reply.Result.SysID
	}

	t.Run("should report the decision an approver recorded when the record is read back", func(t *testing.T) {
		t.Parallel()

		// Setup
		fake := servicenow.Service.New(fakenet.Emitter{})
		_, sysID := create(t, fake, "request-1")
		raw, err := json.Marshal(servicenow.Approved(sysID))
		require.NoError(t, err)
		require.NoError(t, fake.Seed(raw))

		// Action
		code, body := send(t, fake, http.MethodGet, "/api/x_infis_approvals/v1/infisical/access_request/"+sysID, nil)

		// Assert
		require.Equalf(t, http.StatusOK, code, "read back: %s", body)
		var reply struct {
			Result struct {
				Data struct {
					RequestID   string  `json:"request_id"`
					Permissions string  `json:"permissions"`
					Decision    *string `json:"decision"`
				} `json:"data"`
			} `json:"result"`
		}
		require.NoError(t, json.Unmarshal(body, &reply))
		require.Equal(t, "secrets: read\nsecret-folders: read", reply.Result.Data.Permissions)
		require.Equal(t, new("approved"), reply.Result.Data.Decision)
	})

	t.Run("should report no decision when the customer's flow expired the record", func(t *testing.T) {
		t.Parallel()

		// Setup
		fake := servicenow.Service.New(fakenet.Emitter{})
		_, sysID := create(t, fake, "request-1")
		raw, err := json.Marshal(servicenow.Expired(sysID))
		require.NoError(t, err)
		require.NoError(t, fake.Seed(raw))

		// Action
		code, body := send(t, fake, http.MethodGet, "/api/x_infis_approvals/v1/infisical/access_request/"+sysID, nil)

		// Assert
		require.Equalf(t, http.StatusOK, code, "read back: %s", body)
		var reply struct {
			Result struct {
				Data struct {
					State    string  `json:"state"`
					Decision *string `json:"decision"`
				} `json:"data"`
			} `json:"result"`
		}
		require.NoError(t, json.Unmarshal(body, &reply))
		require.Equal(t, "expired", reply.Result.Data.State)
		require.Nil(t, reply.Result.Data.Decision)
	})

	t.Run("should return the record it already holds when the same request is sent twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		fake := servicenow.Service.New(fakenet.Emitter{})
		_, first := create(t, fake, "request-1")

		// Action
		code, second := create(t, fake, "request-1")

		// Assert
		require.Equal(t, http.StatusConflict, code)
		require.Equal(t, first, second)
	})
}
