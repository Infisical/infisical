package license

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/wiremock"
)

// Stub priorities. WireMock treats a lower number as higher precedence.
const (
	priorityOrg      = 1  // one organization
	priorityFallback = 10 // any organization
)

// Server stubs the License Server on the shared WireMock.
type Server struct {
	wm *wiremock.Client
}

func New(wm *wiremock.Handle) *Server {
	return &Server{wm: wm.NewAdminClient()}
}

// Env is what the application container needs to talk to the stub instead of the
// real License Server.
func Env(wm *wiremock.Handle) map[string]string {
	return map[string]string{
		// Setting this at all is what makes isCloud true, and Cloud is the only
		// instance type whose getPlan resolves per organization. Every other type
		// short-circuits to one instance-wide feature set, which would make
		// per-tenant entitlements impossible.
		"LICENSE_SERVER_V2_SERVICE_KEY": serviceKey(),
		"LICENSE_SERVER_URL":            wm.ProxyURL(infra.Internal),
	}
}

// InstallFallback answers for any organization.
//
// Registered before the application container starts, and not optional. On any
// failure getPlan writes the OSS defaults into the plan cache for the full TTL
// rather than leaving it empty, so a single unanswered call poisons that org for
// about fifteen minutes.
func (s *Server) InstallFallback(ctx context.Context, p Plan) error {
	if _, err := s.wm.Register(ctx, wiremock.Stub{
		Method:   "GET",
		URLRe:    `/v1/organizations/[^/]+/entitlements`,
		Status:   200,
		JSONBody: p.Payload(),
		Priority: priorityFallback,
		Metadata: map[string]string{"harness": "license-fallback"},
	}); err != nil {
		return fmt.Errorf("license: installing fallback entitlements: %w", err)
	}

	// The usage reporter authenticates against the same server. Nothing asserts on
	// it, but an unanswered call is noise in the logs and a failed request path.
	for _, path := range []string{"/v1/products", "/v1/subscription"} {
		if _, err := s.wm.Register(ctx, wiremock.Stub{
			Method:   "GET",
			URLPath:  path,
			Status:   200,
			JSONBody: map[string]any{},
			Priority: priorityFallback,
			Metadata: map[string]string{"harness": "license-fallback"},
		}); err != nil {
			return fmt.Errorf("license: installing %s: %w", path, err)
		}
	}
	return nil
}

// SetOrgPlan answers for one organization, overriding the fallback.
//
// Stub on the ROOT org id. fetchAndCacheCloudPlan resolves findRootOrgDetails and
// sends the root organization to the license server, so a sub-org resolves its
// parent's plan.
//
// Registering a stub does not by itself change anything: the plan is cached per org
// in Redis for 900 seconds. The caller busts that through the API by reading the
// plan back with refreshCache=true, which is the same call that verifies the stub
// produced what was asked for.
func (s *Server) SetOrgPlan(ctx context.Context, rootOrgID string, p Plan) error {
	if _, err := s.wm.Register(ctx, wiremock.Stub{
		Method:   "GET",
		URLPath:  fmt.Sprintf("/v1/organizations/%s/entitlements", rootOrgID),
		Status:   200,
		JSONBody: p.Payload(),
		Priority: priorityOrg,
		Metadata: map[string]string{"harness": "license-org", "org": rootOrgID},
	}); err != nil {
		return fmt.Errorf("license: stubbing entitlements for org %s: %w", rootOrgID, err)
	}
	return nil
}
