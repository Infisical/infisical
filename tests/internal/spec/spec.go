// Package spec carries the rationale for a test into its output.
package spec

import (
	"strings"
	"testing"
)

// Why records why a test exists, for the cases where the name cannot carry the
// reason. It is t.Log rather than a comment for three reasons: it appears on
// FAILURE, so whoever is looking at a red run gets the rationale without opening the
// file; it is harvestable from `go test -json` into the generated spec document; and
// it sits at the top of the test, so it still serves a reader of the code.
//
// Most tests should not have one. The bar is the same one CLAUDE.md sets for
// comments: it earns its place only by explaining why. A non-obvious constraint, a
// past incident, a spec the behaviour has to match, or logic that looks wrong until
// you know the reason. If the majority of your subtests need one, the names are
// doing too little work.
//
// An empty string is a no-op, so a table-driven case can leave it unset.
func Why(t *testing.T, why string) {
	t.Helper()
	if strings.TrimSpace(why) == "" {
		return
	}
	t.Log("why: " + dedent(why))
}

// Ref is the short form: a pointer to the rule a test enforces, with no prose. It
// makes the generated spec document link back to the source of the requirement.
func Ref(t *testing.T, ref string) {
	t.Helper()
	if strings.TrimSpace(ref) == "" {
		return
	}
	t.Log("ref: " + ref)
}

// dedent strips the leading indentation that a raw Go string literal picks up from
// the surrounding code, so multi-line rationale reads as prose in test output.
func dedent(s string) string {
	lines := strings.Split(strings.TrimRight(s, " \t\n"), "\n")
	out := make([]string, 0, len(lines))
	for i, l := range lines {
		if i == 0 {
			out = append(out, strings.TrimSpace(l))
			continue
		}
		out = append(out, strings.TrimLeft(l, " \t"))
	}
	return strings.Join(out, "\n")
}
