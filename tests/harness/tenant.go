package harness

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/harness/license"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
)

// Tenant is one organization and everything under it. It is the unit of isolation:
// every test gets its own, which is what makes t.Parallel() the default rather than
// the exception.
type Tenant struct {
	OrgID   uuid.UUID
	OrgSlug string

	// Admin is this tenant's own organization administrator, an ordinary user with
	// no super-admin flag: a test cannot reach instance-wide state through it,
	// because the server answers 403.
	//
	// Its own account rather than one shared across tenants. Sharing would save the
	// signup, but revokeAllMySessions deletes by user id alone, so one test changing
	// a password or revoking sessions would log out every tenant running in
	// parallel. A fresh account per tenant keeps that contained.
	Admin *Principal

	// ip is this tenant's rate-limit bucket. See infisical.ForwardedFor.
	ip string

	stack *Stack
	plan  *license.Plan
}

// Kind is what sort of actor a Principal is. Authorization differs by actor type in
// places, and granting project access takes a different route for each, so the
// distinction has to survive into the test.
type Kind int

const (
	User Kind = iota
	Identity
)

func (k Kind) String() string {
	if k == Identity {
		return "identity"
	}
	return "user"
}

// Principal is anything that can authenticate: a user, a machine identity. The shape
// is the same, so a test asserting what an actor may do reads the same whichever it
// holds.
type Principal struct {
	Kind  Kind
	ID    uuid.UUID
	Name  string
	Email string // empty for an identity
	Token string
	API   *api.ClientWithResponses

	// ip is this principal's rate-limit bucket, kept so a later call on its behalf
	// lands in the same one. See infisical.ForwardedFor.
	ip string
}

// Address returns a mailbox inside this tenant's own domain, so two parallel tests
// inviting "alice" never collide.
func (t *Tenant) Address(local string) string {
	return local + "@" + t.OrgSlug + ".test"
}

// TenantOption adjusts a new tenant.
type TenantOption func(*tenantConfig)

type tenantConfig struct {
	name string
	plan *license.Plan
}

// WithTenantName names the organization. Rarely needed: the slug carries a nanoid,
// so names do not have to be unique.
func WithTenantName(name string) TenantOption { return func(c *tenantConfig) { c.name = name } }

// WithPlan gives the tenant entitlements other than the default.
func WithPlan(p license.Plan) TenantOption { return func(c *tenantConfig) { c.plan = &p } }

