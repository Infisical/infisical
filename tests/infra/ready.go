package infra

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

const (
	readyPoll    = 250 * time.Millisecond
	readyTimeout = 90 * time.Second
)

// ExecReady polls a command inside the container until it exits zero.
func ExecReady(cmd ...string) ReadyFunc {
	return func(ctx context.Context, c Container) error {
		return poll(ctx, fmt.Sprintf("exec %s", strings.Join(cmd, " ")), func() error {
			code, out, err := c.Exec(ctx, cmd)
			if err != nil {
				return err
			}
			if code != 0 {
				return fmt.Errorf("exit %d: %s", code, strings.TrimSpace(out))
			}
			return nil
		})
	}
}

// TCPReady polls until the mapped port accepts a connection. The weakest useful
// check: it proves something is listening, not that it works.
func TCPReady(port int) ReadyFunc {
	return func(ctx context.Context, c Container) error {
		return poll(ctx, fmt.Sprintf("tcp %d", port), func() error {
			conn, err := net.DialTimeout("tcp", c.Endpoint(External, port).HostPort(), 2*time.Second)
			if err != nil {
				return err
			}
			return conn.Close()
		})
	}
}

// HTTPReady polls until path returns a 2xx.
func HTTPReady(port int, path string) ReadyFunc {
	return func(ctx context.Context, c Container) error {
		client := &http.Client{Timeout: 3 * time.Second}
		url := c.Endpoint(External, port).URL("http") + path
		return poll(ctx, "http "+path, func() error {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				return err
			}
			resp, err := client.Do(req)
			if err != nil {
				return err
			}
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode < 200 || resp.StatusCode > 299 {
				return fmt.Errorf("status %d", resp.StatusCode)
			}
			return nil
		})
	}
}

func poll(ctx context.Context, what string, check func() error) error {
	deadline := time.Now().Add(readyTimeout)
	var last error
	for {
		if err := check(); err == nil {
			return nil
		} else {
			last = err
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s did not pass within %s, last error: %w", what, readyTimeout, last)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(readyPoll):
		}
	}
}
