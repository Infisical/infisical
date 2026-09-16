// Package infisical runs the application under test.
//
// This is the one module that knows what Infisical is. Everything it needs from the
// product is a Docker image, a set of environment variables, and the OpenAPI spec,
// which is the whole contract that lets the suite survive a reimplementation.
package infisical

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/tests/harness/license"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/mailpit"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/infra/redis"
	"github.com/Infisical/infisical/tests/infra/wiremock"
)

const (
	Key = infra.Key("infisical")

	// backend/Dockerfile: ENV HOST=0.0.0.0, EXPOSE 4000. The standalone image uses
	// 8080; this is not that image.
	port = 4000

	// Fixed, never generated per process.
	//
	// A container is adopted by name, so a second test binary inherits whatever the
	// first one started. If these varied, that binary would mint tokens under a
	// different AUTH_SECRET than the running server validates with, and every
	// request would fail authentication for no visible reason.
	//
	// 32 hex characters, which is the non-FIPS form. The base64 value in
	// docker-compose.test.yml is the FIPS root-key variant and is not interchangeable.
	authSecret    = "4bnfe4e407b8921c104518903515b218"
	encryptionKey = "6c1fe4e407b8911c104518103505b218"
)

type module struct {
	image    Image
	env      map[string]string
	runModes string
}

type Option func(*module)

// WithImage pins the image instead of resolving one.
func WithImage(img Image) Option { return func(m *module) { m.image = img } }

// WithEnv overrides or adds an environment variable.
func WithEnv(k, v string) Option { return func(m *module) { m.env[k] = v } }

// WithRunModes sets INFISICAL_RUN_MODES. A pod that does not include "api" serves
// /api/status and no product routes, which is a thing worth asserting.
func WithRunModes(modes string) Option { return func(m *module) { m.runModes = modes } }

func Module(opts ...Option) infra.Module {
	m := &module{env: map[string]string{}}
	for _, o := range opts {
		o(m)
	}
	return m
}

func (m *module) Key() infra.Key { return Key }

// Requires is the hard floor. env.ts enforces Redis with a zod refine, and the
// database URI has a default that resolves to a literal "undefined" host, so both
// fail at connect time rather than parse time if absent.
func (m *module) Requires() []infra.Key { return []infra.Key{postgres.Key, redis.Key} }

// Optional is consumed if declared. SMTP is what makes user creation possible at
// all; WireMock is what makes outbound calls and entitlements controllable.
func (m *module) Optional() []infra.Key { return []infra.Key{mailpit.Key, wiremock.Key} }

func (m *module) Name() infra.NameParts {
	return infra.NameParts{Module: "infisical", Fingerprint: m.image.ShortID()}
}

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	if m.image.Ref == "" {
		return nil, fmt.Errorf("infisical: no image; pass WithImage(ResolveImage(...))")
	}

	self := d.ContainerName()
	env := map[string]string{
		"DB_CONNECTION_URI": postgres.MustFrom(d).DSN(infra.Internal),
		"REDIS_URL":         redis.MustFrom(d).URL(infra.Internal),
		"AUTH_SECRET":       authSecret,
		"ENCRYPTION_KEY":    encryptionKey,
		"NODE_ENV":          "production",
		"TELEMETRY_ENABLED": "false",
		// Serve every route and every field at /api/docs/json. The suite generates
		// every call it makes and has no hand-written client to fall back on, so a
		// route missing from the spec is a route no test can reach.
		"OPENAPI_FULL_SPEC": "true",
		"SITE_URL":          fmt.Sprintf("http://%s:%d", self, port),
	}
	if m.runModes != "" {
		env["INFISICAL_RUN_MODES"] = m.runModes
	}

	_, wantSMTP := mailpit.From(d)
	if mp, ok := mailpit.From(d); ok {
		e := mp.Endpoint(infra.Internal)
		env["SMTP_HOST"] = e.Host
		env["SMTP_PORT"] = fmt.Sprint(e.Port)
		env["SMTP_FROM_ADDRESS"] = "harness@infisical.test"
		env["SMTP_FROM_NAME"] = "Infisical Harness"
		// SMTP_REQUIRE_TLS defaults to true in env.ts. Against Mailpit that is the
		// usual reason a first attempt silently sends nothing.
		env["SMTP_REQUIRE_TLS"] = "false"
	}

	if wm, ok := wiremock.From(d); ok {
		proxy := wm.ProxyURL(infra.Internal)
		env["HTTP_PROXY"] = proxy
		env["HTTPS_PROXY"] = proxy
		env["NO_PROXY"] = wiremock.NoProxy(postgres.MustFrom(d).Endpoint(infra.Internal).Host,
			redis.MustFrom(d).Endpoint(infra.Internal).Host)
		env["NODE_EXTRA_CA_CERTS"] = wiremock.CAPath

		// Point the license client at the same WireMock, which is what makes
		// entitlements resolve per organization. Without this the instance is not
		// Cloud, and getPlan short-circuits to one instance-wide feature set for
		// every tenant.
		for k, v := range license.Env(wm) {
			env[k] = v
		}
	}

	for k, v := range m.env {
		env[k] = v
	}

	c, err := d.Run(ctx, infra.ContainerSpec{
		Image: m.image.Ref,
		Env:   env,
		Ports: []int{port},
		// /api/status is registered before the run-mode guard, so it answers even on
		// a pod that serves no product routes. It also reports emailConfigured and
		// redisConfigured, which the harness asserts so a misconfigured SMTP is a
		// boot failure rather than a mysterious timeout twenty tests later.
		Ready: readyStrategy(),
		Check: checkStatus(wantSMTP),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c, image: m.image}, nil
}

// Handle is a running Infisical.
type Handle struct {
	c     infra.Container
	image Image
}

func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, port) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }
func (h *Handle) Image() Image                         { return h.image }

// BaseURL is the API root. Almost always External: the Go test process calls it.
func (h *Handle) BaseURL(m infra.Mode) string { return h.Endpoint(m).URL("http") }

// Logs is what a failure dumps. Under a Shared profile one instance serves every
// parallel tenant, so a caller filters by org id rather than printing all of it.
func (h *Handle) Logs(ctx context.Context) (string, error) { return h.c.Logs(ctx) }

func From(d infra.Deps) (*Handle, bool) { return d.Get[*Handle](Key) }

// Status is the part of GET /api/status the harness cares about.
type Status struct {
	EmailConfigured bool
	RedisConfigured bool
	SignupAllowed   bool
}

// Status reads GET /api/status, for instance-wide configuration no other response
// exposes.
func (h *Handle) Status(ctx context.Context) (Status, error) {
	c, err := NewClient(h.BaseURL(infra.External))
	if err != nil {
		return Status{}, err
	}
	res, err := c.GetServerStatusWithResponse(ctx)
	if err != nil {
		return Status{}, fmt.Errorf("infisical: reading status: %w", err)
	}
	if res.JSON200 == nil {
		return Status{}, apiError("status", res.StatusCode(), res.Body)
	}
	return Status{
		EmailConfigured: deref(res.JSON200.EmailConfigured),
		RedisConfigured: deref(res.JSON200.RedisConfigured),
		SignupAllowed:   deref(res.JSON200.InviteOnlySignup),
	}, nil
}

func deref(b *bool) bool { return b != nil && *b }
