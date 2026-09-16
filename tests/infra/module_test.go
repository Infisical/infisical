package infra

import (
	"context"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/internal/spec"
)

type fakeModule struct {
	key      Key
	requires []Key
	optional []Key
}

func (f fakeModule) Key() Key { return f.key }
func (f fakeModule) Name() NameParts {
	return NameParts{Module: string(f.key)}
}
func (f fakeModule) Requires() []Key { return f.requires }
func (f fakeModule) Optional() []Key { return f.optional }
func (f fakeModule) Start(context.Context, Deps) (Handle, error) {
	return nil, nil
}

func mods(m ...Module) []Module { return m }

func TestResolve(t *testing.T) {
	t.Parallel()

	t.Run("ok/orders dependencies before dependents", func(t *testing.T) {
		t.Parallel()
		plan, err := Resolve(
			mods(
				fakeModule{key: "infisical", requires: []Key{"postgres", "redis"}},
				fakeModule{key: "postgres"},
				fakeModule{key: "redis"},
			),
			map[Key]Scope{"infisical": Shared, "postgres": Shared, "redis": Shared},
		)
		if err != nil {
			t.Fatalf("Resolve() = %v", err)
		}
		got := keysOf(plan.Modules())
		if got[len(got)-1] != "infisical" {
			t.Fatalf("infisical must start last, got order %v", got)
		}
	})

	t.Run("ok/an optional dependency that is absent is not an error", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Infisical consumes wiremock and smtp if present and ignores them if not,
			which is what lets a suite opt out of stubbing without a second code path.`)

		_, err := Resolve(
			mods(fakeModule{key: "infisical", optional: []Key{"wiremock"}}),
			map[Key]Scope{"infisical": Shared},
		)
		if err != nil {
			t.Fatalf("Resolve() = %v", err)
		}
	})

	t.Run("invalid/a missing required dependency names the fix", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `This has to fail before any container starts. Otherwise it surfaces as a
			connection timeout ninety seconds later, pointing at the wrong thing.`)

		_, err := Resolve(
			mods(fakeModule{key: "infisical", requires: []Key{"postgres"}}),
			map[Key]Scope{"infisical": Shared},
		)
		if err == nil {
			t.Fatal("expected an error")
		}
		if !strings.Contains(err.Error(), "requires postgres") {
			t.Fatalf("error should name the missing module, got: %v", err)
		}
	})

	t.Run("invalid/a module may not depend on something shorter lived", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A Shared Infisical takes HTTP_PROXY at container start. Pointing it at a
			Package-scoped WireMock breaks every other package the moment that one finishes.
			This is the shape the first draft of the design had, which is why it is checked.`)

		_, err := Resolve(
			mods(
				fakeModule{key: "infisical", optional: []Key{"wiremock"}},
				fakeModule{key: "wiremock"},
			),
			map[Key]Scope{"infisical": Shared, "wiremock": Package},
		)
		if err == nil {
			t.Fatal("expected an error")
		}
		for _, want := range []string{"infisical is shared-scoped", "wiremock which is pkg-scoped", "Either widen"} {
			if !strings.Contains(err.Error(), want) {
				t.Fatalf("error should contain %q, got: %v", want, err)
			}
		}
	})

	t.Run("ok/a shorter lived module may depend on a longer lived one", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `An Isolated package starts its own Infisical but still adopts the shared
			Mailpit, which is the whole reason mixed scopes inside one package must work.`)

		_, err := Resolve(
			mods(
				fakeModule{key: "infisical", optional: []Key{"mailpit"}},
				fakeModule{key: "mailpit"},
			),
			map[Key]Scope{"infisical": Package, "mailpit": Shared},
		)
		if err != nil {
			t.Fatalf("Resolve() = %v", err)
		}
	})

	t.Run("invalid/the same module declared twice points at Named", func(t *testing.T) {
		t.Parallel()
		_, err := Resolve(
			mods(fakeModule{key: "postgres"}, fakeModule{key: "postgres"}),
			map[Key]Scope{"postgres": Shared},
		)
		if err == nil || !strings.Contains(err.Error(), "Named()") {
			t.Fatalf("error should point at Named(), got: %v", err)
		}
	})

	t.Run("invalid/a dependency cycle is reported with its path", func(t *testing.T) {
		t.Parallel()
		_, err := Resolve(
			mods(
				fakeModule{key: "a", requires: []Key{"b"}},
				fakeModule{key: "b", requires: []Key{"a"}},
			),
			map[Key]Scope{"a": Shared, "b": Shared},
		)
		if err == nil || !strings.Contains(err.Error(), "cycle") {
			t.Fatalf("expected a cycle error, got: %v", err)
		}
	})
}

func TestDepsGet(t *testing.T) {
	t.Parallel()

	type pgHandle struct{ Handle }
	deps := Deps{handles: map[Key]Handle{"postgres": pgHandle{}}}

	t.Run("ok/a declared module comes back typed", func(t *testing.T) {
		t.Parallel()
		if _, ok := deps.Get[pgHandle]("postgres"); !ok {
			t.Fatal("declared module was not found")
		}
	})

	t.Run("notfound/an absent optional module reports false rather than panicking", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Optional dependencies are the whole reason a suite can opt out of WireMock
			or SMTP without a second code path. If an absent one panicked, every consumer would
			need a nil check and the option would stop being optional.`)

		if _, ok := deps.Get[pgHandle]("redis"); ok {
			t.Fatal("absent module reported as present")
		}
	})
}

func keysOf(ms []Module) []Key {
	out := make([]Key, len(ms))
	for i, m := range ms {
		out[i] = m.Key()
	}
	return out
}
