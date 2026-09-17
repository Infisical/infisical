// Package apierr formats API responses for failure messages.
package apierr

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
