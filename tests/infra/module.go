package infra

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// Key identifies a module for lookup. A module that can appear more than once
// qualifies its key with the instance name, so postgres.Module(postgres.Named(
// "rotation")) is "postgres:rotation" and does not collide with "postgres".
type Key string

// Module is a container the harness can start. Implementations live in
// infra/<name> and are about thirty lines each, because Deps.Run does the work.
type Module interface {
	Key() Key

	// Name is the identity-bearing part of the container name. The harness supplies
	// scope and scope id; a module supplies its own module name, instance, and a
	// fingerprint if and only if staleness would be silent for it.
	Name() NameParts

	// Requires lists modules this one cannot start without. Validated before
	// anything starts, so a missing dependency fails immediately rather than as a
	// connection timeout ninety seconds later.
	Requires() []Key

	// Optional lists modules this one consumes if present and ignores if not.
	Optional() []Key

	Start(context.Context, Deps) (Handle, error)
}

// Handle is a started container.
type Handle interface {
	Endpoint(Mode) Endpoint
	Stop(context.Context) error
}

// Deps is what a module sees during Start: every module that has already started,
// plus the network they share.
type Deps struct {
	handles   map[Key]Handle
	network   string
	workspace string
	name      NameParts
	runner    Runner
	log       Logger
}

func (d Deps) Network() string { return d.network }

// ContainerName is the name this module's container will get. A module needs it to
// build a URL pointing at itself, which Infisical does for SITE_URL.
func (d Deps) ContainerName() string { return ContainerName(d.name) }

// Run starts this module's container. Name, alias and labels are filled in from the
// resolved scope, so a module never computes its own identity and cannot get the
// naming convention subtly wrong.
func (d Deps) Run(ctx context.Context, spec ContainerSpec) (Container, error) {
	if spec.Name == "" {
		spec.Name = ContainerName(d.name)
	}
	if spec.Alias == "" {
		spec.Alias = spec.Name
	}
	if spec.Labels == nil {
		spec.Labels = Labels(d.name, d.workspace)
	}
	return d.runner.Run(ctx, spec)
}

// NewDeps builds the Deps handed to one module's Start.
func NewDeps(handles map[Key]Handle, network, workspace string, name NameParts, r Runner, log Logger) Deps {
	if log == nil {
		log = NewLogger()
	}
	return Deps{handles: handles, network: network, workspace: workspace, name: name, runner: r, log: log}
}

func (d Deps) Log() Logger { return d.log }

// Get returns a typed handle, or false when the module was not declared.
//
// A generic method rather than a package function, which Go 1.27 allows. Modules
// still wrap it (wiremock.From, postgres.MustFrom) so call sites read as prose.
func (d Deps) Get[H Handle](k Key) (H, bool) {
	h, ok := d.handles[k]
	if !ok {
		var zero H
		return zero, false
	}
	typed, ok := h.(H)
	return typed, ok
}

// Plan is a validated, ordered set of modules ready to start.
type Plan struct {
	modules []Module
	scopes  map[Key]Scope
}

func (p Plan) Modules() []Module   { return p.modules }
func (p Plan) Scope(k Key) Scope   { return p.scopes[k] }
func (p Plan) Declared(k Key) bool { _, ok := p.scopes[k]; return ok }

// Resolve validates a module set and returns it in dependency order.
//
// Everything here runs before a single container starts, so every failure below is
// instant and names the fix.
func Resolve(modules []Module, scopes map[Key]Scope) (Plan, error) {
	byKey := make(map[Key]Module, len(modules))
	for _, m := range modules {
		if _, dup := byKey[m.Key()]; dup {
			return Plan{}, fmt.Errorf("infra: module %q declared twice; use Named() to run a second instance", m.Key())
		}
		byKey[m.Key()] = m
	}

	for _, m := range modules {
		for _, dep := range m.Requires() {
			if _, ok := byKey[dep]; !ok {
				return Plan{}, fmt.Errorf("infra: %s requires %s, which was not declared", m.Key(), dep)
			}
		}
		if err := checkLifetimes(m, scopes, byKey); err != nil {
			return Plan{}, err
		}
	}

	ordered, err := topoSort(modules, byKey)
	if err != nil {
		return Plan{}, err
	}
	return Plan{modules: ordered, scopes: scopes}, nil
}

// checkLifetimes rejects a module that depends on something shorter lived than
// itself. This is not hypothetical: a Shared Infisical takes HTTP_PROXY at container
// start, so pointing it at a Package-scoped WireMock breaks every other package the
// moment that one finishes.
func checkLifetimes(m Module, scopes map[Key]Scope, byKey map[Key]Module) error {
	mine, ok := scopes[m.Key()]
	if !ok {
		return fmt.Errorf("infra: no scope declared for %s", m.Key())
	}
	for _, dep := range append(append([]Key{}, m.Requires()...), m.Optional()...) {
		if _, declared := byKey[dep]; !declared {
			continue // optional and absent
		}
		theirs := scopes[dep]
		if theirs.LongerLivedThan(mine) || theirs == mine {
			continue
		}
		return fmt.Errorf(
			"infra: %s is %s-scoped but depends on %s which is %s-scoped.\n"+
				"A container reads its configuration once at start, so it cannot point at something that dies first.\n"+
				"Either widen %s to %s, or narrow %s to %s",
			m.Key(), mine, dep, theirs, dep, mine, m.Key(), theirs)
	}
	return nil
}

func topoSort(modules []Module, byKey map[Key]Module) ([]Module, error) {
	const (
		unvisited = iota
		inProgress
		done
	)
	state := make(map[Key]int, len(modules))
	out := make([]Module, 0, len(modules))
	var path []Key

	var visit func(m Module) error
	visit = func(m Module) error {
		switch state[m.Key()] {
		case done:
			return nil
		case inProgress:
			return fmt.Errorf("infra: dependency cycle: %s -> %s", joinKeys(path), m.Key())
		}
		state[m.Key()] = inProgress
		path = append(path, m.Key())

		deps := append(append([]Key{}, m.Requires()...), m.Optional()...)
		sort.Slice(deps, func(i, j int) bool { return deps[i] < deps[j] })
		for _, k := range deps {
			if dep, ok := byKey[k]; ok {
				if err := visit(dep); err != nil {
					return err
				}
			}
		}

		path = path[:len(path)-1]
		state[m.Key()] = done
		out = append(out, m)
		return nil
	}

	sorted := append([]Module{}, modules...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Key() < sorted[j].Key() })
	for _, m := range sorted {
		if err := visit(m); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func joinKeys(ks []Key) string {
	s := make([]string, len(ks))
	for i, k := range ks {
		s[i] = string(k)
	}
	return strings.Join(s, " -> ")
}
