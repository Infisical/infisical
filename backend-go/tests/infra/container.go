//go:build integration

package infra

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/docker/docker/api/types/container"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// ContainerTestRunner configures and runs Go tests inside a Docker container.
// Use this for tests that require specific system dependencies (e.g., SoftHSM).
type ContainerTestRunner struct {
	image        string
	insideEnvVar string
	optInEnvVar  string
	testPath     string
	buildTags    string
	env          map[string]string
}

// NewContainerTest creates a new container test runner.
//   - image: full Docker image name (e.g., "infisical/go-test-backend")
//   - insideEnvVar: env var set inside container to prevent infinite loop (e.g., "INFISICAL_HSM_TEST_INSIDE")
//   - optInEnvVar: env var that must be "1" to run tests (e.g., "INFISICAL_RUN_HSM_CONTAINER_TEST")
func NewContainerTest(image, insideEnvVar, optInEnvVar string) *ContainerTestRunner {
	return &ContainerTestRunner{
		image:        image,
		insideEnvVar: insideEnvVar,
		optInEnvVar:  optInEnvVar,
		env:          make(map[string]string),
	}
}

// WithTestPath sets the Go test path (e.g., "./internal/ee/services/hsm/...").
func (r *ContainerTestRunner) WithTestPath(path string) *ContainerTestRunner {
	r.testPath = path
	return r
}

// WithBuildTags sets the build tags for go test (e.g., "integration").
func (r *ContainerTestRunner) WithBuildTags(tags string) *ContainerTestRunner {
	r.buildTags = tags
	return r
}

// WithEnv adds an environment variable to pass to the container.
func (r *ContainerTestRunner) WithEnv(key, value string) *ContainerTestRunner {
	r.env[key] = value
	return r
}

// IsInsideContainer returns true if running inside the test container.
func (r *ContainerTestRunner) IsInsideContainer() bool {
	return os.Getenv(r.insideEnvVar) == "1"
}

// isOptedIn returns true if the user has opted in to run container tests.
func (r *ContainerTestRunner) isOptedIn() bool {
	return os.Getenv(r.optInEnvVar) == "1"
}

// MustRun pulls the image and runs go test inside the container.
// Returns 0 if opt-in env var is not set (skip).
// Uses log.Fatalf on setup errors.
func (r *ContainerTestRunner) MustRun() int {
	if !r.isOptedIn() {
		log.Printf("infra: skipping container test (%s not set)", r.optInEnvVar)
		return 0
	}

	code, err := r.run(context.Background())
	if err != nil {
		log.Fatalf("infra: container test failed: %v", err)
	}
	return code
}

func (r *ContainerTestRunner) run(ctx context.Context) (int, error) {
	projectRoot, err := findProjectRoot()
	if err != nil {
		return 1, fmt.Errorf("finding project root: %w", err)
	}

	env := map[string]string{
		r.insideEnvVar: "1",
		"CGO_ENABLED":  "1",
	}
	for k, v := range r.env {
		env[k] = v
	}

	req := testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image: r.image,
			HostConfigModifier: func(hc *container.HostConfig) {
				hc.Binds = []string{projectRoot + ":/app"}
			},
			Env:        env,
			WaitingFor: wait.ForLog(""),
		},
		Started: true,
	}

	ctr, err := testcontainers.GenericContainer(ctx, req)
	if err != nil {
		return 1, fmt.Errorf("creating container: %w", err)
	}
	defer func() {
		if termErr := ctr.Terminate(ctx); termErr != nil {
			log.Printf("infra: failed to terminate container: %v", termErr)
		}
	}()

	cmd := []string{"go", "test", "-v"}
	if r.buildTags != "" {
		cmd = append(cmd, "-tags="+r.buildTags)
	}
	cmd = append(cmd, r.testPath)

	exitCode, outputReader, err := ctr.Exec(ctx, cmd)
	if err != nil {
		return 1, fmt.Errorf("executing tests: %w", err)
	}

	buf := make([]byte, 4096)
	for {
		n, readErr := outputReader.Read(buf)
		if n > 0 {
			_, _ = os.Stdout.Write(buf[:n])
		}
		if readErr != nil {
			break
		}
	}

	return exitCode, nil
}

func findProjectRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("go.mod not found")
		}
		dir = parent
	}
}
