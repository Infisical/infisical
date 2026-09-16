package harness

import (
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/mailpit"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/infra/redis"
	"github.com/Infisical/infisical/tests/infra/wiremock"
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
//
// Mailpit stays shared even under Isolated: it holds no instance state, isolation
// between tenants is by address, and a second one buys nothing.
func (p Profile) modules(img infisical.Image, extra ...infra.Module) ([]infra.Module, map[infra.Key]infra.Scope) {
	own := infra.Shared
	if p == Isolated {
		own = infra.Package
	}

	mods := []infra.Module{
		postgres.Module(),
		redis.Module(),
		mailpit.Module(),
		wiremock.Module(),
		infisical.Module(infisical.WithImage(img)),
	}
	scopes := map[infra.Key]infra.Scope{
		postgres.Key:  own,
		redis.Key:     own,
		mailpit.Key:   infra.Shared,
		wiremock.Key:  own,
		infisical.Key: own,
	}

	for _, m := range extra {
		mods = append(mods, m)
		scopes[m.Key()] = own
	}
	return mods, scopes
}
