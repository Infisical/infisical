package infisical

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Infisical/infisical/tests/infra"
)

// status is the subset of GET /api/status the harness reads.
//
// The route is registered before the run-mode guard, so it answers even on a pod
// serving no product routes. That makes it the right readiness probe in every mode.
type status struct {
	EmailConfigured bool `json:"emailConfigured"`
	RedisConfigured bool `json:"redisConfigured"`
}

// readyStrategy waits for the application to serve /api/status.
//
// Deliberately not a log-line wait. Waiting on log output would couple the harness
// to this implementation's logging format, which is exactly what the suite exists
// not to depend on: a Go reimplementation emits entirely different lines while
// /api/status stays identical. A status route is a contract; a log line is not.
func readyStrategy() infra.Ready {
	return infra.ForHTTP("/api/status").
		WithPort(fmt.Sprintf("%d/tcp", port)).
		WithStatusCodeMatcher(func(code int) bool { return code == http.StatusOK })
}

// checkStatus runs once the application is up and asserts that the optional modules
// actually took effect.
//
// Separate from the wait strategy because a response matcher returns a bool, and the
// whole value here is the message. A silently unconfigured SMTP would otherwise
// surface twenty tests later as an email that never arrives, with nothing pointing
// at the cause.
func checkStatus(wantSMTP bool) func(context.Context, infra.Container) error {
	return func(ctx context.Context, c infra.Container) error {
		url := c.Endpoint(infra.External, port).URL("http") + "/api/status"

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
		if err != nil {
			return fmt.Errorf("reading /api/status: %w", err)
		}
		defer func() { _ = resp.Body.Close() }()

		var s status
		if err := json.NewDecoder(resp.Body).Decode(&s); err != nil {
			return fmt.Errorf("decoding /api/status: %w", err)
		}

		if !s.RedisConfigured {
			return fmt.Errorf("reports redisConfigured=false; REDIS_URL did not take effect")
		}
		if wantSMTP && !s.EmailConfigured {
			return fmt.Errorf("reports emailConfigured=false; SMTP_HOST did not take effect, " +
				"which would otherwise surface later as an email that never arrives")
		}
		return nil
	}
}
