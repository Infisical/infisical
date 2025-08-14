package sse

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Event represents a Server-Sent Event
type Event struct {
	ID    string
	Event string
	Data  string
	Retry int
}

// Client handles SSE connections with high performance
type Client struct {
	httpClient *http.Client
	onPing     func() // Callback for ping events
}

// NewClient creates a new high-performance SSE client
func NewClient() Client {
	return Client{
		httpClient: &http.Client{
			Timeout: 0, // No timeout for streaming
			Transport: &http.Transport{
				MaxIdleConns:       100,
				IdleConnTimeout:    90 * time.Second,
				DisableCompression: true, // SSE typically doesn't benefit from compression
			},
		},
	}
}

// WithPingHandler sets a callback for ping events
func (c *Client) WithPingHandler(handler func()) *Client {
	c.onPing = handler
	return c
}

// Connect establishes an SSE connection and returns event channels
func (c *Client) Connect(ctx context.Context, req *http.Request) (<-chan Event, <-chan error, error) {
	// Configure SSE headers
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Connection", "keep-alive")

	// Add context to request
	req = req.WithContext(ctx)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	eventChan := make(chan Event, 10)
	errorChan := make(chan error, 1)

	go c.stream(ctx, resp.Body, eventChan, errorChan)

	return eventChan, errorChan, nil
}

func (c *Client) stream(ctx context.Context, body io.ReadCloser, eventChan chan<- Event, errorChan chan<- error) {
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
				if c.isPingEvent(currentEvent) {
					if c.onPing != nil {
						c.onPing()
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
		c.parseLine(line, &currentEvent, &dataBuilder)
	}

	if err := scanner.Err(); err != nil {
		select {
		case errorChan <- err:
		case <-ctx.Done():
		}
	}
}

// parseLine efficiently parses SSE protocol lines
func (c *Client) parseLine(line string, event *Event, dataBuilder *strings.Builder) {
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
func (c *Client) isPingEvent(event Event) bool {
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

// WithHTTPClient sets a custom HTTP client
func (c *Client) WithHTTPClient(client *http.Client) *Client {
	c.httpClient = client
	return c
}
