package harness

import (
	"fmt"
	"strings"
	"testing"
)

// recorder stands in for *testing.T so a guard that ends in Fatalf can be asserted on.
//
// Fatalf must not return, or the caller carries on into code the guard was protecting,
// so this panics and the test recovers. That mirrors the real runtime.Goexit closely
// enough for a guard that fails before touching anything else.
type recorder struct{ msg string }

func (r *recorder) Helper() {}
func (r *recorder) Fatalf(format string, args ...any) {
	r.msg = fmt.Sprintf(format, args...)
	panic(r)
}

func (r *recorder) run(f func(failer)) (fired bool, msg string) {
	defer func() {
		if p := recover(); p != nil {
			if p != any(r) {
				panic(p)
			}
			fired, msg = true, r.msg
		}
	}()
	f(r)
	return false, ""
}

func TestRequireIsolated_RefusesShared(t *testing.T) {
	s := &Stack{profile: Shared, pkg: "suites/platform", mainFile: "/repo/tests/suites/platform/main_test.go"}

	fired, msg := new(recorder).run(s.requireIsolated)
	if !fired {
		t.Fatal("a Shared package was allowed instance-wide access")
	}
	for _, want := range []string{"suites/platform", "harness.Isolated", "main_test.go"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message should name %q so the fix is obvious, got:\n%s", want, msg)
		}
	}
}

func TestRequireIsolated_AllowsIsolated(t *testing.T) {
	s := &Stack{profile: Isolated, pkg: "suites/instance"}

	if fired, msg := new(recorder).run(s.requireIsolated); fired {
		t.Fatalf("an Isolated package was refused instance-wide access: %s", msg)
	}
}

func TestPrincipalOptions_RejectedWhereTheyDoNothing(t *testing.T) {
	// The pairs a constructor cannot honour. Accepting one silently would let a test
	// assert against a principal that never got the role it asked for.
	cases := []struct {
		name string
		opt  PrincipalOption
		key  string
	}{
		{"ProjectRole on a tenant-level constructor", ProjectRole("viewer"), "ProjectRole"},
		{"OrgRole on Project.NewIdentity", OrgRole("admin"), "OrgRole"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := newPrincipalConfig("x", []PrincipalOption{tc.opt})

			fired, msg := new(recorder).run(func(f failer) {
				cfg.reject(f, tc.key, "Tenant.NewIdentity", "Use project.Grant instead.")
			})
			if !fired {
				t.Fatalf("%s was accepted and dropped", tc.key)
			}
			if !strings.Contains(msg, tc.key) || !strings.Contains(msg, "project.Grant") {
				t.Errorf("message should name the option and the way out, got:\n%s", msg)
			}
		})
	}
}

func TestPrincipalOptions_UnsetOptionsPass(t *testing.T) {
	cfg := newPrincipalConfig("x", []PrincipalOption{WithName("alice")})

	if fired, msg := new(recorder).run(func(f failer) {
		cfg.reject(f, "ProjectRole", "Tenant.NewUser", "Use project.NewUser.")
	}); fired {
		t.Fatalf("an option that was never passed was rejected: %s", msg)
	}
}
