// Package wait polls for something to become true.
//
// Almost everything worth asserting after a mutation lands asynchronously: a secret
// sync runs on a queue, an email is delivered by a worker, an audit log is written
// after the response returns. Sleeping for a fixed duration is how a suite becomes
// slow and flaky at the same time, so nothing here sleeps for longer than one
// interval before checking again.
package wait

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

const (
	defaultTimeout  = 30 * time.Second
	defaultInterval = 200 * time.Millisecond
)

// ErrTimeout is returned by For when the condition never held. Callers wrap it with
// what they were waiting for, since only they know how to describe it usefully.
var ErrTimeout = errors.New("condition not met before the deadline")

// Option adjusts how long and how often to poll. Both have defaults, so neither is
// positional.
type Option func(*config)

type config struct {
	timeout  time.Duration
	interval time.Duration
}

// Timeout caps the wait. Keep it under the budget rule: no test in a Shared package
// should wait more than about a minute, and one that needs to is using the wrong
// lever.
func Timeout(d time.Duration) Option { return func(c *config) { c.timeout = d } }

// Interval is how often the condition is checked.
func Interval(d time.Duration) Option { return func(c *config) { c.interval = d } }

// For polls fn until it reports done, and returns what it produced.
//
// fn returns (value, done, err). An error does not stop the polling, because the
// usual case is a resource that does not exist yet; the last one is attached to the
// timeout so a persistent failure is visible rather than silently retried away.
func For[T any](ctx context.Context, fn func(context.Context) (T, bool, error), opts ...Option) (T, error) {
	cfg := config{timeout: defaultTimeout, interval: defaultInterval}
	for _, o := range opts {
		o(&cfg)
	}

	var zero T
	deadline := time.Now().Add(cfg.timeout)
	var lastErr error

	for {
		value, done, err := fn(ctx)
		if err != nil {
			lastErr = err
		}
		if done {
			return value, nil
		}
		if time.Now().After(deadline) {
			if lastErr != nil {
				return zero, fmt.Errorf("%w after %s, last error: %w", ErrTimeout, cfg.timeout, lastErr)
			}
			return zero, fmt.Errorf("%w after %s", ErrTimeout, cfg.timeout)
		}
		select {
		case <-ctx.Done():
			return zero, ctx.Err()
		case <-time.After(cfg.interval):
		}
	}
}

// Until polls until cond holds, and fails the test naming what never happened.
//
// what is required and is phrased as the thing being waited for, because it is the
// entire failure message: "waited 30s for the sync to reach a terminal status".
func Until(tt *testing.T, what string, cond func() bool, opts ...Option) {
	tt.Helper()

	_, err := For(tt.Context(), func(context.Context) (struct{}, bool, error) {
		return struct{}{}, cond(), nil
	}, opts...)
	if err != nil {
		tt.Fatalf("waited for %s: %v", what, err)
	}
}
