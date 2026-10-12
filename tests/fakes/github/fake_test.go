package github_test

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/nacl/box"
)

const repo = "/repos/acme/app/actions/secrets"

// A fake is a plain http.Handler, so it is provable without Docker.
func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(fakenet.New(github.Service))
	t.Cleanup(ts.Close)
	return ts
}

func send(t *testing.T, ts *httptest.Server, method, host, token, path string, body any) *http.Response {
	t.Helper()
	var r io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		r = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(t.Context(), method, ts.URL+path, r)
	require.NoError(t, err)
	req.Host = host
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := ts.Client().Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = res.Body.Close() })
	return res
}

func do(t *testing.T, ts *httptest.Server, method, token, path string, body any) (int, []byte) {
	t.Helper()
	res := send(t, ts, method, "api.github.com", token, path, body)
	out, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, out
}

// seal encrypts the way the product does.
func seal(t *testing.T, ts *httptest.Server, token, scope, value string) (encrypted, keyID string) {
	t.Helper()
	code, body := do(t, ts, http.MethodGet, token, scope+"/public-key", nil)
	require.Equalf(t, http.StatusOK, code, "public-key: %s", body)

	var pk struct {
		KeyID string `json:"key_id"`
		Key   string `json:"key"`
	}
	require.NoError(t, json.Unmarshal(body, &pk))
	raw, err := base64.StdEncoding.DecodeString(pk.Key)
	require.NoError(t, err)

	var pub [32]byte
	copy(pub[:], raw)
	sealed, err := box.SealAnonymous(nil, []byte(value), &pub, rand.Reader)
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(sealed), pk.KeyID
}

func put(t *testing.T, ts *httptest.Server, token, name, encrypted, keyID string) (int, []byte) {
	t.Helper()
	return do(t, ts, http.MethodPut, token, repo+"/"+name,
		map[string]string{"encrypted_value": encrypted, "key_id": keyID})
}

func TestGitHubFake_Secrets(t *testing.T) {
	t.Run("should list a secret when a sealed value is stored", func(t *testing.T) {
		// Setup
		ts := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "postgres://db/app")

		// Action
		code, body := put(t, ts, "ghp_a", "DB_URL", enc, keyID)

		// Assert
		require.Equalf(t, http.StatusCreated, code, "PUT: %s", body)
		_, list := do(t, ts, http.MethodGet, "ghp_a", repo, nil)
		require.Contains(t, string(list), "DB_URL")
	})

	t.Run("should refuse a value when it is not a sealed box", func(t *testing.T) {
		// Setup
		ts := newServer(t)
		_, keyID := seal(t, ts, "ghp_a", repo, "ignored")
		plaintext := base64.StdEncoding.EncodeToString([]byte("postgres://db/app"))

		// Action
		code, body := put(t, ts, "ghp_a", "DB_URL", plaintext, keyID)

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, code, "PUT of plaintext: %s", body)
	})

	t.Run("should stop listing a secret when it is deleted", func(t *testing.T) {
		// Setup
		ts := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "v")
		put(t, ts, "ghp_a", "GONE", enc, keyID)

		// Action
		code, body := do(t, ts, http.MethodDelete, "ghp_a", repo+"/GONE", nil)

		// Assert
		require.Equalf(t, http.StatusNoContent, code, "DELETE: %s", body)
		_, list := do(t, ts, http.MethodGet, "ghp_a", repo, nil)
		require.NotContains(t, string(list), "GONE")
	})

	t.Run("should keep accounts apart when two credentials use one repository", func(t *testing.T) {
		// Setup
		ts := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "a-value")

		// Action
		put(t, ts, "ghp_a", "SHARED", enc, keyID)

		// Assert
		_, list := do(t, ts, http.MethodGet, "ghp_b", repo, nil)
		require.NotContains(t, string(list), "SHARED", "credential b can see credential a's secret")
	})

	t.Run("should reach every secret when the listing spans pages", func(t *testing.T) {
		// Setup
		ts := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "v")
		for i := range 150 {
			put(t, ts, "ghp_a", fmt.Sprintf("S%03d", i), enc, keyID)
		}

		// Action: walk the pages the way makePaginatedGitHubRequest does.
		first := send(t, ts, http.MethodGet, "api.github.com", "ghp_a", repo+"?per_page=100", nil)
		seen := map[string]bool{}
		for page := 1; page <= 2; page++ {
			_, body := do(t, ts, http.MethodGet, "ghp_a", fmt.Sprintf("%s?per_page=100&page=%d", repo, page), nil)
			var out struct {
				TotalCount int `json:"total_count"`
				Secrets    []struct {
					Name string `json:"name"`
				} `json:"secrets"`
			}
			require.NoError(t, json.Unmarshal(body, &out))
			require.Equal(t, 150, out.TotalCount)
			for _, s := range out.Secrets {
				seen[s.Name] = true
			}
		}

		// Assert
		require.Contains(t, first.Header.Get("Link"), `rel="last"`, "the client parses rel=last for a page count")
		require.Len(t, seen, 150)
	})
}

func TestFakenet_Dispatch(t *testing.T) {
	t.Run("should refuse by name when the host has no fake", func(t *testing.T) {
		// Setup
		ts := newServer(t)

		// Action
		res := send(t, ts, http.MethodGet, "api.checklyhq.com", "", "/v1/accounts", nil)

		// Assert
		require.Equal(t, http.StatusNotImplemented, res.StatusCode)
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Contains(t, string(body), "api.checklyhq.com", "a refusal must name the host")
	})

	t.Run("should refuse when the request carries no credential", func(t *testing.T) {
		// Setup
		ts := newServer(t)

		// Action
		code, body := do(t, ts, http.MethodGet, "", "/user", nil)

		// Assert
		require.Equalf(t, http.StatusNotImplemented, code, "%s", body)
	})
}
