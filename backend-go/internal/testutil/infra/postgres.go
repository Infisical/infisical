package infra

import (
	"context"
	"fmt"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// PostgresService provides access to a running PostgreSQL container.
type PostgresService struct {
	container testcontainers.Container
	uri       string
	host      string
	port      int
}

func (p *PostgresService) URI() string  { return p.uri }
func (p *PostgresService) Host() string { return p.host }
func (p *PostgresService) Port() int    { return p.port }

func startPostgres(ctx context.Context, networkName string) (*PostgresService, error) {
	req := testcontainers.ContainerRequest{
		Image:        "postgres:14-alpine",
		ExposedPorts: []string{"5432/tcp"},
		Networks:     []string{networkName},
		NetworkAliases: map[string][]string{
			networkName: {"db"},
		},
		Env: map[string]string{
			"POSTGRES_USER":     pgUser,
			"POSTGRES_PASSWORD": pgPassword,
			"POSTGRES_DB":       pgDB,
		},
		WaitingFor: wait.ForListeningPort("5432/tcp").WithStartupTimeout(60 * time.Second),
	}

	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, fmt.Errorf("starting postgres: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("getting postgres host: %w", err)
	}

	mappedPort, err := container.MappedPort(ctx, "5432/tcp")
	if err != nil {
		return nil, fmt.Errorf("getting postgres port: %w", err)
	}

	port := mappedPort.Int()
	uri := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable", pgUser, pgPassword, host, port, pgDB)

	return &PostgresService{
		container: container,
		uri:       uri,
		host:      host,
		port:      port,
	}, nil
}
