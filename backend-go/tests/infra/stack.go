//go:build integration

package infra

import (
	"context"
	"log"
	"os"

	"github.com/testcontainers/testcontainers-go"

	"github.com/infisical/api/internal/config"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/tests/infra/nodejs"
)

// Stack holds references to running containers and provides accessors
// for connection info, config, and DB pools.
type Stack struct {
	postgres *PostgresService
	redis    *RedisService
	nodeJS   *nodejs.Service
	network  *testcontainers.DockerNetwork
	cfg      *config.Config
	db       pg.DB
}

func (s *Stack) Postgres() *PostgresService { return s.postgres }
func (s *Stack) Redis() *RedisService       { return s.redis }
func (s *Stack) NodeJS() *nodejs.Service    { return s.nodeJS }
func (s *Stack) Config() *config.Config     { return s.cfg }
func (s *Stack) DB() pg.DB                  { return s.db }

// Stop tears down all containers, the network, and closes the DB pool.
func (s *Stack) Stop() {
	ctx := context.Background()

	if s.db != nil {
		s.db.Close()
	}
	if s.nodeJS != nil {
		if err := s.nodeJS.Terminate(ctx); err != nil {
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
