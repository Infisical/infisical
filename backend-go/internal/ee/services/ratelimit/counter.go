package ratelimit

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/go-chi/httprate"
	"github.com/redis/go-redis/v9"
)

// RedisCounter implements httprate.LimitCounter using Redis.
// Adapted from github.com/go-chi/httprate-redis to use an existing Redis client.
type RedisCounter struct {
	client            redis.UniversalClient
	prefixKey         string
	windowLength      time.Duration
	fallbackActivated atomic.Bool
	fallbackCounter   httprate.LimitCounter
	fallbackTimeout   time.Duration
	logger            *slog.Logger
	done              chan struct{}
}

var _ httprate.LimitCounter = (*RedisCounter)(nil)

// RedisCounterConfig holds configuration for the Redis counter.
type RedisCounterConfig struct {
	Client          redis.UniversalClient
	PrefixKey       string
	FallbackTimeout time.Duration
	Logger          *slog.Logger
}

// NewRedisCounter creates a new Redis-backed rate limit counter.
func NewRedisCounter(cfg *RedisCounterConfig) *RedisCounter {
	prefixKey := cfg.PrefixKey
	if prefixKey == "" {
		prefixKey = "httprate"
	}

	fallbackTimeout := cfg.FallbackTimeout
	if fallbackTimeout == 0 {
		fallbackTimeout = 250 * time.Millisecond
	}

	return &RedisCounter{
		client:          cfg.Client,
		prefixKey:       prefixKey,
		fallbackTimeout: fallbackTimeout,
		logger:          cfg.Logger,
		done:            make(chan struct{}),
	}
}

// Close stops the reconnect goroutine if running.
func (c *RedisCounter) Close() {
	select {
	case <-c.done:
		// Already closed
	default:
		close(c.done)
	}
}

// Config is called by httprate to configure the counter.
func (c *RedisCounter) Config(requestLimit int, windowLength time.Duration) {
	c.windowLength = windowLength
	c.fallbackCounter = httprate.NewLocalLimitCounter(windowLength)
}

// Increment increments the counter for the given key.
func (c *RedisCounter) Increment(key string, currentWindow time.Time) error {
	return c.IncrementBy(key, currentWindow, 1)
}

// IncrementBy increments the counter by the given amount.
func (c *RedisCounter) IncrementBy(key string, currentWindow time.Time, amount int) (err error) {
	if c.fallbackActivated.Load() {
		return c.fallbackCounter.IncrementBy(key, currentWindow, amount)
	}

	defer func() {
		if c.shouldFallback(err) {
			err = c.fallbackCounter.IncrementBy(key, currentWindow, amount)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), c.fallbackTimeout)
	defer cancel()

	hkey := c.limitCounterKey(key, currentWindow)

	pipe := c.client.TxPipeline()
	incrCmd := pipe.IncrBy(ctx, hkey, int64(amount))
	expireCmd := pipe.Expire(ctx, hkey, c.windowLength*3)

	if _, err = pipe.Exec(ctx); err != nil {
		return fmt.Errorf("redis transaction failed: %w", err)
	}
	if err = incrCmd.Err(); err != nil {
		return fmt.Errorf("redis incr failed: %w", err)
	}
	if err = expireCmd.Err(); err != nil {
		return fmt.Errorf("redis expire failed: %w", err)
	}

	return nil
}

// Get returns the current and previous window counts for the given key.
func (c *RedisCounter) Get(key string, currentWindow, previousWindow time.Time) (curr, prev int, err error) {
	if c.fallbackActivated.Load() {
		return c.fallbackCounter.Get(key, currentWindow, previousWindow)
	}

	defer func() {
		if c.shouldFallback(err) {
			curr, prev, err = c.fallbackCounter.Get(key, currentWindow, previousWindow)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), c.fallbackTimeout)
	defer cancel()

	currKey := c.limitCounterKey(key, currentWindow)
	prevKey := c.limitCounterKey(key, previousWindow)

	values, err := c.client.MGet(ctx, currKey, prevKey).Result()
	if err != nil {
		return 0, 0, fmt.Errorf("redis mget failed: %w", err)
	}
	if len(values) != 2 {
		return 0, 0, fmt.Errorf("redis mget returned %d keys, expected 2", len(values))
	}

	if values[0] != nil {
		if v, ok := values[0].(string); ok {
			n, err := strconv.Atoi(v)
			if err != nil {
				return 0, 0, fmt.Errorf("parsing current window count: %w", err)
			}
			curr = n
		}
	}
	if values[1] != nil {
		if v, ok := values[1].(string); ok {
			n, err := strconv.Atoi(v)
			if err != nil {
				return 0, 0, fmt.Errorf("parsing previous window count: %w", err)
			}
			prev = n
		}
	}

	return curr, prev, nil
}

// IsFallbackActivated returns whether the local fallback is active.
func (c *RedisCounter) IsFallbackActivated() bool {
	return c.fallbackActivated.Load()
}

func (c *RedisCounter) shouldFallback(err error) bool {
	if err == nil {
		return false
	}

	if c.logger != nil {
		c.logger.WarnContext(context.Background(), "rate limit redis error, activating fallback", slog.Any("error", err))
	}

	alreadyActivated := c.fallbackActivated.Swap(true)
	if !alreadyActivated {
		go c.reconnect()
	}

	return true
}

func (c *RedisCounter) reconnect() {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), c.fallbackTimeout)
			err := c.client.Ping(ctx).Err()
			cancel()

			if err == nil {
				c.fallbackActivated.Store(false)
				if c.logger != nil {
					c.logger.InfoContext(context.Background(), "rate limit redis reconnected")
				}
				return
			}
		}
	}
}

func (c *RedisCounter) limitCounterKey(key string, window time.Time) string {
	return fmt.Sprintf("%s:%s:%d", c.prefixKey, key, window.Unix())
}
