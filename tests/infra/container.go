package infra

import "context"

// File is copied into a container before it starts.
type File struct {
	Src  string // path on the host
	Dst  string // absolute path in the container
	Mode int64  // 0 means 0644
}

// ContainerSpec is what a module asks for. Everything a module needs to say about a
// container, and nothing about how it gets created.
type ContainerSpec struct {
	Name    string // from ContainerName; this is the adopt-or-create identity
	Image   string
	Command []string
	Env     map[string]string
	Ports   []int
	Alias   string // primary network alias, which becomes the Internal host

	// Aliases are extra network aliases. WireMock uses them to answer for hostnames
	// that cloud SDKs hardcode and would otherwise never send through a proxy.
	Aliases []string
	Files   []File
	Labels  map[string]string
	Ready   Ready
	Check   func(context.Context, Container) error
}

// Container is a started container, as seen by a module.
type Container struct {
	ID       string
	Name     string
	Adopted  bool // true when an existing container was reused rather than created
	endpoint func(Mode, int) Endpoint
	stop     func(context.Context) error
	exec     func(context.Context, []string) (int, string, error)
	logs     func(context.Context) (string, error)
	running  func(context.Context) (bool, int, error)
}

func (c Container) Endpoint(m Mode, port int) Endpoint       { return c.endpoint(m, port) }
func (c Container) Stop(ctx context.Context) error           { return c.stop(ctx) }
func (c Container) Logs(ctx context.Context) (string, error) { return c.logs(ctx) }

// Running reports whether the container is still up, and its exit code if not.
//
// Readiness uses it to fail the moment the application exits during boot rather than
// waiting out the full timeout. On a 540-migration boot that is the difference
// between a clear error and a five minute stare.
func (c Container) Running(ctx context.Context) (bool, int, error) { return c.running(ctx) }

// Exec runs a command inside the container and returns its exit code and combined
// output. Used by readiness checks such as pg_isready.
func (c Container) Exec(ctx context.Context, cmd []string) (int, string, error) {
	return c.exec(ctx, cmd)
}

// Runner creates or adopts containers. The single seam over the container engine.
//
// Modules never touch testcontainers directly, which is what keeps a module about
// thirty lines and lets the adopt mechanism be swapped. That matters here:
// testcontainers documents reuse-by-name as experimental and says the API is
// "subject to change for a more robust implementation that is not based on
// container names".
type Runner interface {
	Run(ctx context.Context, spec ContainerSpec) (Container, error)
	Network(ctx context.Context, name string) error
}
