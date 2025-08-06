package sse

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type ConnectionMeta struct {
	EventChan  <-chan SSEEvent
	ErrorChan  <-chan error
	LastPingAt time.Time
	Cancel     context.CancelFunc
}

type ConnectionRegistry struct {
	Ctx    context.Context
	meta   *ConnectionMeta
	client SSEClient
	mu     sync.RWMutex

	monitorCancel context.CancelFunc
	monitorCtx    context.Context
}

func NewConnectionRegistry(ctx context.Context) *ConnectionRegistry {
	monitorCtx, monitorCancel := context.WithCancel(ctx)
	return &ConnectionRegistry{
		Ctx:           ctx,
		client:        NewClient(),
		monitorCtx:    monitorCtx,
		monitorCancel: monitorCancel,
	}
}

// create creates a new connection
func (r *ConnectionRegistry) create(req *http.Request) (*ConnectionMeta, error) {
	// Create new connection using provided request
	eventChan, errorChan, err := r.client.Connect(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	meta := &ConnectionMeta{
		EventChan:  eventChan,
		ErrorChan:  errorChan,
		LastPingAt: time.Now(),
	}

	r.meta = meta

	// Start cleanup monitor for this connection (NON-BLOCKING)
	go r.monitor(meta)

	println("Creating new connection\n")
	return meta, nil
}

// Get retrieves the existing connection
func (r *ConnectionRegistry) Get() (*ConnectionMeta, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.meta, r.meta != nil
}

// Close closes the connection
func (r *ConnectionRegistry) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.meta != nil {
		if r.meta.Cancel != nil {
			r.meta.Cancel()
		}
		r.meta = nil
	}

	// Cancel the monitor
	if r.monitorCancel != nil {
		r.monitorCancel()
	}
}

// IsConnected returns whether there's an active connection
func (r *ConnectionRegistry) IsConnected() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.meta != nil
}

// UpdateLastPing updates the last ping time
func (r *ConnectionRegistry) UpdateLastPing() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.meta != nil {
		r.meta.LastPingAt = time.Now()
	}
}

// monitor watches for connection closure and cleans up
func (r *ConnectionRegistry) monitor(meta *ConnectionMeta) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.monitorCtx.Done():
			// Context cancelled, exit monitor
			return

		case <-ticker.C:
			r.mu.RLock()
			currentMeta := r.meta
			r.mu.RUnlock()

			// Check if this monitor is still relevant
			if currentMeta != meta {
				// This connection has been replaced, exit monitor
				return
			}

			if currentMeta != nil && time.Since(currentMeta.LastPingAt) > 2*time.Minute {
				fmt.Println("Last ping was more than 2 minutes ago, closing connection")
				r.mu.Lock()
				if r.meta == meta { // Double-check under lock
					if r.meta.Cancel != nil {
						r.meta.Cancel()
					}
					r.meta = nil
				}
				r.mu.Unlock()
				return // Exit monitor after cleanup
			}
		}
	}
}

// Subscribe provides a convenient way to get events from the connection
func (r *ConnectionRegistry) Subscribe(build func() (*http.Request, error)) (<-chan SSEEvent, <-chan error, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Get existing connection if available
	if r.meta != nil {
		return r.meta.EventChan, r.meta.ErrorChan, nil
	}

	req, err := build()

	if err != nil {
		return nil, nil, err
	}

	// Create new connection if none exists
	meta, err := r.create(req)

	if err != nil {
		return nil, nil, err
	}

	return meta.EventChan, meta.ErrorChan, nil
}
