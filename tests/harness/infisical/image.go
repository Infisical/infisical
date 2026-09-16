package infisical

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra"
)

// ImageEnv names a prebuilt image to use instead of building one. CI sets it from a
// tag built in a prior job, so the parallel test binaries do not each rediscover the
// same build.
const ImageEnv = "INFISICAL_TEST_IMAGE"

// localTag is mutable on purpose. It is a convenience handle; the image ID returned
// by the build is the thing that carries identity.
const localTag = "infisical-test:local"

// Image is a built application image. ID is the Docker content address, which is
// what goes into the container name so that changed code means a fresh container.
type Image struct {
	Ref string // what to run: a tag, or the ID
	ID  string // sha256:...
}

// ShortID is the container-name fragment.
func (i Image) ShortID() string {
	id := strings.TrimPrefix(i.ID, "sha256:")
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

// ResolveImage returns the application image to test against.
//
// Docker's build cache already answers "has anything changed", exactly, so the
// harness does not compute a content hash of its own. It builds, and takes the image
// ID Docker hands back. A no-op rebuild is context transfer plus layer digest checks;
// backend/.dockerignore already keeps node_modules and dist out of the context.
//
// The build context is backend/ verbatim. Nothing is substituted: entitlements come
// from the stubbed license server at runtime, not from a patched source tree.
func ResolveImage(ctx context.Context, repoRoot string, log infra.Logger) (Image, error) {
	if ref := os.Getenv(ImageEnv); ref != "" {
		id, err := inspectID(ctx, ref)
		if err != nil {
			return Image{}, fmt.Errorf("infisical: %s=%q could not be inspected: %w", ImageEnv, ref, err)
		}
		log.Infof("image  %s (from %s) -> %s", ref, ImageEnv, short(id))
		return Image{Ref: ref, ID: id}, nil
	}

	// Four binaries starting at once would otherwise all build the same context.
	release, err := infra.Lock("image-build")
	if err != nil {
		return Image{}, err
	}
	defer release()

	began := time.Now()
	id, err := build(ctx, repoRoot)
	if err != nil {
		return Image{}, err
	}
	log.Infof("image  %s -> %s (%.1fs)", localTag, short(id), time.Since(began).Seconds())
	return Image{Ref: localTag, ID: id}, nil
}

func build(ctx context.Context, repoRoot string) (string, error) {
	backend := filepath.Join(repoRoot, "backend")
	if _, err := os.Stat(filepath.Join(backend, "Dockerfile")); err != nil {
		return "", fmt.Errorf("infisical: no backend/Dockerfile under %s: %w", repoRoot, err)
	}

	iid, err := os.CreateTemp("", "inf-iid-*")
	if err != nil {
		return "", err
	}
	iidPath := iid.Name()
	_ = iid.Close()
	defer func() { _ = os.Remove(iidPath) }()

	args := []string{"build", "-f", filepath.Join(backend, "Dockerfile"), "-t", localTag, "--iidfile", iidPath}
	if pin := cliVersion(repoRoot); pin != "" {
		// Keep the pinned CLI version honest. The Dockerfile carries a matching ARG
		// default, and check-dockerfile-pins.yml fails a PR when they drift.
		args = append(args, "--build-arg", "INFISICAL_CLI_VERSION="+pin)
	}
	args = append(args, backend)

	cmd := exec.CommandContext(ctx, "docker", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("infisical: docker build failed: %w\n%s", err, tail(string(out), 40))
	}

	b, err := os.ReadFile(iidPath)
	if err != nil {
		return "", fmt.Errorf("infisical: reading image id: %w", err)
	}
	return strings.TrimSpace(string(b)), nil
}

func inspectID(ctx context.Context, ref string) (string, error) {
	out, err := exec.CommandContext(ctx, "docker", "image", "inspect", "-f", "{{.Id}}", ref).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func cliVersion(repoRoot string) string {
	b, err := os.ReadFile(filepath.Join(repoRoot, "build-versions.env"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), "INFISICAL_CLI_VERSION="); ok {
			return v
		}
	}
	return ""
}

func short(id string) string {
	id = strings.TrimPrefix(id, "sha256:")
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func tail(s string, n int) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}
