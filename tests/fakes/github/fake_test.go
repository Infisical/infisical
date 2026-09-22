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
	"golang.org/x/crypto/nacl/box"
)

// A fake is a plain http.Handler, so it is provable without Docker. That is the
// intended development loop: write the fake here, then let the suite consume it
// through the container.
func newServer(t *testing.T) (*httptest.Server, *fakenet.Server) {
	t.Helper()
	srv := fakenet.New(github.Service)
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	return ts, srv
}

func do(t *testing.T, ts *httptest.Server, method, token, path string, body any) (int, []byte) {
	t.Helper()
	var r io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(t.Context(), method, ts.URL+path, r)
	if err != nil {
		t.Fatal(err)
	}
	req.Host = "api.github.com"
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, out
}

// seal encrypts the way the product does, so the test drives the fake through the
// same wire format GitHub requires.
func seal(t *testing.T, ts *httptest.Server, token, scope, value string) (string, string) {
	t.Helper()
	code, body := do(t, ts, http.MethodGet, token, scope+"/public-key", nil)
	if code != http.StatusOK {
		t.Fatalf("public-key returned %d: %s", code, body)
	}
	var pk struct {
		KeyID string `json:"key_id"`
		Key   string `json:"key"`
	}
	if err := json.Unmarshal(body, &pk); err != nil {
		t.Fatal(err)
	}
	raw, err := base64.StdEncoding.DecodeString(pk.Key)
	if err != nil {
		t.Fatal(err)
	}
	var pub [32]byte
	copy(pub[:], raw)
	sealed, err := box.SealAnonymous(nil, []byte(value), &pub, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(sealed), pk.KeyID
}

func TestGitHubFake_Secrets(t *testing.T) {
	const repo = "/repos/acme/app/actions/secrets"

	t.Run("ok/a sealed value is stored as plaintext the test can read", func(t *testing.T) {
		ts, _ := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "postgres://db/app")

		code, body := do(t, ts, http.MethodPut, "ghp_a", repo+"/DB_URL",
			map[string]string{"encrypted_value": enc, "key_id": keyID})
		if code != http.StatusCreated {
			t.Fatalf("PUT returned %d: %s", code, body)
		}

		code, body = do(t, ts, http.MethodGet, "ghp_a", repo, nil)
		if code != http.StatusOK {
			t.Fatalf("list returned %d: %s", code, body)
		}
		if !bytes.Contains(body, []byte("DB_URL")) {
			t.Errorf("list does not mention the secret: %s", body)
		}
	})

	t.Run("invalid/a value that is not a sealed box is refused", func(t *testing.T) {
		ts, _ := newServer(t)
		_, keyID := seal(t, ts, "ghp_a", repo, "ignored")

		// Plaintext, base64'd, which is what a sync that forgot to encrypt would send.
		code, body := do(t, ts, http.MethodPut, "ghp_a", repo+"/DB_URL", map[string]string{
			"encrypted_value": base64.StdEncoding.EncodeToString([]byte("postgres://db/app")),
			"key_id":          keyID,
		})
		if code != http.StatusUnprocessableEntity {
			t.Fatalf("PUT of plaintext returned %d, want 422: %s", code, body)
		}
	})

	t.Run("ok/a deleted secret stops being listed", func(t *testing.T) {
		ts, _ := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "v")
		do(t, ts, http.MethodPut, "ghp_a", repo+"/GONE", map[string]string{"encrypted_value": enc, "key_id": keyID})

		if code, body := do(t, ts, http.MethodDelete, "ghp_a", repo+"/GONE", nil); code != http.StatusNoContent {
			t.Fatalf("DELETE returned %d: %s", code, body)
		}
		if _, body := do(t, ts, http.MethodGet, "ghp_a", repo, nil); bytes.Contains(body, []byte("GONE")) {
			t.Errorf("a deleted secret is still listed: %s", body)
		}
	})

	t.Run("cross-tenant/two credentials hold separate accounts", func(t *testing.T) {
		ts, _ := newServer(t)
		encA, keyA := seal(t, ts, "ghp_a", repo, "a-value")
		do(t, ts, http.MethodPut, "ghp_a", repo+"/SHARED", map[string]string{"encrypted_value": encA, "key_id": keyA})

		// Same repository path, different credential. This is the whole isolation
		// story: one fakenet serves every parallel tenant.
		if _, body := do(t, ts, http.MethodGet, "ghp_b", repo, nil); bytes.Contains(body, []byte("SHARED")) {
			t.Errorf("credential b can see credential a's secret: %s", body)
		}
	})

	t.Run("ok/listing paginates and advertises the last page", func(t *testing.T) {
		ts, _ := newServer(t)
		enc, keyID := seal(t, ts, "ghp_a", repo, "v")
		for i := range 150 {
			do(t, ts, http.MethodPut, "ghp_a", fmt.Sprintf("%s/S%03d", repo, i),
				map[string]string{"encrypted_value": enc, "key_id": keyID})
		}

		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+repo+"?per_page=100", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Host = "api.github.com"
		req.Header.Set("Authorization", "Bearer ghp_a")
		res, err := ts.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = res.Body.Close() }()

		link := res.Header.Get("Link")
		if link == "" {
			t.Fatal("no Link header on a result that spans pages, so the client would never fetch page 2")
		}
		if !bytes.Contains([]byte(link), []byte(`rel="last"`)) {
			t.Fatalf("Link header carries no rel=last, which is what the client parses for a page count: %s", link)
		}

		// Walk the pages the way makePaginatedGitHubRequest does, and check every
		// secret is reachable. A fake that answered page 1 forever would pass a
		// header check and fail this.
		seen := map[string]bool{}
		for page := 1; page <= 2; page++ {
			_, body := do(t, ts, http.MethodGet, "ghp_a",
				fmt.Sprintf("%s?per_page=100&page=%d", repo, page), nil)
			var out struct {
				TotalCount int `json:"total_count"`
				Secrets    []struct {
					Name string `json:"name"`
				} `json:"secrets"`
			}
			if err := json.Unmarshal(body, &out); err != nil {
				t.Fatal(err)
			}
			if out.TotalCount != 150 {
				t.Errorf("page %d reports total_count %d, want 150", page, out.TotalCount)
			}
			for _, s := range out.Secrets {
				seen[s.Name] = true
			}
		}
		if len(seen) != 150 {
			t.Errorf("walking two pages found %d secrets, want 150", len(seen))
		}
	})
}

func TestFakenet_Dispatch(t *testing.T) {
	t.Run("invalid/an unfaked host is refused by name", func(t *testing.T) {
		ts, _ := newServer(t)
		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, ts.URL+"/v1/accounts", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Host = "api.checklyhq.com"
		res, err := ts.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = res.Body.Close() }()

		if res.StatusCode != http.StatusNotImplemented {
			t.Fatalf("an unfaked host returned %d, want 501", res.StatusCode)
		}
		body, _ := io.ReadAll(res.Body)
		if !bytes.Contains(body, []byte("api.checklyhq.com")) {
			t.Errorf("the refusal does not name the host, so a forgotten fake is hard to place: %s", body)
		}
	})

	t.Run("invalid/a request with no credential is refused", func(t *testing.T) {
		ts, _ := newServer(t)
		if code, body := do(t, ts, http.MethodGet, "", "/user", nil); code != http.StatusNotImplemented {
			t.Fatalf("returned %d, want 501: %s", code, body)
		}
	})
}
