package infra

import (
	"context"
	"log"
	"os"

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
	network  testcontainers.Network
	cfg      *config.Config
	db       pg.DB
}

func (s *Stack) Postgres() *PostgresService { return s.postgres }
func (s *Stack) Redis() *RedisService       { return s.redis }
func (s *Stack) NodeJS() *NodeJSService     { return s.nodejs }
func (s *Stack) Config() *config.Config     { return s.cfg }
func (s *Stack) DB() pg.DB                  { return s.db }

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
