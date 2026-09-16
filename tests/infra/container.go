package infra

import "context"

// File is copied into a container before it starts.
type File struct {
	Src  string // path on the host
	Dst  string // absolute path in the container
	Mode int64  // 0 means 0644
}

// ReadyFunc decides when a container is usable. Implementations live in ready.go.
type ReadyFunc func(ctx context.Context, c Container) error

// ContainerSpec is what a module asks for. Everything a module needs to say about a
// container, and nothing about how it gets created.
type ContainerSpec struct {
	Name    string // from ContainerName; this is the adopt-or-create identity
	Image   string
	Command []string
	Env     map[string]string
	Ports   []int
	Alias   string // network alias, which becomes the Internal host
	Files   []File
	Labels  map[string]string
	Ready   ReadyFunc
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
}

func (c Container) Endpoint(m Mode, port int) Endpoint       { return c.endpoint(m, port) }
func (c Container) Stop(ctx context.Context) error           { return c.stop(ctx) }
func (c Container) Logs(ctx context.Context) (string, error) { return c.logs(ctx) }

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
