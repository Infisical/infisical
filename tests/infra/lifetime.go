package infra

// Scope is who owns a container's lifetime. The rule the whole design rests on:
// a container is stopped by whoever created it, and a test binary never stops one
// it adopted.
type Scope int

const (
	// Shared containers are adopted by every test binary and deliberately outlive
	// the run, so a second `go test` is fast. Only `inf down` stops them.
	Shared Scope = iota

	// Package containers belong to one test binary and are stopped when it exits.
	Package

	// Test containers belong to one test function and are stopped by t.Cleanup.
	Test
)

func (s Scope) String() string {
	switch s {
	case Shared:
		return "shared"
	case Package:
		return "pkg"
	case Test:
		return "test"
	default:
		return "unknown"
	}
}

// LongerLivedThan reports whether s outlives other. A container may not depend on
// anything shorter lived than itself, because it reads its configuration once at
// start and cannot be repointed when that dependency goes away.
func (s Scope) LongerLivedThan(other Scope) bool { return s < other }
