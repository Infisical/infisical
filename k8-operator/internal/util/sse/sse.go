package sse

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// ConnectionMeta holds metadata about an SSE connection
type ConnectionMeta struct {
	EventChan  <-chan Event
	ErrorChan  <-chan error
	lastPingAt atomic.Value // stores time.Time
	cancel     context.CancelFunc
}

// LastPing returns the last ping time
func (c *ConnectionMeta) LastPing() time.Time {
	if t, ok := c.lastPingAt.Load().(time.Time); ok {
		return t
	}
	return time.Time{}
}

// UpdateLastPing atomically updates the last ping time
func (c *ConnectionMeta) UpdateLastPing() {
	c.lastPingAt.Store(time.Now())
}

// Cancel terminates the connection
func (c *ConnectionMeta) Cancel() {
	if c.cancel != nil {
		c.cancel()
	}
}

// ConnectionRegistry manages SSE connections with high performance
type ConnectionRegistry struct {
	client Client

	mu   sync.RWMutex
	conn *ConnectionMeta

	monitorOnce sync.Once
	monitorStop chan struct{}
}

// NewConnectionRegistry creates a new high-performance connection registry
func NewConnectionRegistry(ctx context.Context) *ConnectionRegistry {
	r := &ConnectionRegistry{
		monitorStop: make(chan struct{}),
	}

	// Configure client with ping handler
	r.client = NewClient()
	r.client.WithPingHandler(func() {
		r.UpdateLastPing()
	})

	return r
}

// Subscribe provides SSE events, creating a connection if needed
func (r *ConnectionRegistry) Subscribe(buildRequest func() (*http.Request, error)) (<-chan Event, <-chan error, error) {
	// Fast path: check if connection exists
	if conn := r.getConnection(); conn != nil {
		return conn.EventChan, conn.ErrorChan, nil
	}

	// Slow path: create new connection under lock
	r.mu.Lock()
	defer r.mu.Unlock()

	// Double-check after acquiring lock
	if r.conn != nil {
		return r.conn.EventChan, r.conn.ErrorChan, nil
	}

	req, err := buildRequest()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to build request: %w", err)
	}

	conn, err := r.createConnection(req)
	if err != nil {
		return nil, nil, err
	}

	r.conn = conn

	// Start monitor once
	r.monitorOnce.Do(func() {
		go r.monitorConnections()
	})

	return conn.EventChan, conn.ErrorChan, nil
}

// Get retrieves the current connection
func (r *ConnectionRegistry) Get() (*ConnectionMeta, bool) {
	conn := r.getConnection()
	return conn, conn != nil
}

// IsConnected checks if there's an active connection
func (r *ConnectionRegistry) IsConnected() bool {
	return r.getConnection() != nil
}

// UpdateLastPing updates the last ping time for the current connection
func (r *ConnectionRegistry) UpdateLastPing() {
	if conn := r.getConnection(); conn != nil {
		conn.UpdateLastPing()
	}
}

// Close gracefully shuts down the registry
func (r *ConnectionRegistry) Close() {
	// Stop monitor first
	select {
	case <-r.monitorStop:
		// Already closed
	default:
		close(r.monitorStop)
	}

	// Close connection
	r.mu.Lock()
	if r.conn != nil {
		r.conn.Cancel()
		r.conn = nil
	}
	r.mu.Unlock()
}

// getConnection returns the current connection without locking
func (r *ConnectionRegistry) getConnection() *ConnectionMeta {
	r.mu.RLock()
	conn := r.conn
	r.mu.RUnlock()
	return conn
}

// createConnection creates a new SSE connection
func (r *ConnectionRegistry) createConnection(req *http.Request) (*ConnectionMeta, error) {
	ctx, cancel := context.WithCancel(context.Background())

	eventChan, errorChan, err := r.client.Connect(ctx, req)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	meta := &ConnectionMeta{
		EventChan: eventChan,
		ErrorChan: errorChan,
		cancel:    cancel,
	}
	meta.UpdateLastPing()

	return meta, nil
}

// monitorConnections checks connection health periodically
func (r *ConnectionRegistry) monitorConnections() {
	const (
		checkInterval = 30 * time.Second
		pingTimeout   = 2 * time.Minute
	)

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for {
		select {
		case <-r.monitorStop:
			return
		case <-ticker.C:
			r.checkConnectionHealth(pingTimeout)
		}
	}
}

// checkConnectionHealth verifies connection is still alive
func (r *ConnectionRegistry) checkConnectionHealth(timeout time.Duration) {
	conn := r.getConnection()
	if conn == nil {
		return
	}

	if time.Since(conn.LastPing()) > timeout {
		// Connection is stale, close it
		r.mu.Lock()
		if r.conn == conn { // Verify it's still the same connection
			r.conn.Cancel()
			r.monitorStop <- struct{}{}
			r.conn = nil
		}
		r.mu.Unlock()
	}
}
