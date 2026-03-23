package infra

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
)

// licenseFeaturePath is the path to the compiled license-fns module inside the Node.js container.
const licenseFeaturePath = "/backend/dist/ee/services/license/license-fns.mjs"

// Builder configures which services to spin up for an integration test.
type Builder struct {
	wantPostgres bool
	wantRedis    bool
	wantNodeJS   bool
	nodeJSFiles  []testcontainers.ContainerFile
	eeFeatures   []string // license feature names to enable (e.g. "rbac", "groups")
}

// New creates a new infrastructure builder.
func New() *Builder { return &Builder{} }

// WithPostgres adds a PostgreSQL container to the stack.
func (b *Builder) WithPostgres() *Builder { b.wantPostgres = true; return b }

// WithRedis adds a Redis container to the stack.
func (b *Builder) WithRedis() *Builder { b.wantRedis = true; return b }

// WithNodeJSApi adds the Node.js backend container.
// Automatically enables Postgres and Redis since the backend depends on them.
func (b *Builder) WithNodeJSApi() *Builder {
	b.wantNodeJS = true
	b.wantPostgres = true
	b.wantRedis = true
	return b
}

// WithNodeJSFile adds a file override that will be copied into the Node.js
// container before it starts. Use Reader for in-memory content or HostFilePath
// for a file on disk.
func (b *Builder) WithNodeJSFile(file testcontainers.ContainerFile) *Builder {
	b.nodeJSFiles = append(b.nodeJSFiles, file)
	return b
}

// WithEEFeatures enables enterprise license features in the Node.js container
// by patching the compiled license-fns.mjs before the app starts.
// Feature names correspond to properties in getDefaultOnPremFeatures (e.g. "rbac", "groups").
func (b *Builder) WithEEFeatures(features ...string) *Builder {
	b.eeFeatures = append(b.eeFeatures, features...)
	return b
}

// buildNodeJSCmd returns the container Cmd override when EE feature patches are needed.
// It generates sed expressions to flip feature flags from false to true in the compiled JS,
// then chains the original entrypoint.
func (b *Builder) buildNodeJSCmd() []string {
	if len(b.eeFeatures) == 0 {
		return nil
	}

	var sedExprs []string
	for _, feature := range b.eeFeatures {
		// Match the property in the compiled JS object literal, e.g. "rbac: false" → "rbac: true"
		sedExprs = append(sedExprs, fmt.Sprintf("s/%s: false/%s: true/g", feature, feature))
	}

	sedCmd := fmt.Sprintf("sed -i '%s' %s", strings.Join(sedExprs, "; "), licenseFeaturePath)
	return []string{"sh", "-c", sedCmd + " && ./standalone-entrypoint.sh"}
}

// MustStart spins up the configured containers and returns a ready-to-use Stack.
// Postgres and Redis start in parallel; NodeJS waits for both.
// Sets environment variables so config.LoadConfig() works.
// If NodeJS is requested, bootstraps an admin user/org/identity.
// Uses log.Fatalf on error (designed for TestMain).
func (b *Builder) MustStart() *Stack {
	ctx := context.Background()

	// 1. Create an isolated docker network.
	net, err := network.New(ctx)
	if err != nil {
		log.Fatalf("infra: create network: %v", err)
	}

	stack := &Stack{network: net}

	// 2. Start Postgres and Redis in parallel.
	var wg sync.WaitGroup
	var pgErr, redisErr error

	if b.wantPostgres {
		wg.Go(func() {
			stack.postgres, pgErr = startPostgres(ctx, net.Name)
		})
	}

	if b.wantRedis {
		wg.Go(func() {
			stack.redis, redisErr = startRedis(ctx, net.Name)
		})
	}

	wg.Wait()

	if pgErr != nil {
		log.Fatalf("infra: %v", pgErr)
	}
	if redisErr != nil {
		log.Fatalf("infra: %v", redisErr)
	}

	// 3. Start NodeJS after Postgres and Redis are healthy.
	if b.wantNodeJS {
		stack.nodejs, err = startNodeJS(ctx, net.Name, b.nodeJSFiles, b.buildNodeJSCmd())
		if err != nil {
			log.Fatalf("infra: %v", err)
		}
	}

	// 4. Set environment variables for config.LoadConfig().
	stack.setEnv()

	// 5. Load application config.
	stack.cfg, err = config.LoadConfig()
	if err != nil {
		log.Fatalf("infra: load config: %v", err)
	}

	// 6. Connect to Postgres.
	if b.wantPostgres {
		stack.db, err = pg.NewPostgresDB(ctx, stack.cfg.DBConnectionURI, stack.cfg.DBRootCert, stack.cfg.DBReadReplicas)
		if err != nil {
			log.Fatalf("infra: connect db: %v", err)
		}
	}

	// 7. Bootstrap admin user/org/identity via the NodeJS API.
	if b.wantNodeJS {
		stack.nodejs.bootstrap()
	}

	// 8. Give NodeJSService access to DB for seeding helpers (e.g. toggling email verified).
	if b.wantNodeJS && stack.db != nil {
		stack.nodejs.db = stack.db
	}

	log.Println("infra: stack ready")
	return stack
}
