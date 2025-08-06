package sse

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// ConnectionMeta holds metadata about an active SSE connection
type ConnectionMeta struct {
	EventChan  <-chan SSEEvent
	ErrorChan  <-chan error
	Cancel     context.CancelFunc
	LastPingAt time.Time
}

// ConnectionRegistry manages a single SSE connection with a shared client
type ConnectionRegistry struct {
	Ticker *time.Ticker
	meta   *ConnectionMeta
	client SSEClient
}

// NewConnectionRegistry creates a new registry
func NewConnectionRegistry() ConnectionRegistry {
	return ConnectionRegistry{
		Ticker: time.NewTicker(time.Second * 30),
		client: NewClient(),
	}
}

// GetOrCreate returns existing connection or creates a new one
func (r *ConnectionRegistry) GetOrCreate(
	onBuild func() (*http.Request, error),
) (*ConnectionMeta, error) {
	// First try to get existing connection
	if r.meta != nil {
		return r.meta, nil
	}

	// Create new connection
	req, err := onBuild()
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}

	// Add cancellation context
	ctx, cancel := context.WithCancel(context.Background())

	eventChan, errorChan, err := r.client.Connect(req)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	meta := &ConnectionMeta{
		EventChan:  eventChan,
		ErrorChan:  errorChan,
		Cancel:     cancel,
		LastPingAt: time.Now(),
	}

	r.meta = meta

	// Start cleanup monitor for this connection
	go r.monitor(ctx, meta)

	return meta, nil
}

// Get retrieves the existing connection
func (r *ConnectionRegistry) Get() (*ConnectionMeta, bool) {
	return r.meta, r.meta != nil
}

// Close closes the connection
func (r *ConnectionRegistry) Close() {
	if r.meta != nil {
		r.meta.Cancel()
		r.meta = nil
	}
}

// IsConnected returns whether there's an active connection
func (r *ConnectionRegistry) IsConnected() bool {
	return r.meta != nil
}

// monitorConnection watches for connection closure and cleans up
func (r *ConnectionRegistry) monitor(ctx context.Context, meta *ConnectionMeta) {
outer:
	for range r.Ticker.C {
		select {
		case <-ctx.Done():
			break outer
		default:
			if r.IsConnected() && time.Since(r.meta.LastPingAt) > 2*time.Minute {
				fmt.Println("Last ping was more than 2 minutes ago")
				r.Close()
				break outer
			} else {
				fmt.Println("Last ping was within the last 2 minutes")
			}
		}
	}

	// Clean up from registry
	if r.meta == meta {
		r.meta = nil
	}
}

// ConnectionInfo provides read-only info about a connection
type ConnectionInfo struct {
	LastPingAt time.Time
}

// Subscribe provides a convenient way to get events from the connection
func (r *ConnectionRegistry) Subscribe(
	onBuild func() (*http.Request, error),
) (<-chan SSEEvent, <-chan error, error) {
	meta, err := r.GetOrCreate(onBuild)
	if err != nil {
		return nil, nil, err
	}

	return meta.EventChan, meta.ErrorChan, nil
}

// Reconnect closes existing connection and creates a new one
func (r *ConnectionRegistry) Reconnect(
	onBuild func() (*http.Request, error),
) (*ConnectionMeta, error) {
	r.Close()
	return r.GetOrCreate(onBuild)
}
