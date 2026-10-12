package infra

import (
	"time"

	"github.com/testcontainers/testcontainers-go/wait"
)

// Ready is a testcontainers wait strategy, applied while the container starts.
//
// Aliased rather than reimplemented. An earlier version of this package hand-rolled
// exec, TCP and HTTP pollers; testcontainers already ships them, handles the
// container-exited case during startup, and is better tested than anything written
// here would be. The alias is what keeps modules from importing testcontainers
// directly, so the container engine stays behind one seam.
type Ready = wait.Strategy

// Re-exported so a module imports only this package.
var (
	ForExec          = wait.ForExec
	ForHTTP          = wait.ForHTTP
	ForListeningPort = wait.ForListeningPort
	ForHealthCheck   = wait.ForHealthCheck
	ForAll           = wait.ForAll
	ForAny           = wait.ForAny

	// ForLog is deliberately NOT re-exported for the application container.
	//
	// Waiting on a log line couples the harness to the implementation's logging
	// format, which is the one thing this suite exists not to depend on: a Go
	// reimplementation would emit entirely different lines while /api/status stays
	// identical. Use it for third-party images whose output is a stable contract,
	// never for Infisical.
	ForLog = wait.ForLog
)

// DefaultStartupTimeout bounds a container that never becomes ready. Generous
// because the application runs 540 migrations on a cold database.
const DefaultStartupTimeout = 5 * time.Minute
