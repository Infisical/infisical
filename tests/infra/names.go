package infra

import (
	"regexp"
	"strings"
)

// Prefix is on every container and network the harness creates. Short on purpose:
// `docker ps` truncates the NAMES column and these appear constantly.
const Prefix = "inf"

// NetworkName is the shared network. Package-scoped containers join it too, so an
// Isolated suite can still reach the shared Mailpit. It holds no state.
const NetworkName = Prefix + "-net"

// PackageNetwork is the network an Isolated package gets to itself.
//
// Its own, because a host alias belongs to the network: two WireMocks claiming
// api.github.com on one network make Docker DNS round-robin between them, so a stub
// registered on one is missed by a request that lands on the other.
func PackageNetwork(pkg string) string { return NetworkName + "-" + Sanitize(pkg) }

var unsafeNameChars = regexp.MustCompile(`[^a-zA-Z0-9_.-]+`)

// NameParts is everything that can appear in a container name.
//
// A container's name is its identity: adopt-or-create matches on it. So a name must
// carry exactly what should force a fresh container and nothing that varies for any
// other reason. Put something per-process in here and nothing ever adopts.
type NameParts struct {
	Scope    Scope
	ScopeID  string // package path for Package, a short random for Test, empty for Shared
	Module   string // "postgres", "infisical"
	Instance string // from Named(), empty when there is only ever one

	// Fingerprint forces a new container when the thing it identifies changes.
	//
	// Only set it where staleness would be SILENT. Infisical carries its Docker image
	// ID, because a stale app container runs your previous code and every test still
	// passes. Postgres does not: a schema mismatch makes the app exit at boot with a
	// migration error, which is loud, diagnosable, and fixed by `inf down`.
	Fingerprint string
}

// ContainerName renders a name of the form:
//
//	inf-shared-postgres
//	inf-shared-postgres-rotation
//	inf-shared-infisical-9f8e7d6c
//	inf-pkg-suites-instance-postgres
//	inf-test-a1b2-infisical
func ContainerName(p NameParts) string {
	segments := []string{Prefix, p.Scope.String()}
	if p.ScopeID != "" {
		segments = append(segments, Sanitize(p.ScopeID))
	}
	segments = append(segments, Sanitize(p.Module))
	if p.Instance != "" {
		segments = append(segments, Sanitize(p.Instance))
	}
	if p.Fingerprint != "" {
		segments = append(segments, Sanitize(p.Fingerprint))
	}
	return strings.Join(segments, "-")
}

// Sanitize maps arbitrary text into what Docker accepts in a name. Docker allows
// [a-zA-Z0-9][a-zA-Z0-9_.-]* so a package path like "suites/instance" has to fold to
// "suites-instance".
func Sanitize(s string) string {
	s = unsafeNameChars.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-._")
	return strings.ToLower(s)
}
