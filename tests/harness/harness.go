// Package harness runs Infisical for a test suite.
//
// A test package declares a profile and nothing else:
//
//	func TestMain(m *testing.M) { harness.Main(m, harness.Shared) }
//
// Everything below that line -- container lifetimes, adopt-or-create, the network,
// bootstrap, entitlements -- is implementation a test never names.
package harness

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/harness/license"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/wiremock"
)

// current is the stack Main built, read by From. One per test binary, which is what
// a package-level variable is for.
var current *Stack

// Stack is a running Infisical and everything around it.
type Stack struct {
	profile  Profile
	modules  map[infra.Key]infra.Handle
	log      infra.Logger
	pkg      string
	mainFile string

	app     *infisical.Handle
	root    infisical.Root
	license *license.Server

	adminOnce     sync.Once
	instanceAdmin *Principal
}

// Option adjusts what Main brings up.
type Option func(*config)

type config struct {
	extra []infra.Module
	plan  license.Plan
}

// WithInfra adds a container the harness does not know about, for a suite that needs
// one: Pebble for ACME, a target database for rotation.
func WithInfra(mods ...infra.Module) Option {
	return func(c *config) { c.extra = append(c.extra, mods...) }
}

// WithDefaultPlan sets the entitlements a tenant gets unless it asks for others.
func WithDefaultPlan(p license.Plan) Option {
	return func(c *config) { c.plan = p }
}

// Main brings the stack up, runs the package's tests, and tears down what it owns.
//
// It calls os.Exit, so it never returns.
func Main(m *testing.M, profile Profile, opts ...Option) {
	cfg := &config{plan: license.Enterprise()}
	for _, o := range opts {
		o(cfg)
	}

	_, file, _, _ := runtime.Caller(1)
	code, err := run(m, profile, cfg, file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "harness: %v\n", err)
		os.Exit(1)
	}
	os.Exit(code)
}

func run(m *testing.M, profile Profile, cfg *config, mainFile string) (int, error) {
	ctx := context.Background()

	stack, owned, err := bringUp(ctx, profile, cfg, packageNameFor(mainFile))
	if err != nil {
		return 0, err
	}
	defer stopAll(ctx, owned)

	stack.mainFile = mainFile
	current = stack
	return m.Run(), nil
}

// Up brings up the shared stack without running anything.
//
// `inf up` uses it to pre-warm, so the test binaries in a run adopt one instance
// instead of racing to create it. Everything it starts is shared, so nothing here
// owns a container: only `inf down` stops them.
func Up(ctx context.Context) error {
	_, owned, err := bringUp(ctx, Shared, &config{plan: license.Enterprise()}, "")
	if err != nil {
		return err
	}
	if len(owned) > 0 {
		return fmt.Errorf("harness: Up started %d package-scoped containers, which it cannot own", len(owned))
	}
	return nil
}

// bringUp starts the modules a profile asks for and prepares the instance.
//
// Returns the handles this caller owns, which is only ever the package-scoped ones.
// Shared containers deliberately outlive the run so a second `go test` adopts them.
func bringUp(ctx context.Context, profile Profile, cfg *config, pkg string) (*Stack, []infra.Handle, error) {
	log := infra.NewLogger()

	root, err := infra.RepoRoot()
	if err != nil {
		return nil, nil, err
	}
	img, err := infisical.ResolveImage(ctx, root, log)
	if err != nil {
		return nil, nil, err
	}

	mods, scopes := profile.modules(img, cfg.extra...)
	plan, err := infra.Resolve(mods, scopes)
	if err != nil {
		return nil, nil, err
	}

	runner := infra.NewRunner(infra.Workspace(), log)
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		return nil, nil, err
	}

	handles := map[infra.Key]infra.Handle{}
	var owned []infra.Handle

	for _, mod := range plan.Modules() {
		scope := plan.Scope(mod.Key())
		name := mod.Name()
		name.Scope = scope
		if scope == infra.Package {
			name.ScopeID = pkg
		}

		h, err := mod.Start(ctx, infra.NewDeps(handles, infra.NetworkName, infra.Workspace(), name, runner, log))
		if err != nil {
			stopAll(ctx, owned)
			return nil, nil, err
		}
		handles[mod.Key()] = h
		if scope != infra.Shared {
			owned = append(owned, h)
		}
	}

	app := handles[infisical.Key].(*infisical.Handle)
	stack := &Stack{profile: profile, modules: handles, log: log, pkg: pkg, app: app}

	if wm, ok := handles[wiremock.Key].(*wiremock.Handle); ok {
		stack.license = license.New(wm)
		if err := stack.license.InstallFallback(ctx, cfg.plan); err != nil {
			stopAll(ctx, owned)
			return nil, nil, err
		}
	}

	if stack.root, err = infisical.Bootstrap(ctx, app.BaseURL(infra.External)); err != nil {
		stopAll(ctx, owned)
		return nil, nil, err
	}
	return stack, owned, nil
}

