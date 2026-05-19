package redis

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"

	"github.com/redis/go-redis/v9"

	"github.com/infisical/api/internal/config"
)

// maxRetries mirrors the Node.js ioredis reconnectOnError behavior.
// On a READONLY error (e.g. during failover when a master becomes a replica),
// go-redis marks the connection as bad (isBadConn), removes it from the pool,
// and on the next retry creates a fresh connection with new DNS resolution —
// equivalent to ioredis reconnectOnError returning 2 ("reconnect and resend").
// See: https://github.com/redis/go-redis/blob/master/error.go (isBadConn / shouldRetry)
const maxRetries = 3

// NewClientFromEnvConfig creates a redis.UniversalClient from the application's
// Config. It supports standalone (REDIS_URL), cluster, and sentinel modes,
// matching the Node.js backend's buildRedisFromConfig behavior.
func NewClientFromEnvConfig(cfg *config.Config) (redis.UniversalClient, error) {
	// Standalone mode via REDIS_URL.
	if cfg.RedisURL != "" {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			return nil, fmt.Errorf("parsing REDIS_URL: %w", err)
		}
		opts.MaxRetries = maxRetries
		return redis.NewClient(opts), nil
	}

	// Cluster mode.
	// go-redis automatically handles READONLY/MOVED/ASK redirects.
	if len(cfg.ParsedRedisClusterHosts) > 0 {
		addrs := hostPortAddrs(cfg.ParsedRedisClusterHosts)

		clusterOpts := &redis.ClusterOptions{
			Addrs:      addrs,
			Username:   cfg.RedisUsername,
			Password:   cfg.RedisPassword,
			MaxRetries: maxRetries,
		}

		if cfg.RedisClusterEnableTLS {
			clusterOpts.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
		}

		if cfg.RedisClusterAWSElastiCacheDNSLookupMode {
			// Skip DNS resolution for AWS ElastiCache — pass address through as-is.
			clusterOpts.Dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
				dialer := &net.Dialer{}
				return dialer.DialContext(ctx, network, addr)
			}
		}

		return redis.NewClusterClient(clusterOpts), nil
	}

	// Sentinel mode.
	// go-redis FailoverClient detects master switchover and reconnects automatically.
	if len(cfg.ParsedRedisSentinelHosts) > 0 {
		sentinelAddrs := hostPortAddrs(cfg.ParsedRedisSentinelHosts)

		failoverOpts := &redis.FailoverOptions{
			MasterName:       cfg.RedisSentinelMasterName,
			SentinelAddrs:    sentinelAddrs,
			SentinelUsername: cfg.RedisSentinelUsername,
			SentinelPassword: cfg.RedisSentinelPassword,
			Username:         cfg.RedisUsername,
			Password:         cfg.RedisPassword,
			MaxRetries:       maxRetries,
		}

		if cfg.RedisSentinelEnableTLS {
			failoverOpts.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
		}

		return redis.NewFailoverClient(failoverOpts), nil
	}

	return nil, fmt.Errorf("no Redis configuration found: set REDIS_URL, REDIS_CLUSTER_HOSTS, or REDIS_SENTINEL_HOSTS")
}

func hostPortAddrs(hosts []config.RedisHostPort) []string {
	addrs := make([]string, len(hosts))
	for i, hp := range hosts {
		addrs[i] = fmt.Sprintf("%s:%d", hp.Host, hp.Port)
	}
	return addrs
}
