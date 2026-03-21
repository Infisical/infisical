package infra

import (
	"context"
	"fmt"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// RedisService provides access to a running Redis container.
type RedisService struct {
	container testcontainers.Container
	url       string
}

func (r *RedisService) URL() string { return r.url }

func startRedis(ctx context.Context, networkName string) (*RedisService, error) {
	req := testcontainers.ContainerRequest{
		Image:        "redis:7-alpine",
		ExposedPorts: []string{"6379/tcp"},
		Networks:     []string{networkName},
		NetworkAliases: map[string][]string{
			networkName: {"redis"},
		},
		WaitingFor: wait.ForListeningPort("6379/tcp").WithStartupTimeout(60 * time.Second),
	}

	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, fmt.Errorf("starting redis: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("getting redis host: %w", err)
	}

	mappedPort, err := container.MappedPort(ctx, "6379/tcp")
	if err != nil {
		return nil, fmt.Errorf("getting redis port: %w", err)
	}

	url := fmt.Sprintf("redis://%s:%d", host, mappedPort.Int())

	return &RedisService{
		container: container,
		url:       url,
	}, nil
}
