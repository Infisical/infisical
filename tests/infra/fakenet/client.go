package fakenet

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

// Scope is a test's handle on one caller's state inside fakenet.
//
// Generic over the fake's own state type, so every fake gets seeding, reading,
// failure injection and the call log without writing any of it. A fake package adds
// only names: a typed accessor or two and its seed fragments.
type Scope[S any] struct {
	base string
	host string
	key  string
	http *http.Client
}

// Open returns a handle on one scope and removes it when the test ends.
//
// The key is the credential the product will authenticate with, which is what lets
// two parallel tenants share one fakenet without seeing each other.
func Open[S any](tt *testing.T, adminURL, host, key string) *Scope[S] {
	tt.Helper()
	sc := &Scope[S]{
		base: strings.TrimSuffix(adminURL, "/"),
		host: host,
		key:  key,
		http: &http.Client{Timeout: 10 * time.Second},
	}
	tt.Cleanup(func() { sc.remove() })
	return sc
}

// State is the fake's own state, as it stands now.
//
// A snapshot rather than a live pointer, because the fake lives in a container. Read
// it at the point of assertion rather than holding it across an action.
func (s *Scope[S]) State(tt *testing.T) *S {
	tt.Helper()
	var out S
	if err := s.do(http.MethodGet, "/state", nil, &out); err != nil {
		tt.Fatalf("fakenet: reading state: %v", err)
	}
	return &out
}

// Seed merges fragments into the fake before the product touches it.
func (s *Scope[S]) Seed(tt *testing.T, fragments ...any) {
	tt.Helper()
	for _, f := range fragments {
		if err := s.do(http.MethodPost, "/seed", f, nil); err != nil {
			tt.Fatalf("fakenet: seeding: %v", err)
		}
	}
}

// Fail makes matching requests answer with status instead of reaching the fake.
// times of 0 applies to every matching request. Path may end in * to match a prefix.
func (s *Scope[S]) Fail(tt *testing.T, method, path string, status, times int) {
	tt.Helper()
	if err := s.do(http.MethodPost, "/rules", Rule{
		Method: method, Path: path, Status: status, Times: times,
	}, nil); err != nil {
		tt.Fatalf("fakenet: adding a rule: %v", err)
	}
}

// Calls is every request this scope received, newest last.
func (s *Scope[S]) Calls(tt *testing.T) []Call {
	tt.Helper()
	var out []Call
	if err := s.do(http.MethodGet, "/calls", nil, &out); err != nil {
		tt.Fatalf("fakenet: reading the call log: %v", err)
	}
	return out
}

// Received counts this scope's requests to a method and path.
func (s *Scope[S]) Received(tt *testing.T, method, path string) int {
	tt.Helper()
	n := 0
	for _, c := range s.Calls(tt) {
		if strings.EqualFold(c.Method, method) && c.Path == path {
			n++
		}
	}
	return n
}

func (s *Scope[S]) remove() {
	req, err := http.NewRequest(http.MethodDelete, s.scopeURL(""), nil)
	if err != nil {
		return
	}
	if res, dErr := s.http.Do(req); dErr == nil {
		_ = res.Body.Close()
	}
}

func (s *Scope[S]) scopeURL(suffix string) string {
	return s.base + AdminPrefix + "/scopes/" + url.PathEscape(s.host) + "/" + url.PathEscape(s.key) + suffix
}

func (s *Scope[S]) do(method, suffix string, in, out any) error {
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, s.scopeURL(suffix), body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := s.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, suffix, err)
	}
	defer func() { _ = res.Body.Close() }()

	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return fmt.Errorf("%s %s returned %d: %s", method, suffix, res.StatusCode, strings.TrimSpace(string(raw)))
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}
