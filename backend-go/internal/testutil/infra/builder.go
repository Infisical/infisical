package infra

import (
	"context"
	"log"
	"sync"

	"github.com/testcontainers/testcontainers-go/network"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
)

// Builder configures which services to spin up for an integration test.
type Builder struct {
	wantPostgres bool
	wantRedis    bool
	wantNodeJS   bool
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
		wg.Add(1)
		go func() {
			defer wg.Done()
			stack.postgres, pgErr = startPostgres(ctx, net.Name)
		}()
	}

	if b.wantRedis {
		wg.Add(1)
		go func() {
			defer wg.Done()
			stack.redis, redisErr = startRedis(ctx, net.Name)
		}()
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
		stack.nodejs, err = startNodeJS(ctx, net.Name)
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

	log.Println("infra: stack ready")
	return stack
}
