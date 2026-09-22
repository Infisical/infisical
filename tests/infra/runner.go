package infra

import (
	"context"
	"fmt"
	"io"
	"net/netip"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/api/types/container"
	dockernetwork "github.com/moby/moby/api/types/network"
	"github.com/testcontainers/testcontainers-go"
	tcexec "github.com/testcontainers/testcontainers-go/exec"
	"github.com/testcontainers/testcontainers-go/network"
)

// dockerRunner is the only place in the harness that touches testcontainers.
//
// Modules go through Runner instead, which is what keeps each module about thirty
// lines and lets the adopt mechanism be replaced. That matters: testcontainers
// documents reuse-by-name as experimental and says the API is "subject to change for
// a more robust implementation that is not based on container names".
type dockerRunner struct {
	workspace string
	log       Logger
	netName   string
	runID     string

	mu   sync.Mutex
	seen map[string]bool // names this process has already started
}

// disableRyuk turns off testcontainers' reaper.
//
// Ryuk reaps everything created in a session when that session ends, and a session is
// one test binary. Two things break under it. Shared containers are meant to outlive
// the run so a second `go test` adopts them; Ryuk deletes them at the first binary's
// exit. Worse, a container carries the label of the session that CREATED it, so with
// `go test ./...` running packages concurrently, the first binary to finish reaps
// containers the others are still using.
//
// Reaping is explicit instead: every container carries an inf.scope label and
// `inf down` removes them. The cost is that a killed run leaves containers behind,
// which for shared ones is the intended behaviour anyway.
func disableRyuk() {
	if _, set := os.LookupEnv("TESTCONTAINERS_RYUK_DISABLED"); !set {
		_ = os.Setenv("TESTCONTAINERS_RYUK_DISABLED", "true")
	}
}

// NewRunner returns the default Docker-backed Runner.
func NewRunner(workspace string, log Logger) Runner {
	disableRyuk()
	return &dockerRunner{workspace: workspace, log: log, runID: time.Now().UTC().Format("20060102-150405")}
}

// Network creates the shared network if it is absent, and is a no-op otherwise.
//
// One per stack: the shared network for a Shared profile, and a package-specific one
// for an Isolated profile so its WireMock can claim a host alias without competing
// with the shared WireMock for the same name. Shared containers are connected to the
// package network afterwards. testcontainers' network.New generates a random name per
// process, which would give every test binary its own island.
//
// Shelled out rather than using the Docker API. This runs once per machine, so a
// subprocess is free, and it keeps network creation independent of testcontainers.
//
// The subnet is fixed because fakenet needs a fixed address on it. An existing
// network with a different subnet is refused rather than silently reused, since the
// symptom would otherwise be Docker rejecting fakenet's address much later.
func (r *dockerRunner) Network(ctx context.Context, name string) error {
	if r.netName == name {
		return nil
	}
	if out, err := exec.CommandContext(ctx, "docker", "network", "inspect",
		"-f", "{{range .IPAM.Config}}{{.Subnet}}{{end}}", name).Output(); err == nil {
		if got := strings.TrimSpace(string(out)); got != NetworkSubnet {
			return fmt.Errorf("infra: network %s has subnet %q, want %s.\n"+
				"fakenet needs a fixed address, which needs a known subnet.\n"+
				"Run `make down` once to recreate the network", name, got, NetworkSubnet)
		}
		r.netName = name
		return nil
	}

	out, err := exec.CommandContext(ctx, "docker", "network", "create",
		"--subnet", NetworkSubnet,
		"--label", LabelScope+"=shared",
		"--label", LabelWorkspace+"="+r.workspace,
		name,
	).CombinedOutput()
	// Two binaries starting at once race here; whoever loses sees "already exists",
	// which is the same outcome as winning.
	if err != nil && !strings.Contains(string(out), "already exists") {
		return fmt.Errorf("infra: creating network %s: %w: %s", name, err, strings.TrimSpace(string(out)))
	}
	r.netName = name
	return nil
}

