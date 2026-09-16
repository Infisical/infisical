package infra

import (
	"testing"

	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestContainerName(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name string
		in   NameParts
		want string
	}{
		{
			name: "ok/shared module has no scope id",
			in:   NameParts{Scope: Shared, Module: "postgres"},
			want: "inf-shared-postgres",
		},
		{
			name: "ok/a Named instance is distinct from the default",
			in:   NameParts{Scope: Shared, Module: "postgres", Instance: "rotation"},
			want: "inf-shared-postgres-rotation",
		},
		{
			name: "ok/infisical carries its image id",
			in:   NameParts{Scope: Shared, Module: "infisical", Fingerprint: "9f8e7d6c"},
			want: "inf-shared-infisical-9f8e7d6c",
		},
		{
			name: "ok/package scope is qualified by package path",
			in:   NameParts{Scope: Package, ScopeID: "suites/instance", Module: "postgres"},
			want: "inf-pkg-suites-instance-postgres",
		},
		{
			name: "ok/test scope carries a unique id",
			in:   NameParts{Scope: Test, ScopeID: "a1b2", Module: "infisical"},
			want: "inf-test-a1b2-infisical",
		},
		{
			name: "ok/unsafe characters fold to hyphens",
			in:   NameParts{Scope: Package, ScopeID: "Suites/PKI v2", Module: "postgres"},
			want: "inf-pkg-suites-pki-v2-postgres",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := ContainerName(tc.in); got != tc.want {
				t.Fatalf("ContainerName() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestContainerName_ScopesDoNotCollide(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Names are identity under adopt-or-create. If a Package-scoped container can
		land on the same name as a Shared one, an Isolated suite silently adopts the shared
		stack and stops being isolated, which is the one thing it exists to guarantee.`)

	postgres := func(s Scope, id string) string {
		return ContainerName(NameParts{Scope: s, ScopeID: id, Module: "postgres"})
	}

	shared := postgres(Shared, "")
	pkgA := postgres(Package, "suites/instance")
	pkgB := postgres(Package, "suites/sso")

	for _, pair := range [][2]string{{shared, pkgA}, {shared, pkgB}, {pkgA, pkgB}} {
		if pair[0] == pair[1] {
			t.Errorf("names collide: %q", pair[0])
		}
	}
}
