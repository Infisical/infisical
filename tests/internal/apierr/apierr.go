// Package apierr formats API responses for failure messages.
package apierr

import "encoding/json"

// Body truncates a response body to something that fits in a test failure.
//
// A validation error from a route with a large schema can run to kilobytes, which
// buries the assertion that failed. The first few hundred characters carry the
// message and the field.
func Body(b []byte) string {
	const max = 400
	if len(b) > max {
		return string(b[:max]) + "..."
	}
	return string(b)
}

// Message is the message field of an error body, or "" when the body has none.
func Message(b []byte) string {
	var e struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(b, &e)
	return e.Message
}
