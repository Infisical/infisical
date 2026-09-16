package infra

import "time"

// Label keys. Nothing parses a container NAME; names are for humans reading
// `docker ps`. Structured data lives here, so adding a dimension later does not
// require a naming change that orphans everyone's containers.
const (
	LabelScope       = Prefix + ".scope"
	LabelModule      = Prefix + ".module"
	LabelInstance    = Prefix + ".instance"
	LabelFingerprint = Prefix + ".fingerprint"
	LabelWorkspace   = Prefix + ".workspace"
	LabelCreated     = Prefix + ".created"
)

// Labels builds the label set for a container.
//
// workspace is recorded but is NOT part of identity. It exists so `inf status` can
// tell you which checkout created the container you are about to reap, which matters
// because shared containers are shared across worktrees on the same machine.
func Labels(p NameParts, workspace string) map[string]string {
	l := map[string]string{
		LabelScope:     p.Scope.String(),
		LabelModule:    p.Module,
		LabelWorkspace: workspace,
		LabelCreated:   time.Now().UTC().Format(time.RFC3339),
	}
	if p.Instance != "" {
		l[LabelInstance] = p.Instance
	}
	if p.Fingerprint != "" {
		l[LabelFingerprint] = p.Fingerprint
	}
	return l
}
