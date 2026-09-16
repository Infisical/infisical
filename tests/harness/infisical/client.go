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

// ForwardedFor gives a caller its own rate-limit bucket.
//
// Only three rate limits are entitlements (read, write, secrets); auth, invite, MFA,
// identity-creation and project-creation are hardcoded and keyed on req.realIp. A
// suite running in parallel shares one source address and burns through
// authRateLimit's 60 per minute in seconds.
//
// Absent TRUSTED_PROXY_CIDRS, fastifyIp runs in legacy mode where the first matching
// forwarded header wins verbatim, so a per-tenant address gives each tenant its own
// bucket and the headroom scales with parallelism instead of being a fixed ceiling.
//
// This is the one place the harness leans on a behaviour a reimplementation might not
// share. If it stops being honoured the limits collapse back to per-process, which is
// slow and flaky rather than wrong, and the fallback is raising them through the
// super-admin API.
func ForwardedFor(ip string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.Header.Set("X-Forwarded-For", ip)
		return nil
	}
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