// NewTenant creates an organization with its own administrator.
//
// The instance root has to do the creating: POST /api/v2/organizations refuses any
// actor that is not a USER, so the bootstrap identity token cannot mint tenants and
// the root password is the only thing that can. That password stays inside the
// harness; what a test gets back is an ordinary org admin.
//
// One login, not two. Every round trip here comes out of authRateLimit's 60 per
// minute, which is not an entitlement and cannot be raised through the plan.
func (s *Stack) NewTenant(t *testing.T, opts ...TenantOption) *Tenant {
	t.Helper()
	ctx := t.Context()

	cfg := tenantConfig{name: "t-" + strings.ToLower(uuid.NewString()[:8])}
	for _, o := range opts {
		o(&cfg)
	}

	ip := newIP()
	rootUnscoped := s.rootToken(t, ip)

	created, err := s.client(t, rootUnscoped, ip).CreateOrganizationWithResponse(ctx,
		api.CreateOrganizationJSONRequestBody{Name: cfg.name})
	if err != nil {
		t.Fatalf("harness: creating an organization: %v", err)
	}
	if created.JSON200 == nil {
		t.Fatalf("harness: creating an organization returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
	}

	org := created.JSON200.Organization
	tenant := &Tenant{OrgID: org.Id, OrgSlug: org.Slug, ip: ip, stack: s, plan: cfg.plan}

	// The root binds itself to the new organization only to invite its administrator,
	// and its token goes no further than this function. What a test receives is an
	// ordinary user at admin@<orgslug>.test, unique to this tenant.
	rootScoped := s.scopeToOrg(t, rootUnscoped, org.Id, ip)
	tenant.Admin = tenant.newUser(t, principalConfig{name: "admin", orgRole: "admin"}, rootScoped)

	if cfg.plan != nil {
		tenant.SetPlan(t, *cfg.plan)
	}

	t.Cleanup(tenant.remove)
	return tenant
}

// SetPlan changes this tenant's entitlements, and proves the change took effect.
//
// A stub on its own does nothing: getPlan caches per organization in Redis for 900
// seconds. Verify reads the plan back with refreshCache=true, which busts that cache
// through the API and asserts the stub produced what was asked for in one call.
func (t *Tenant) SetPlan(tt *testing.T, p license.Plan) {
	tt.Helper()
	if t.stack.license == nil {
		tt.Fatalf("%s: SetPlan needs the license stub, which needs WireMock", t.stack.pkg)
	}
	if err := t.stack.license.SetOrgPlan(tt.Context(), t.OrgID.String(), p); err != nil {
		tt.Fatalf("harness: %v", err)
	}
	t.plan = &p
	t.Verify(tt, p)
}

// Verify reads the resolved plan back and fails if it is not what was asked for.
//
// The stub speaks License Server keys while the plan speaks TFeatureSet fields, and
// feature-mapping.ts warns that a wrong key means the feature is never projected.
// That failure is silent: it surfaces later as a 403 in a test that looks unrelated
// to licensing. This turns it into a failure at tenant creation, naming the field.
func (t *Tenant) Verify(tt *testing.T, want license.Plan) {
	tt.Helper()

	res, err := t.Admin.API.GetOrganizationPlanWithResponse(tt.Context(), t.OrgID.String(),
		&api.GetOrganizationPlanParams{RefreshCache: refreshCache()})
	if err != nil {
		tt.Fatalf("harness: reading the plan back: %v", err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("harness: reading the plan back returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}

	got, ok := res.JSON200.Plan.(map[string]any)
	if !ok {
		tt.Fatalf("harness: plan came back as %T, not an object", res.JSON200.Plan)
	}
	for field, expected := range want.Expect() {
		if !planMatches(lookup(got, field), expected) {
			tt.Fatalf("tenant %s: asked for %s=%v, the instance resolved %v.\n"+
				"Likely a wrong License Server feature key; see "+
				"backend/src/services/license-client/feature-mapping.ts",
				t.OrgSlug, field, expected, lookup(got, field))
		}
	}
}

// lookup resolves a TFeatureSet field, which may be nested.
//
// feature-mapping.ts records the target as a dotted path for nested fields, and the
// rate limits are what use it: "rateLimits.readLimit" is an object member, not a key
// containing a dot.
func lookup(plan map[string]any, field string) any {
	var current any = plan
	for _, part := range strings.Split(field, ".") {
		obj, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = obj[part]
	}
	return current
}

// planMatches compares loosely on purpose: JSON numbers arrive as float64, so a cap
// entitled as 1000000 comes back as 1e+06.
func planMatches(got, want any) bool {
	if g, ok := got.(float64); ok {
		if w, ok := toFloat(want); ok {
			return g == w
		}
	}
	return got == want
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}

// rootToken logs in as the instance root and returns an unscoped token.
//
// Unexported: the root is shared by every tenant, so a test holding it could change a
// password or revoke a session and break every parallel test on the instance.
func (s *Stack) rootToken(t *testing.T, ip string) string {
	t.Helper()
	anon, err := infisical.NewClient(s.app.BaseURL(infra.External), infisical.ForwardedFor(ip))
	if err != nil {
		t.Fatalf("harness: %v", err)
	}
	res, err := anon.LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
		Email:    s.root.Email,
		Password: s.root.Password,
	})
	if err != nil {
		t.Fatalf("harness: logging in as the instance root: %v", err)
	}
	if res.JSON200 == nil {
		t.Fatalf("harness: logging in as the instance root returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	return res.JSON200.AccessToken
}

// scopeToOrg binds an unscoped session to one organization.
//
// A login token carries no organization; selectOrganization is what binds it, and
// every org-scoped route needs that binding.
// It is also what accepts a pending invitation: selectOrganization promotes an
// Invited membership to Accepted, so an invited user is not really a member until
// this runs.
func (s *Stack) scopeToOrg(t *testing.T, unscoped string, orgID uuid.UUID, ip string) string {
	t.Helper()

	res, err := s.client(t, unscoped, ip).SelectOrganizationV3WithResponse(t.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgID.String()})
	if err != nil {
		t.Fatalf("harness: selecting the organization: %v", err)
	}
	if res.JSON200 == nil {
		t.Fatalf("harness: selecting the organization returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	return res.JSON200.Token
}

// Client builds an API client for a token, on this tenant's rate-limit bucket.
//
// The only way a fixture package should obtain a client. Building one directly
// loses the tenant's X-Forwarded-For address, and the calls then draw down whatever
// bucket the default source address lands in -- which is shared with every other
// test, so the symptom is a 429 somewhere unrelated.
func (t *Tenant) Client(tt *testing.T, token string) *api.ClientWithResponses {
	tt.Helper()
	return t.stack.client(tt, token, t.ip)
}

// Module returns a container handle, or fails the test naming the profile to use.
//
// A fixture that stubs or reads mail needs this; option is what to put in TestMain.
func (t *Tenant) Module(tt *testing.T, key infra.Key, option string) infra.Handle {
	tt.Helper()
	return t.stack.Require(tt, key, option)
}

// client builds an API client carrying a token and a rate-limit bucket.
func (s *Stack) client(t *testing.T, token, ip string) *api.ClientWithResponses {
	t.Helper()
	c, err := infisical.NewClient(s.app.BaseURL(infra.External),
		infisical.BearerAuth(token), infisical.ForwardedFor(ip))
	if err != nil {
		t.Fatalf("harness: %v", err)
	}
	return c
}

// newIP is a source address for one caller, so nobody's requests can exhaust anyone
// else's rate-limit budget. Tenants get one; so does every principal, because the
// invite that creates a user runs into smtpRateLimit's two per forty seconds.
//
// RFC 1918 space, so a value can never collide with a real address.
func newIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

// remove deletes the organization. Best effort and never fails a test: the org is
// disposable, and a leaked one cannot affect another test because nothing outside it
// can see it.
func (t *Tenant) remove() {
	ctx := context.WithoutCancel(context.Background())
	res, err := t.Admin.API.DeleteOrganizationWithResponse(ctx, t.OrgID.String())
	if err != nil || res.StatusCode() != http.StatusOK {
		t.stack.log.Infof("tenant %s could not be deleted, leaving it", t.OrgSlug)
	}
}

func refreshCache() *api.GetOrganizationPlanParamsRefreshCache {
	v := api.GetOrganizationPlanParamsRefreshCache("true")
	return &v
}
