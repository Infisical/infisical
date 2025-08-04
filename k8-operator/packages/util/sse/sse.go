package sse

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type SSEEvent struct {
	ID    string
	Event string
	Data  string
}

// SSEClient handles SSE connections
type SSEClient struct {
	URL    string
	Client *http.Client
}

// NewSSEClient creates a new SSE client
func NewClient(url string) *SSEClient {
	return &SSEClient{
		URL: url,
		Client: &http.Client{
			Timeout: 0, // No timeout for streaming
		},
	}
}

// Connect establishes SSE connection and returns a channel of events
func (c *SSEClient) Connect(method string, headers map[string]string, body io.Reader) (<-chan SSEEvent, <-chan error, error) {
	req, err := http.NewRequest(method, c.URL, body)
	if err != nil {
		return nil, nil, err
	}

	// Set required headers for SSE
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Content-Type", "application/json")

	for key, value := range headers {
		req.Header.Set(key, value)
	}

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

	go c.readEvents(resp.Body, eventChan, errorChan)

	return eventChan, errorChan, nil
}

// readEvents reads and parses SSE events from the response body
func (c *SSEClient) readEvents(body io.ReadCloser, eventChan chan<- SSEEvent, errorChan chan<- error) {
	defer body.Close()
	defer close(eventChan)
	defer close(errorChan)

	scanner := bufio.NewScanner(body)
	var event SSEEvent

	for scanner.Scan() {
		line := scanner.Text()

		// Empty line indicates end of event
		if line == "" {
			if event.Data != "" || event.Event != "" {
				eventChan <- event
				event = SSEEvent{} // Reset for next event
			}
			continue
		}

		// Parse event fields
		if strings.HasPrefix(line, "data: ") {
			if event.Data != "" {
				event.Data += "\n"
			}
			event.Data += strings.TrimPrefix(line, "data: ")
		} else if strings.HasPrefix(line, "event: ") {
			event.Event = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "id: ") {
			event.ID = strings.TrimPrefix(line, "id: ")
		} else if strings.HasPrefix(line, "retry: ") {
			// Parse retry value (implementation omitted for brevity)
		} else if strings.HasPrefix(line, ": ") {
			// Comment line, ignore
			continue
		}
	}

	if err := scanner.Err(); err != nil {
		errorChan <- err
	}
}
