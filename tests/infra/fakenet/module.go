package fakenet

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra"
)

const (
	Key = infra.Key("fakenet")

	adminPort = 8080
	httpsPort = 443
	dnsPort   = 53

	// IP is fixed so Infisical can be told to resolve here when its container is
	// created and keep working after fakenet is rebuilt. Inside infra.NetworkSubnet;
	// .53 for the resolver it runs.
	IP = "10.201.0.53"

	// CAPath is where the harness places the CA inside the application container.
	CAPath = "/fakenet-ca.pem"

	localTag = "infisical-fakenet:local"
)

// CAFile is where the CA lives on the host, relative to the tests module.
//
// Generated once and reused, because Infisical is handed this certificate when its
// container is created and adopted by later binaries. A CA minted per boot would be
// replaced every time a fake is edited and the running Infisical would trust an
// authority that no longer exists. `inf down` removes it alongside the containers,
// so the two can never disagree.
const CAFile = ".cache/fakenet-ca.pem"

// Image is a built fakenet image.
type Image struct {
	Ref string
	ID  string
}

func (i Image) ShortID() string {
	id := strings.TrimPrefix(i.ID, "sha256:")
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

// ResolveImage builds fakenet and returns the image Docker produced.
//
// The binary is compiled on the host and copied into scratch rather than built in a
// golang stage: the module cache is already warm from running tests, so this is about
// a second, where an in-Docker build would download the whole module graph.
func ResolveImage(ctx context.Context, repoRoot string, log infra.Logger) (Image, error) {
	release, err := infra.Lock("fakenet-build")
	if err != nil {
		return Image{}, err
	}
	defer release()

	dir, err := os.MkdirTemp("", "fakenet-build-*")
	if err != nil {
		return Image{}, err
	}
	defer func() { _ = os.RemoveAll(dir) }()

	goarch, err := dockerArch(ctx)
	if err != nil {
		return Image{}, err
	}

	tests := filepath.Join(repoRoot, "tests")
	build := exec.CommandContext(ctx, "go", "build", "-trimpath", "-o", filepath.Join(dir, "fakenet"), "./cmd/fakenet")
	build.Dir = tests
	build.Env = append(os.Environ(), "GOOS=linux", "GOARCH="+goarch, "CGO_ENABLED=0")
	if out, bErr := build.CombinedOutput(); bErr != nil {
		return Image{}, fmt.Errorf("fakenet: building the server: %w\n%s", bErr, out)
	}

	iid := filepath.Join(dir, "iid")
	out, err := exec.CommandContext(ctx, "docker", "build",
		"-f", filepath.Join(tests, "cmd", "fakenet", "Dockerfile"),
		"-t", localTag, "--iidfile", iid, dir).CombinedOutput()
	if err != nil {
		return Image{}, fmt.Errorf("fakenet: docker build failed: %w\n%s", err, out)
	}
	b, err := os.ReadFile(iid)
	if err != nil {
		return Image{}, fmt.Errorf("fakenet: reading image id: %w", err)
	}

	img := Image{Ref: localTag, ID: strings.TrimSpace(string(b))}
	log.Infof("image  %s -> %s", localTag, img.ShortID())
	return img, nil
}

// dockerArch asks the daemon what it runs. The binary is cross-compiled on the host,
// and an amd64 binary in an arm64 container fails as "exec format error", which reads
// like a corrupt image rather than a build mistake.
func dockerArch(ctx context.Context) (string, error) {
	out, err := exec.CommandContext(ctx, "docker", "info", "--format", "{{.Architecture}}").Output()
	if err != nil {
		return "", fmt.Errorf("fakenet: asking docker for its architecture: %w", err)
	}
	switch arch := strings.TrimSpace(string(out)); arch {
	case "aarch64", "arm64":
		return "arm64", nil
	case "x86_64", "amd64":
		return "amd64", nil
	default:
		return "", fmt.Errorf("fakenet: unsupported docker architecture %q", arch)
	}
}

type module struct {
	image  Image
	caFile string
}

type Option func(*module)

func WithImage(i Image) Option { return func(m *module) { m.image = i } }

// WithCAFile is the host path of the CA to serve with.
func WithCAFile(path string) Option { return func(m *module) { m.caFile = path } }

func Module(opts ...Option) infra.Module {
	m := &module{}
	for _, o := range opts {
		o(m)
	}
	return m
}

func (m *module) Key() infra.Key        { return Key }
func (m *module) Requires() []infra.Key { return nil }
func (m *module) Optional() []infra.Key { return nil }

func (m *module) Name() infra.NameParts {
	return infra.NameParts{Module: "fakenet", Fingerprint: m.image.ShortID()}
}

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	if m.image.Ref == "" {
		return nil, fmt.Errorf("fakenet: no image; pass WithImage(ResolveImage(...))")
	}
	if m.caFile == "" {
		return nil, fmt.Errorf("fakenet: no CA; pass WithCAFile(...)")
	}

	// Only one container can hold the fixed address, so an older generation left
	// running makes this one fail to start. Removing it first turns a confusing
	// "address already in use" into an ordinary rebuild.
	if err := reapOtherGenerations(ctx, infra.ContainerName(m.Name())); err != nil {
		return nil, err
	}

	c, err := d.Run(ctx, infra.ContainerSpec{
		Image: m.image.Ref,
		Ports: []int{adminPort, httpsPort},
		IP:    IP,
		Env:   map[string]string{"FAKENET_IP": IP},
		Files: []infra.File{{Src: m.caFile, Dst: CAPath, Mode: 0o600}},
		Ready: infra.ForHTTP(AdminPrefix + "/health").WithPort("8080/tcp"),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c, caFile: m.caFile}, nil
}

// reapOtherGenerations removes fakenet containers other than the one about to start.
// Editing a fake changes the image id and therefore the container name, so without
// this every edit leaves its predecessor holding the address.
func reapOtherGenerations(ctx context.Context, keep string) error {
	out, err := exec.CommandContext(ctx, "docker", "ps", "-aq",
		"--filter", "label="+infra.LabelModule+"=fakenet").Output()
	if err != nil {
		return fmt.Errorf("fakenet: listing previous containers: %w", err)
	}
	for _, id := range strings.Fields(string(out)) {
		name, nErr := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.Name}}", id).Output()
		if nErr != nil {
			continue
		}
		if strings.TrimPrefix(strings.TrimSpace(string(name)), "/") == keep {
			continue
		}
		_ = exec.CommandContext(ctx, "docker", "rm", "-f", id).Run()
	}
	return nil
}