func stopAll(ctx context.Context, handles []infra.Handle) {
	for i := len(handles) - 1; i >= 0; i-- {
		_ = handles[i].Stop(context.WithoutCancel(ctx))
	}
}

// From returns the stack this package's TestMain built.
func From(t *testing.T) *Stack {
	t.Helper()
	if current == nil {
		t.Fatal("harness: no stack. Add a TestMain to this package:\n\n" +
			"\tfunc TestMain(m *testing.M) { harness.Main(m, harness.Shared) }")
	}
	return current
}

// App is the running Infisical.
func (s *Stack) App() *infisical.Handle { return s.app }

// Require returns a module handle, or fails the test naming the option to add.
func (s *Stack) Require(t *testing.T, key infra.Key, option string) infra.Handle {
	t.Helper()
	h, ok := s.modules[key]
	if !ok {
		t.Fatalf("%s: this test needs the %q module.\nAdd %s to harness.Main in %s.",
			s.pkg, key, option, filepath.Base(s.mainFile))
	}
	return h
}

// failer is the part of *testing.T a guard needs.
//
// testing.TB cannot be implemented outside the testing package -- it carries an
// unexported method for exactly that reason -- so asserting that a guard fires needs
// a narrower interface of our own.
type failer interface {
	Helper()
	Fatalf(format string, args ...any)
}

// requireIsolated refuses instance-wide access from a Shared package.
func (s *Stack) requireIsolated(f failer) {
	f.Helper()
	if s.profile == Isolated {
		return
	}
	f.Fatalf("%s: InstanceAdmin needs harness.Isolated.\n"+
		"Instance configuration is global, so writing it from a Shared package would "+
		"change the instance every other package is using.\n"+
		"Change TestMain in %s to harness.Main(m, harness.Isolated).",
		s.pkg, filepath.Base(s.mainFile))
}

// packageNameFor derives a container-name fragment from the TestMain file, so an
// Isolated package's containers cannot be adopted by a different one.
func packageNameFor(mainFile string) string {
	root, err := infra.RepoRoot()
	if err != nil {
		return infra.Sanitize(filepath.Base(filepath.Dir(mainFile)))
	}
	dir := filepath.Dir(mainFile)
	if rel, err := filepath.Rel(filepath.Join(root, "tests"), dir); err == nil {
		return infra.Sanitize(rel)
	}
	return infra.Sanitize(strings.TrimPrefix(dir, root))
}

// InstanceAdmin returns a principal that passes verifySuperAdmin.
//
// Only under Isolated. Instance configuration is global: a Shared-profile test that
// disabled signup or changed the encryption strategy would break every other package
// adopting the same container, and it would break them somewhere else, later, in a
// test that looks unrelated. Isolated gives the package its own instance, so the
// blast radius is the package.
//
// Prefers the bootstrap identity, which carries no user-level state a test could
// corrupt. An adopted instance cannot produce one -- the client secret is shown once,
// by the process that bootstrapped -- so there it falls back to the root user, who is
// a super admin in their own right (super-admin-fns.ts accepts either).
func (s *Stack) InstanceAdmin(t *testing.T) *Principal {
	t.Helper()
	s.requireIsolated(t)

	s.adminOnce.Do(func() {
		ip := newIP()
		token := s.root.IdentityToken
		if token == "" {
			token = s.rootToken(t, ip)
		}
		s.instanceAdmin = &Principal{
			Kind:  Identity,
			ID:    s.root.IdentityID,
			Name:  "instance-admin",
			Token: token,
			API:   s.client(t, token, ip),
			ip:    ip,
		}
		if s.root.IdentityToken == "" {
			s.instanceAdmin.Kind = User
			s.instanceAdmin.ID = s.root.UserID
			s.instanceAdmin.Email = s.root.Email
		}
	})
	return s.instanceAdmin
}
