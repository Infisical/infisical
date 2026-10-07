package harness

import (
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/infra/redis"
)

// Profile is how a package declares what it needs. It is the only thing a TestMain
// says, and it determines the isolation a suite gets.
type Profile int

const (
	// Shared runs against one instance for the whole `go test ./...`, with a fresh
	// organization per test. Every test calls t.Parallel(). This is the default and
	// covers almost everything.
	Shared Profile = iota

	// Isolated gives the package its own instance, so it can write state that is not
	// organization-scoped: super-admin config, login methods, the encryption
	// strategy, run modes. Tests do NOT call t.Parallel(); across packages they still
	// run concurrently, because each test binary gets its own containers.
	Isolated
)

func (p Profile) String() string {
	if p == Isolated {
		return "isolated"
	}
	return "shared"
}

// modules expands a profile into the module set and its lifetimes.
//
// A profile fixes the set completely, and that is load-bearing rather than tidy. A
// shared container is adopted by name and takes its environment at creation, so if
// one package declared WireMock and another did not, whichever started the instance
// first would silently decide whether it runs in cloud mode for everyone.
func (p Profile) modules(img infisical.Image, fnImg fakenet.Image, caFile string, extra ...infra.Module) ([]infra.Module, map[infra.ModuleKey]infra.Scope) {
	own := infra.Shared
	if p == Isolated {
		own = infra.Package
	}

	mods := []infra.Module{
		postgres.Module(),
		redis.Module(),
		fakenet.Module(fakenet.WithImage(fnImg), fakenet.WithCAFile(caFile)),
		infisical.Module(infisical.WithImage(img)),
	}
	scopes := map[infra.ModuleKey]infra.Scope{
		postgres.Key: own,
		redis.Key:    own,
		// Shared even under Isolated: it holds a fixed address on the network, and
		// isolation between tenants is by credential or mail address rather than by
		// server.
		fakenet.Key:   infra.Shared,
		infisical.Key: own,
	}

	for _, m := range extra {
		mods = append(mods, m)
		scopes[m.Key()] = own
	}
	return mods, scopes
}
