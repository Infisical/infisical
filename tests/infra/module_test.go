package infra

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
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

	t.Run("should order dependencies before dependents", func(t *testing.T) {
		t.Parallel()

		// Action
		plan, err := Resolve(
			mods(
				fakeModule{key: "infisical", requires: []Key{"postgres", "redis"}},
				fakeModule{key: "postgres"},
				fakeModule{key: "redis"},
			),
			map[Key]Scope{"infisical": Shared, "postgres": Shared, "redis": Shared},
		)

		// Assert
		require.NoError(t, err)
		got := keysOf(plan.Modules())
		require.Equal(t, Key("infisical"), got[len(got)-1], "infisical must start last")
	})

	t.Run("should accept an optional dependency that is absent", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(fakeModule{key: "infisical", optional: []Key{"fakenet"}}),
			map[Key]Scope{"infisical": Shared},
		)

		// Assert
		require.NoError(t, err)
	})

	t.Run("should fail before any container starts when a required dependency is missing", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(fakeModule{key: "infisical", requires: []Key{"postgres"}}),
			map[Key]Scope{"infisical": Shared},
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
				fakeModule{key: "infisical", optional: []Key{"fakenet"}},
				fakeModule{key: "fakenet"},
			),
			map[Key]Scope{"infisical": Shared, "fakenet": Package},
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
				fakeModule{key: "infisical", optional: []Key{"mailpit"}},
				fakeModule{key: "mailpit"},
			),
			map[Key]Scope{"infisical": Package, "mailpit": Shared},
		)

		// Assert
		require.NoError(t, err)
	})

	t.Run("should point at Named when the same module is declared twice", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(fakeModule{key: "postgres"}, fakeModule{key: "postgres"}),
			map[Key]Scope{"postgres": Shared},
		)

		// Assert
		require.ErrorContains(t, err, "Named()")
	})

	t.Run("should report a dependency cycle", func(t *testing.T) {
		t.Parallel()

		// Action
		_, err := Resolve(
			mods(
				fakeModule{key: "a", requires: []Key{"b"}},
				fakeModule{key: "b", requires: []Key{"a"}},
			),
			map[Key]Scope{"a": Shared, "b": Shared},
		)

		// Assert
		require.ErrorContains(t, err, "cycle")
	})
}

func TestDepsGet(t *testing.T) {
	t.Parallel()

	type pgHandle struct{ Handle }
	deps := Deps{handles: map[Key]Handle{"postgres": pgHandle{}}}

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

func keysOf(ms []Module) []Key {
	out := make([]Key, len(ms))
	for i, m := range ms {
		out[i] = m.Key()
	}
	return out
}
