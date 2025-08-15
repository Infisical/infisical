package sse

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Event represents a Server-Sent Event
type Event struct {
	ID    string
	Event string
	Data  string
	Retry int
}

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
	mu   sync.RWMutex
	conn *ConnectionMeta

	monitorOnce sync.Once
	monitorStop chan struct{}

	onPing func() // Callback for ping events
}

// NewConnectionRegistry creates a new high-performance connection registry
func NewConnectionRegistry(ctx context.Context) *ConnectionRegistry {
	r := &ConnectionRegistry{
		monitorStop: make(chan struct{}),
	}

	// Configure ping handler
	r.onPing = func() {
		r.UpdateLastPing()
	}

	return r
}

// Subscribe provides SSE events, creating a connection if needed
func (r *ConnectionRegistry) Subscribe(request func() (*http.Response, error)) (<-chan Event, <-chan error, error) {
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

	res, err := request()
	if err != nil {
		return nil, nil, err
	}

	conn, err := r.createStream(res)
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

func (r *ConnectionRegistry) createStream(res *http.Response) (*ConnectionMeta, error) {
	ctx, cancel := context.WithCancel(context.Background())

	eventChan, errorChan, err := r.stream(ctx, res)
	if err != nil {
		cancel()
		return nil, err
	}

	meta := &ConnectionMeta{
		EventChan: eventChan,
		ErrorChan: errorChan,
		cancel:    cancel,
	}
	meta.UpdateLastPing()

	return meta, nil
}

// stream processes SSE data from an HTTP response
func (r *ConnectionRegistry) stream(ctx context.Context, res *http.Response) (<-chan Event, <-chan error, error) {
	eventChan := make(chan Event, 10)
	errorChan := make(chan error, 1)

	go r.processStream(ctx, res.Body, eventChan, errorChan)

	return eventChan, errorChan, nil
}

// processStream reads and parses SSE events from the response body
func (r *ConnectionRegistry) processStream(ctx context.Context, body io.ReadCloser, eventChan chan<- Event, errorChan chan<- error) {
	defer body.Close()
	defer close(eventChan)
	defer close(errorChan)

	scanner := bufio.NewScanner(body)

	var currentEvent Event
	var dataBuilder strings.Builder

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line := scanner.Text()

		// Empty line indicates end of event
		if len(line) == 0 {
			if currentEvent.Data != "" || currentEvent.Event != "" {
				// Finalize data
				if dataBuilder.Len() > 0 {
					currentEvent.Data = dataBuilder.String()
					dataBuilder.Reset()
				}

				// Handle ping events
				if r.isPingEvent(currentEvent) {
					if r.onPing != nil {
						r.onPing()
					}
				} else {
					// Send non-ping events
					select {
					case eventChan <- currentEvent:
					case <-ctx.Done():
						return
					}
				}

				// Reset for next event
				currentEvent = Event{}
			}
			continue
		}

		// Parse line efficiently
		r.parseLine(line, &currentEvent, &dataBuilder)
	}

	if err := scanner.Err(); err != nil {
		select {
		case errorChan <- err:
		case <-ctx.Done():
		}
	}
}

// parseLine efficiently parses SSE protocol lines
func (r *ConnectionRegistry) parseLine(line string, event *Event, dataBuilder *strings.Builder) {
	colonIndex := strings.IndexByte(line, ':')
	if colonIndex == -1 {
		return // Invalid line format
	}

	field := line[:colonIndex]
	value := line[colonIndex+1:]

	// Trim leading space from value (SSE spec)
	if len(value) > 0 && value[0] == ' ' {
		value = value[1:]
	}

	switch field {
	case "data":
		if dataBuilder.Len() > 0 {
			dataBuilder.WriteByte('\n')
		}
		dataBuilder.WriteString(value)
	case "event":
		event.Event = value
	case "id":
		event.ID = value
	case "retry":
		// Parse retry value if needed
		// This could be used to configure reconnection delay
	case "":
		// Comment line, ignore
	}
}

// isPingEvent checks if an event is a ping/keepalive
func (r *ConnectionRegistry) isPingEvent(event Event) bool {
	// Check for common ping patterns
	if event.Event == "ping" {
		return true
	}

	// Check for heartbeat data (common pattern is "1" or similar)
	if event.Event == "" && strings.TrimSpace(event.Data) == "1" {
		return true
	}

	return false
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
