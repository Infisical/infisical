//go:build integration

package infra

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/testcontainers/testcontainers-go"

	"github.com/infisical/api/internal/config"

	"github.com/infisical/api/internal/database/pg"
)

// Stack holds references to running containers and provides accessors
// for connection info, config, and DB pools.
type Stack struct {
	postgres *PostgresService
	redis    *RedisService
	nodejs   *NodeJSService
	network  *testcontainers.DockerNetwork
	cfg      *config.Config
	db       pg.DB
}

func (s *Stack) Postgres() *PostgresService { return s.postgres }
func (s *Stack) Redis() *RedisService       { return s.redis }
func (s *Stack) NodeJS() *NodeJSService     { return s.nodejs }
func (s *Stack) Config() *config.Config     { return s.cfg }
func (s *Stack) DB() pg.DB                  { return s.db }

// EnableLegacyAdditionalPrivileges flips the project flag that additional
// privileges are gated on. New projects default to false and no route exposes
// the column, so tests covering the legacy path have to set it directly.
func (s *Stack) EnableLegacyAdditionalPrivileges(t *testing.T, projectID string) {
	t.Helper()
	if _, err := s.db.Primary().Exec(context.Background(),
		`UPDATE projects SET "isLegacyAdditionalPrivilegesEnabled" = true WHERE id = $1`, projectID); err != nil {
		t.Fatalf("infra.EnableLegacyAdditionalPrivileges: %v", err)
	}
}

// Stop tears down all containers, the network, and closes the DB pool.
func (s *Stack) Stop() {
	ctx := context.Background()

	if s.db != nil {
		s.db.Close()
	}
	if s.nodejs != nil {
		if err := s.nodejs.container.Terminate(ctx); err != nil {
			log.Printf("infra.Stop: terminate nodejs: %v", err)
		}
	}
	if s.redis != nil {
		if err := s.redis.container.Terminate(ctx); err != nil {
			log.Printf("infra.Stop: terminate redis: %v", err)
		}
	}
	if s.postgres != nil {
		if err := s.postgres.container.Terminate(ctx); err != nil {
			log.Printf("infra.Stop: terminate postgres: %v", err)
		}
	}
	if s.network != nil {
		if err := s.network.Remove(ctx); err != nil {
			log.Printf("infra.Stop: remove network: %v", err)
		}
	}
}

// setEnv sets environment variables so config.LoadConfig() picks up
// the dynamically assigned ports from the running containers.
func (s *Stack) setEnv() {
	if s.postgres != nil {
		os.Setenv("DB_CONNECTION_URI", s.postgres.URI())
	}
	if s.redis != nil {
		os.Setenv("REDIS_URL", s.redis.URL())
	}
	os.Setenv("AUTH_SECRET", AuthSecret)
	os.Setenv("ENCRYPTION_KEY", EncryptionKey)
	os.Setenv("NODE_ENV", NodeEnv)
}
