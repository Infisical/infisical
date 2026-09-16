package infra

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

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

	mu   sync.Mutex
	seen map[string]bool // names this process has already started
}

// NewRunner returns the default Docker-backed Runner.
func NewRunner(workspace string, log Logger) Runner {
	return &dockerRunner{workspace: workspace, log: log}
}

// Network creates the shared network if it is absent, and is a no-op otherwise.
//
// There is exactly one, with a fixed name, because a Package-scoped container has to
// join the same network as the Shared ones or an Isolated suite could not reach the
// shared Mailpit. testcontainers' network.New generates a random name per process,
// which would give every test binary its own island.
//
// Shelled out rather than using the Docker API, because importing the moby network
// types reintroduces an ambiguous import between github.com/moby/moby and
// github.com/moby/moby/api. This runs once per machine, so a subprocess is free.
func (r *dockerRunner) Network(ctx context.Context, name string) error {
	if r.netName == name {
		return nil
	}
	if err := exec.CommandContext(ctx, "docker", "network", "inspect", name).Run(); err == nil {
		r.netName = name
		return nil
	}

	out, err := exec.CommandContext(ctx, "docker", "network", "create",
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
	if len(spec.Command) > 0 {
		opts = append(opts, testcontainers.WithCmd(spec.Command...))
	}
	if r.netName != "" {
		alias := spec.Alias
		if alias == "" {
			alias = spec.Name
		}
		aliases := append([]string{alias}, spec.Aliases...)
		opts = append(opts, network.WithNetworkName(aliases, r.netName))
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

	dc, err := testcontainers.Run(ctx, spec.Image, opts...)
	if err != nil {
		return Container{}, fmt.Errorf("infra: starting %s (%s): %w", spec.Name, spec.Image, err)
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
		stop: func(ctx context.Context) error { return dc.Terminate(ctx) },
		exec: func(ctx context.Context, cmd []string) (int, string, error) {
			code, reader, err := dc.Exec(ctx, cmd, tcexec.Multiplexed())
			if err != nil {
				return code, "", err
			}
			out, _ := io.ReadAll(reader)
			return code, string(out), nil
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

	if spec.Ready != nil {
		if err := spec.Ready(ctx, c); err != nil {
			return c, fmt.Errorf("infra: %s never became ready: %w", spec.Name, err)
		}
	}
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
