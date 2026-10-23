package infra

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

type fakeModule struct {
	key      ModuleKey
	requires []ModuleKey
}

func (f fakeModule) Key() ModuleKey { return f.key }
func (f fakeModule) Name() NameParts {
	return NameParts{Module: string(f.key)}
}
func (f fakeModule) Requires() []ModuleKey { return f.requires }
func (f fakeModule) Start(context.Context, Deps) (Handle, error) {
	return nil, nil
}

func mods(m ...Module) []Module { return m }

func TestResolve(t *testing.T) {
	t.Parallel()

	t.Run("should order dependencies before dependents", func(t *testing.T) {
		t.Parallel()

		// Action
		plan, err := Resolve(
			mods(
				fakeModule{key: "infisical", requires: []ModuleKey{"postgres", "redis"}},
				fakeModule{key: "postgres"},
				fakeModule{key: "redis"},
			),
			map[ModuleKey]Scope{"infisical": Shared, "postgres": Shared, "redis": Shared},
		)

		// Assert
		require.NoError(t, err)
		got := keysOf(plan.Modules())
		require.Equal(t, ModuleKey("infisical"), got[len(got)-1], "infisical must start last")
	})

	t.Run("should fail before any container starts when a required dependency is missing", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(fakeModule{key: "infisical", requires: []ModuleKey{"postgres"}}),
			map[ModuleKey]Scope{"infisical": Shared},
		)

		// Assert
		require.ErrorContains(t, err, "requires postgres")
	})

	t.Run("should refuse a module that depends on something shorter lived", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A shared container reads its configuration once at start, so it cannot
			point at a package-scoped one that dies when that package finishes.`)

		// Action
		_, err := Resolve(
			mods(
				fakeModule{key: "infisical", requires: []ModuleKey{"fakenet"}},
				fakeModule{key: "fakenet"},
			),
			map[ModuleKey]Scope{"infisical": Shared, "fakenet": Package},
		)

		// Assert
		require.Error(t, err)
		for _, want := range []string{"infisical is shared-scoped", "fakenet which is pkg-scoped", "Either widen"} {
			require.ErrorContains(t, err, want)
		}
	})

	t.Run("should allow a package-scoped module to depend on a shared one", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(
				fakeModule{key: "infisical", requires: []ModuleKey{"fakenet"}},
				fakeModule{key: "fakenet"},
			),
			map[ModuleKey]Scope{"infisical": Package, "fakenet": Shared},
		)

		// Assert
		require.NoError(t, err)
	})

	t.Run("should point at Named when the same module is declared twice", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(fakeModule{key: "postgres"}, fakeModule{key: "postgres"}),
			map[ModuleKey]Scope{"postgres": Shared},
		)

		// Assert
		require.ErrorContains(t, err, "Named()")
	})

	t.Run("should report a dependency cycle", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(
				fakeModule{key: "a", requires: []ModuleKey{"b"}},
				fakeModule{key: "b", requires: []ModuleKey{"a"}},
			),
			map[ModuleKey]Scope{"a": Shared, "b": Shared},
		)

		// Assert
		require.ErrorContains(t, err, "cycle")
	})
}

func TestDepsGet(t *testing.T) {
	t.Parallel()

	type pgHandle struct{ Handle }
	deps := Deps{handles: map[ModuleKey]Handle{"postgres": pgHandle{}}}

	t.Run("should return a declared module typed", func(t *testing.T) {
		t.Parallel()
		_, ok := deps.Get[pgHandle]("postgres")
		require.True(t, ok)
	})

	t.Run("should report false rather than panic when a module is absent", func(t *testing.T) {
		t.Parallel()
		_, ok := deps.Get[pgHandle]("redis")
		require.False(t, ok)
	})
}

func keysOf(ms []Module) []ModuleKey {
	out := make([]ModuleKey, len(ms))
	for i, m := range ms {
		out[i] = m.Key()
	}
	return out
}
