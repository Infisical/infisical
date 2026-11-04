package vercel_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/vercel"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const envs = "/v9/projects/prj_app/env"

// A fake is a plain http.Handler, so it is provable without Docker.
func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(fakenet.New(vercel.Service))
	t.Cleanup(ts.Close)
	return ts
}

func do(t *testing.T, ts *httptest.Server, method, token, path string, body any) (int, []byte) {
	t.Helper()
	var r io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		r = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(t.Context(), method, ts.URL+path, r)
	require.NoError(t, err)
	req.Host = vercel.Service.Host()
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := ts.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	out, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, out
}

func create(t *testing.T, ts *httptest.Server, token, key, value, typ string, target ...string) (int, []byte) {
	t.Helper()
	return do(t, ts, http.MethodPost, token, "/v10/projects/prj_app/env?teamId=team_1",
		map[string]any{"key": key, "value": value, "type": typ, "target": target})
}

type listed struct {
	Envs []struct {
		ID    string `json:"id"`
		Key   string `json:"key"`
		Value string `json:"value"`
	} `json:"envs"`
}

func list(t *testing.T, ts *httptest.Server, token string) listed {
	t.Helper()
	code, body := do(t, ts, http.MethodGet, token, envs+"?teamId=team_1", nil)
	require.Equalf(t, http.StatusOK, code, "list: %s", body)
	var out listed
	require.NoError(t, json.Unmarshal(body, &out))
	return out
}

func TestFake_Env(t *testing.T) {
	t.Parallel()

	t.Run("should reject a key that starts with a digit or has other characters, with Vercel's code", func(t *testing.T) {
		t.Parallel()
		ts := newServer(t)

		for _, key := range []string{"1API_KEY", "API-KEY", "API KEY"} {
			code, body := create(t, ts, "tok", key, "v", "encrypted", "production")

			require.Equalf(t, http.StatusBadRequest, code, "%s: %s", key, body)
			require.Contains(t, string(body), `"code":"env_key_invalid_characters"`)
		}
		require.Empty(t, list(t, ts, "tok").Envs)
	})

	t.Run("should list an encrypted value as ciphertext and return the plaintext when read by id", func(t *testing.T) {
		t.Parallel()
		ts := newServer(t)
		code, body := create(t, ts, "tok", "API_KEY", "plain-value", "encrypted", "production")
		require.Equalf(t, http.StatusCreated, code, "%s", body)

		got := list(t, ts, "tok")
		require.Len(t, got.Envs, 1)
		require.NotEqual(t, "plain-value", got.Envs[0].Value)

		code, body = do(t, ts, http.MethodGet, "tok", envs+"/"+got.Envs[0].ID, nil)
		require.Equalf(t, http.StatusOK, code, "%s", body)
		require.Contains(t, string(body), `"value":"plain-value"`)
	})

	t.Run("should refuse a second record for the same key and target", func(t *testing.T) {
		t.Parallel()
		ts := newServer(t)
		code, _ := create(t, ts, "tok", "API_KEY", "a", "encrypted", "production")
		require.Equal(t, http.StatusCreated, code)

		code, body := create(t, ts, "tok", "API_KEY", "b", "encrypted", "production")

		require.Equalf(t, http.StatusBadRequest, code, "%s", body)
		require.Contains(t, string(body), `"code":"ENV_CONFLICT"`)
		require.Len(t, list(t, ts, "tok").Envs, 1)
	})

	t.Run("should update and delete a record by id", func(t *testing.T) {
		t.Parallel()
		ts := newServer(t)
		_, _ = create(t, ts, "tok", "API_KEY", "old", "encrypted", "production")
		id := list(t, ts, "tok").Envs[0].ID

		code, body := do(t, ts, http.MethodPatch, "tok", envs+"/"+id, map[string]any{"value": "new", "type": "encrypted"})
		require.Equalf(t, http.StatusOK, code, "%s", body)
		_, body = do(t, ts, http.MethodGet, "tok", envs+"/"+id, nil)
		require.Contains(t, string(body), `"value":"new"`)

		code, body = do(t, ts, http.MethodDelete, "tok", envs+"/"+id, nil)
		require.Equalf(t, http.StatusOK, code, "%s", body)
		require.Empty(t, list(t, ts, "tok").Envs)
	})

	t.Run("should keep each token's projects apart", func(t *testing.T) {
		t.Parallel()
		ts := newServer(t)
		_, _ = create(t, ts, "tok-a", "API_KEY", "a", "encrypted", "production")

		require.Empty(t, list(t, ts, "tok-b").Envs)
		require.Len(t, list(t, ts, "tok-a").Envs, 1)
	})
}