// Handle is a running fakenet.
type Handle struct {
	c      infra.Container
	caFile string

	caOnce sync.Once
	caPEM  []byte
	caErr  error
}

func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, adminPort) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }

// AdminURL is the control surface. Always External: the test process talks to it, and
// the application never can.
func (h *Handle) AdminURL() string { return h.Endpoint(infra.External).URL("http") }

// Resolver is what the application container gets as its DNS server.
func (h *Handle) Resolver() string { return IP }

// CAPEMFile is the host path of the CA the application must trust.
func (h *Handle) CAPEMFile() string { return h.caFile }

// VerifyCA checks the running container is serving the CA we hold, which an adopted
// container from a previous CA would not be.
func (h *Handle) VerifyCA(ctx context.Context) error {
	h.caOnce.Do(func() { h.caPEM, h.caErr = h.fetchCA(ctx) })
	if h.caErr != nil {
		return h.caErr
	}
	want, err := os.ReadFile(h.caFile)
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(want)) == "" || !strings.Contains(string(want), strings.TrimSpace(string(h.caPEM))) {
		return fmt.Errorf("fakenet: the running container serves a different CA than %s.\n"+
			"Run `make down` so the stack is rebuilt against one CA", h.caFile)
	}
	return nil
}

func (h *Handle) fetchCA(ctx context.Context) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.AdminURL()+AdminPrefix+"/ca", nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fakenet: fetching the CA: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fakenet: fetching the CA returned %d", res.StatusCode)
	}
	return io.ReadAll(res.Body)
}

func From(d infra.Deps) (*Handle, bool) { return d.Get[*Handle](Key) }

// Denied is every outbound call that reached no fake, newest last.
func (h *Handle) Denied(ctx context.Context) ([]Denied, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.AdminURL()+AdminPrefix+"/denied", nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()

	var out []Denied
	if dErr := json.NewDecoder(res.Body).Decode(&out); dErr != nil {
		return nil, dErr
	}
	return out, nil
}
