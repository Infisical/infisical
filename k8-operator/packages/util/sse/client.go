package sse

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type SSEEvent struct {
	ID    string
	Event string
	Data  string
}

// SSEClient handles SSE connections
type SSEClient struct {
	URL             string
	Client          *http.Client
	LastHealthCheck time.Time
	mu              *sync.Mutex // for safe concurrent access to LastHealthCheck
}

// NewClient creates a new SSE client
func NewClient() SSEClient {
	return SSEClient{
		mu: &sync.Mutex{},
		Client: &http.Client{
			Timeout: 0, // No timeout for streaming
		},
	}
}

// Connect establishes SSE connection and returns a channel of events
func (c *SSEClient) Connect(req *http.Request) (<-chan SSEEvent, <-chan error, error) {
	// Set required headers for SSE
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, nil, err
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	eventChan := make(chan SSEEvent)
	errorChan := make(chan error)

	go c.stream(resp.Body, eventChan, errorChan)

	return eventChan, errorChan, nil
}

func (c *SSEClient) stream(body io.ReadCloser, eventChan chan<- SSEEvent, errorChan chan<- error) {
	defer body.Close()
	defer close(eventChan)
	defer close(errorChan)

	scanner := bufio.NewScanner(body)
	var event SSEEvent

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// End of event
		if line == "" {
			if event.Data != "" || event.Event != "" {
				if strings.TrimSpace(event.Data) == "1" {
					c.mu.Lock()
					c.LastHealthCheck = time.Now()
					c.mu.Unlock()
				} else if event.Event != "ping" {
					eventChan <- event
				}

				event = SSEEvent{} // Reset for next event
			}
			continue
		}

		switch {
		case strings.HasPrefix(line, "data:"):
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if event.Data != "" {
				event.Data += "\n"
			}
			event.Data += data

		case strings.HasPrefix(line, "event:"):
			event.Event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))

		case strings.HasPrefix(line, "id:"):
			event.ID = strings.TrimSpace(strings.TrimPrefix(line, "id:"))

		case strings.HasPrefix(line, "retry:"):
			// Optional: parse and apply retry interval here

		case strings.HasPrefix(line, ":"):
			// Comment line — ignored
		default:
			// Unknown line format — can log/debug if needed
		}
	}

	if err := scanner.Err(); err != nil {
		errorChan <- err
	}
}
