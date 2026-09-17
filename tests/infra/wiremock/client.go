package wiremock

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/Infisical/infisical/tests/infra"
)

// Client talks to WireMock's admin API.
//
// Stubs are registered with a discriminating request matcher so that parallel
// tenants sharing one WireMock cannot match each other's requests. Metadata is
// admin-side only: WireMock does not match requests on it, so it serves cleanup and
// nothing else.
type Client struct {
	base string
	http *http.Client
}

func NewClient(adminURL string) *Client {
	return &Client{base: adminURL, http: &http.Client{Timeout: 10 * time.Second}}
}

// Matcher is a WireMock request-matching predicate, for example
// {"contains": "a1b2c3d4"} or {"equalTo": "x"}.
type Matcher map[string]any

func Contains(v string) Matcher { return Matcher{"contains": v} }
func EqualTo(v string) Matcher  { return Matcher{"equalTo": v} }
func MatchesRe(v string) Matcher {
	return Matcher{"matches": v}
}

// Stub is one mapping.
type Stub struct {
	Method  string
	URLPath string
	URLRe   string

	// URLAnyPattern matches the whole URL including the query, where URLRe matches
	// the path only. Needed for a catch-all, which cannot know the path.
	URLAnyPattern string

	Headers  map[string]Matcher
	Query    map[string]Matcher
	Status   int
	JSONBody any
	Body     string
	Priority int
	Metadata map[string]string

	// Transformers are WireMock response transformers. "response-template" lets Body
	// interpolate the request, which is how a rejection can name what it rejected.
	Transformers []string
}

type mapping struct {
	Request  map[string]any    `json:"request"`
	Response map[string]any    `json:"response"`
	Priority int               `json:"priority,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Register creates a mapping and returns its id.
func (c *Client) Register(ctx context.Context, s Stub) (string, error) {
	req := map[string]any{"method": s.Method}
	switch {
	case s.URLAnyPattern != "":
		req["urlPattern"] = s.URLAnyPattern
	case s.URLRe != "":
		req["urlPathPattern"] = s.URLRe
	default:
		req["urlPath"] = s.URLPath
	}
	if len(s.Headers) > 0 {
		req["headers"] = s.Headers
	}
	if len(s.Query) > 0 {
		req["queryParameters"] = s.Query
	}

	status := s.Status
	if status == 0 {
		status = http.StatusOK
	}
	resp := map[string]any{"status": status}
	if s.JSONBody != nil {
		resp["jsonBody"] = s.JSONBody
		resp["headers"] = map[string]string{"Content-Type": "application/json"}
	}
	if s.Body != "" {
		resp["body"] = s.Body
	}
	if len(s.Transformers) > 0 {
		resp["transformers"] = s.Transformers
	}

	var out struct {
		ID string `json:"id"`
	}
	if err := c.do(ctx, http.MethodPost, "/mappings", mapping{
		Request: req, Response: resp, Priority: s.Priority, Metadata: s.Metadata,
	}, &out); err != nil {
		return "", err
	}
	return out.ID, nil
}

// RemoveByMetadata deletes every mapping carrying the given metadata.
//
// This is what metadata is for. It cannot isolate request matching, only cleanup.
func (c *Client) RemoveByMetadata(ctx context.Context, key, value string) error {
	return c.do(ctx, http.MethodPost, "/mappings/remove-by-metadata", map[string]any{
		"matchesJsonPath": fmt.Sprintf("$.%s", key),
		"equalToJson":     fmt.Sprintf(`{"%s":"%s"}`, key, value),
	}, nil)
}

// Requests returns journal entries matching a criteria document.
//
// Always filtered. The journal is global and shared by every tenant, and
// resetRequests must never be called because it would destroy another tenant's
// evidence mid-run.
func (c *Client) Requests(ctx context.Context, criteria map[string]any) (int, error) {
	var out struct {
		Requests []json.RawMessage `json:"requests"`
	}
	if err := c.do(ctx, http.MethodPost, "/requests/find", criteria, &out); err != nil {
		return 0, err
	}
	return len(out.Requests), nil
}

func (c *Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		buf, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("wiremock: %s %s: %w", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("wiremock: %s %s returned %d: %s", method, path, resp.StatusCode, raw)
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

// NewAdminClient returns a client for this WireMock. Always External: the Go test
// process talks to the admin API, not a container.
func (h *Handle) NewAdminClient() *Client { return NewClient(h.AdminURL(infra.External)) }

// PriorityDenyAll is below every stub a test registers, so the catch-all only wins
// when nothing else matched. WireMock reads a lower number as higher priority.
const PriorityDenyAll = 100

// MetadataDenyAll tags the catch-all, so the journal can be asked what went
// unstubbed.
const MetadataDenyAll = "harness-deny-all"

// DenyUnstubbed makes an outbound call nothing stubbed fail loudly.
//
// Browser proxying forwards anything it has no mapping for to the real host, so
// without this the suite silently reaches the internet: a test that forgets a stub
// passes against the live API, and a container phones home at boot. Neither is
// acceptable in a suite that has to be hermetic and parallel.
//
// 501 rather than a connection error, because a refused connection reads to the
// application as a network blip and is often retried.
func (c *Client) DenyUnstubbed(ctx context.Context) error {
	_, err := c.Register(ctx, Stub{
		Method:        "ANY",
		URLAnyPattern: ".*",
		Status:        http.StatusNotImplemented,
		// Composed from the parts rather than {{request.absoluteUrl}}, which renders
		// empty for a proxied request even though the journal records it correctly.
		Body: "The harness has no stub for {{request.method}} " +
			"{{request.scheme}}://{{request.host}}{{request.url}}\n" +
			"Register one with conn.Stub(t), or add the host to the provider registry.\n",
		Transformers: []string{"response-template"},
		Priority:     PriorityDenyAll,
		Metadata:     map[string]string{"harness": MetadataDenyAll},
	})
	return err
}

// Unstubbed returns the outbound calls that reached the catch-all, newest first.
//
// What to print when a test fails having forgotten a stub: the journal knows the
// exact URL, and the application's own error rarely carries it.
func (c *Client) Unstubbed(ctx context.Context) ([]string, error) {
	var out struct {
		Requests []struct {
			Request struct {
				Method      string `json:"method"`
				AbsoluteURL string `json:"absoluteUrl"`
			} `json:"request"`
			StubMapping struct {
				Metadata map[string]string `json:"metadata"`
			} `json:"stubMapping"`
		} `json:"requests"`
	}
	if err := c.do(ctx, http.MethodGet, "/requests?limit=200", nil, &out); err != nil {
		return nil, err
	}

	var calls []string
	for _, r := range out.Requests {
		if r.StubMapping.Metadata["harness"] == MetadataDenyAll {
			calls = append(calls, r.Request.Method+" "+r.Request.AbsoluteURL)
		}
	}
	return calls, nil
}
