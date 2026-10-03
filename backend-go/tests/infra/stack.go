//go:build integration

package infra

import (
	"context"
	"fmt"
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
// the column, so tests covering the legacy path set it directly. The previous
// value is restored on cleanup, since some packages share one project fixture.
func (s *Stack) EnableLegacyAdditionalPrivileges(t *testing.T, projectID string) {
	t.Helper()
	ctx := context.Background()

	var previous bool
	if err := s.db.Primary().QueryRow(ctx,
		`SELECT "isLegacyAdditionalPrivilegesEnabled" FROM projects WHERE id = $1`, projectID,
	).Scan(&previous); err != nil {
		t.Fatalf("infra.EnableLegacyAdditionalPrivileges: reading project %s: %v", projectID, err)
	}

	if err := s.setLegacyAdditionalPrivileges(ctx, projectID, true); err != nil {
		t.Fatalf("infra.EnableLegacyAdditionalPrivileges: %v", err)
	}

	t.Cleanup(func() {
		if err := s.setLegacyAdditionalPrivileges(ctx, projectID, previous); err != nil {
			t.Errorf("infra.EnableLegacyAdditionalPrivileges cleanup: %v", err)
		}
	})
}

func (s *Stack) setLegacyAdditionalPrivileges(ctx context.Context, projectID string, enabled bool) error {
	tag, err := s.db.Primary().Exec(ctx,
		`UPDATE projects SET "isLegacyAdditionalPrivilegesEnabled" = $2 WHERE id = $1`, projectID, enabled)
	if err != nil {
		return err
	}
	// A stale or wrong ID updates nothing and would surface later as a confusing 400.
	if n := tag.RowsAffected(); n != 1 {
		return fmt.Errorf("expected 1 row updated for project %s, got %d", projectID, n)
	}
	return nil
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