// Connect attaches a running container to another network.
//
// Needed because a Shared container is created once, on the shared network, and an
// Isolated stack lives on its own: without this its Infisical could not reach the
// shared Mailpit. Adopting a container does not re-apply network options, so this
// has to be an explicit step rather than something Run can do.
func (r *dockerRunner) Connect(ctx context.Context, container, net string, aliases ...string) error {
	args := []string{"network", "connect"}
	for _, a := range aliases {
		args = append(args, "--alias", a)
	}
	args = append(args, net, container)

	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
	// Already attached is the same outcome as attaching, and happens whenever a
	// second binary adopts a container the first one already connected.
	if err != nil && !strings.Contains(string(out), "already exists") {
		return fmt.Errorf("infra: connecting %s to %s: %w: %s", container, net, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (r *dockerRunner) Run(ctx context.Context, spec ContainerSpec) (Container, error) {
	opts := []testcontainers.ContainerCustomizer{
		testcontainers.WithReuseByName(spec.Name),
		testcontainers.WithEnv(spec.Env),
		testcontainers.WithLabels(spec.Labels),
	}
	if len(spec.Ports) > 0 {
		ports := make([]string, len(spec.Ports))
		for i, p := range spec.Ports {
			ports[i] = strconv.Itoa(p) + "/tcp"
		}
		opts = append(opts, testcontainers.WithExposedPorts(ports...))
	}
	if spec.Ready != nil {
		deadline := spec.StartupTimeout
		if deadline == 0 {
			deadline = DefaultStartupTimeout
		}
		opts = append(opts, testcontainers.WithWaitStrategyAndDeadline(deadline, spec.Ready))
	}
	if len(spec.Command) > 0 {
		opts = append(opts, testcontainers.WithCmd(spec.Command...))
	}
	net := spec.Network
	if net == "" {
		net = r.netName
	}
	if net != "" {
		alias := spec.Alias
		if alias == "" {
			alias = spec.Name
		}
		aliases := append([]string{alias}, spec.Aliases...)
		opts = append(opts, network.WithNetworkName(aliases, net))

		if spec.IP != "" {
			addr, err := netip.ParseAddr(spec.IP)
			if err != nil {
				return Container{}, fmt.Errorf("infra: %s has an unparseable IP %q: %w", spec.Name, spec.IP, err)
			}
			netName := net
			opts = append(opts, testcontainers.WithEndpointSettingsModifier(
				func(settings map[string]*dockernetwork.EndpointSettings) {
					s, ok := settings[netName]
					if !ok {
						s = &dockernetwork.EndpointSettings{}
						settings[netName] = s
					}
					s.IPAMConfig = &dockernetwork.EndpointIPAMConfig{IPv4Address: addr}
				}))
		}
	}
	if len(spec.DNS) > 0 {
		resolvers := make([]netip.Addr, 0, len(spec.DNS))
		for _, d := range spec.DNS {
			addr, err := netip.ParseAddr(d)
			if err != nil {
				return Container{}, fmt.Errorf("infra: %s has an unparseable DNS address %q: %w", spec.Name, d, err)
			}
			resolvers = append(resolvers, addr)
		}
		opts = append(opts, testcontainers.WithHostConfigModifier(func(hc *container.HostConfig) {
			hc.DNS = resolvers
		}))
	}
	for _, f := range spec.Files {
		mode := f.Mode
		if mode == 0 {
			mode = 0o644
		}
		opts = append(opts, testcontainers.WithFiles(testcontainers.ContainerFile{
			HostFilePath:      f.Src,
			ContainerFilePath: f.Dst,
			FileMode:          mode,
		}))
	}

	// Serialize on the container name. Four binaries starting at once all find no
	// container and all try to create it, which is the race reuse-by-name has.
	release, err := Lock("container-" + spec.Name)
	if err != nil {
		return Container{}, err
	}
	defer release()

	// Attached before the container starts, so output survives a failed wait
	// strategy tearing the container down before anyone can read it.
	sink := newLogSink(r.runID, spec.Name)
	opts = append(opts, testcontainers.WithLogConsumers(sink))

	began := time.Now()
	dc, err := testcontainers.Run(ctx, spec.Image, opts...)
	if err != nil {
		sink.Close()
		return Container{}, startFailure(spec.Name, spec.Image, sink, err)
	}

	c := Container{
		ID:      dc.GetContainerID(),
		Name:    spec.Name,
		Adopted: r.adopted(ctx, spec.Name, dc),
		endpoint: func(m Mode, port int) Endpoint {
			if m == Internal {
				alias := spec.Alias
				if alias == "" {
					alias = spec.Name
				}
				return Endpoint{Host: alias, Port: port}
			}
			host, err := dc.Host(ctx)
			if err != nil {
				host = "127.0.0.1"
			}
			mapped, err := dc.MappedPort(ctx, strconv.Itoa(port)+"/tcp")
			if err != nil {
				return Endpoint{Host: host, Port: 0}
			}
			return Endpoint{Host: host, Port: int(mapped.Num())}
		},
		stop: func(ctx context.Context) error {
			sink.Close()
			return dc.Terminate(ctx)
		},
		exec: func(ctx context.Context, cmd []string) (int, string, error) {
			code, reader, err := dc.Exec(ctx, cmd, tcexec.Multiplexed())
			if err != nil {
				return code, "", err
			}
			out, _ := io.ReadAll(reader)
			return code, string(out), nil
		},
		running: func(ctx context.Context) (bool, int, error) {
			st, err := dc.State(ctx)
			if err != nil {
				return false, 0, err
			}
			return st.Running, st.ExitCode, nil
		},
		logs: func(ctx context.Context) (string, error) {
			rc, err := dc.Logs(ctx)
			if err != nil {
				return "", err
			}
			defer func() { _ = rc.Close() }()
			out, err := io.ReadAll(rc)
			return string(out), err
		},
	}

	if spec.Check != nil {
		if err := spec.Check(ctx, c); err != nil {
			return c, fmt.Errorf("infra: %s came up but is not usable: %w", spec.Name, err)
		}
	}

	// adopt versus create is the most useful single line the harness prints: an
	// unexpected create means a name is varying when it should not, and everything
	// downstream is slower than it should be.
	action := "create"
	if c.Adopted {
		action = "adopt"
	}
	r.log.Decision(action, spec.Name, c.Endpoint(External, firstPort(spec)), time.Since(began), "")
	return c, nil
}

// adopted reports whether an existing container was reused rather than created.
//
// Two signals, because neither is sufficient alone:
//
//   - This process has already started a container of this name. Covers a single
//     binary asking for the same module twice.
//   - The container predates this process. Covers the case the whole design exists
//     for: another test binary, or an earlier `go test`, created it.
//
// The first signal is the one a test exposed. Without it, a same-process reuse
// reports "create", because the container genuinely was created after this process
// started, just not by this call.
//
// Done by inspection rather than a pre-flight container list so the harness needs no
// direct dependency on the Docker API module, which has been splitting between
// github.com/docker/docker and github.com/moby/moby and is not worth tracking for a
// log line.
func (r *dockerRunner) adopted(ctx context.Context, name string, dc *testcontainers.DockerContainer) bool {
	r.mu.Lock()
	seenBefore := r.seen[name]
	if r.seen == nil {
		r.seen = map[string]bool{}
	}
	r.seen[name] = true
	r.mu.Unlock()

	if seenBefore {
		return true
	}

	info, err := dc.Inspect(ctx)
	if err != nil {
		return false
	}
	created, err := time.Parse(time.RFC3339Nano, info.Created)
	if err != nil {
		return false
	}
	return created.Before(processStart)
}

var processStart = time.Now()

// Workspace is the checkout that created a container. Recorded as a label but never
// part of identity, so `inf status` can tell you which worktree to ask before you
// reap something.
func Workspace() string {
	wd, err := os.Getwd()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSuffix(wd, "/tests")
}

func firstPort(spec ContainerSpec) int {
	if len(spec.Ports) == 0 {
		return 0
	}
	return spec.Ports[0]
}
