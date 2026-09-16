package infisical

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Infisical/infisical/tests/clients/api"
)

// userAgent is sent on every request.
//
// Not cosmetic: completeAccount rejects a request without one, so a missing header
// surfaces as an opaque 500 from a route that looks unrelated to headers.
const userAgent = "infisical-harness"

// NewClient builds an API client for one principal.
//
// Every call the harness makes goes through this, including its own bootstrap. There
// is no hand-written HTTP path: a route the generated client cannot reach is a route
// missing an operationId, and the fix is upstream in the router rather than an
// escape hatch here.
func NewClient(baseURL string, editors ...api.RequestEditorFn) (*api.ClientWithResponses, error) {
	opts := []api.ClientOption{
		api.WithRequestEditorFn(func(_ context.Context, req *http.Request) error {
			req.Header.Set("User-Agent", userAgent)
			return nil
		}),
	}
	for _, e := range editors {
		opts = append(opts, api.WithRequestEditorFn(e))
	}

	c, err := api.NewClientWithResponses(baseURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("infisical: building API client for %s: %w", baseURL, err)
	}
	return c, nil
}

// BearerAuth attaches a token to every request.
func BearerAuth(token string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.Header.Set("Authorization", "Bearer "+token)
		return nil
	}
}

// apiError renders a non-2xx response in a form worth reading.
//
// The generated client surfaces a status and a raw body; without this, a failure
// reads as "expected 200, got 400" with the reason left in a byte slice nobody prints.
func apiError(what string, status int, body []byte) error {
	const max = 400
	msg := string(body)
	if len(msg) > max {
		msg = msg[:max] + "..."
	}
	return fmt.Errorf("infisical: %s returned %d: %s", what, status, msg)
}
