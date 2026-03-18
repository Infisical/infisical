package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	goahttp "goa.design/goa/v3/http"
)

// TestMux wraps a Goa muxer for use in tests via httptest.
type TestMux struct {
	Mux goahttp.Muxer
	Dec func(*http.Request) goahttp.Decoder
	Enc func(context.Context, http.ResponseWriter) goahttp.Encoder
	Eh  func(context.Context, http.ResponseWriter, error)
}

// NewTestMux creates a new TestMux with default Goa encoder/decoder.
func NewTestMux() *TestMux {
	return &TestMux{
		Mux: goahttp.NewMuxer(),
		Dec: goahttp.RequestDecoder,
		Enc: goahttp.ResponseEncoder,
		Eh: func(_ context.Context, _ http.ResponseWriter, _ error) {
			// swallow errors in tests — assertions will catch them
		},
	}
}

// Request starts building an HTTP request for the test mux.
func (tm *TestMux) Request(t *testing.T, method, path string) *RequestBuilder {
	t.Helper()
	return &RequestBuilder{
		t:      t,
		mux:    tm,
		method: method,
		path:   path,
		headers: make(map[string]string),
	}
}

// RequestBuilder provides a fluent API for constructing and executing test HTTP requests.
type RequestBuilder struct {
	t       *testing.T
	mux     *TestMux
	method  string
	path    string
	body    any
	headers map[string]string
}

// WithBody sets the request body. Accepts map[string]any, struct, or io.Reader.
func (rb *RequestBuilder) WithBody(body any) *RequestBuilder {
	rb.body = body
	return rb
}

// WithAuth sets the Authorization header with a Bearer token.
func (rb *RequestBuilder) WithAuth(token string) *RequestBuilder {
	rb.headers["Authorization"] = "Bearer " + token
	return rb
}

// WithHeader sets a custom header.
func (rb *RequestBuilder) WithHeader(key, value string) *RequestBuilder {
	rb.headers[key] = value
	return rb
}

// Do executes the request and returns a Response for further assertions.
func (rb *RequestBuilder) Do() *Response {
	rb.t.Helper()

	var reqBody io.Reader
	if rb.body != nil {
		switch v := rb.body.(type) {
		case io.Reader:
			reqBody = v
		default:
			b, err := json.Marshal(v)
			if err != nil {
				rb.t.Fatalf("testutil.RequestBuilder.Do: failed to marshal body: %v", err)
			}
			reqBody = bytes.NewReader(b)
		}
	}

	req := httptest.NewRequest(rb.method, rb.path, reqBody)
	if rb.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	for k, v := range rb.headers {
		req.Header.Set(k, v)
	}

	rr := httptest.NewRecorder()
	rb.mux.Mux.ServeHTTP(rr, req)

	return &Response{t: rb.t, recorder: rr}
}

// Response wraps httptest.ResponseRecorder with fluent assertion methods.
type Response struct {
	t        *testing.T
	recorder *httptest.ResponseRecorder
}

// ExpectStatus asserts the HTTP status code matches expected.
func (r *Response) ExpectStatus(code int) *Response {
	r.t.Helper()
	if r.recorder.Code != code {
		r.t.Fatalf("expected status %d, got %d\nbody: %s", code, r.recorder.Code, r.recorder.Body.String())
	}
	return r
}

// ParseJSON unmarshals the response body into the given target.
func (r *Response) ParseJSON(target any) *Response {
	r.t.Helper()
	if err := json.Unmarshal(r.recorder.Body.Bytes(), target); err != nil {
		r.t.Fatalf("testutil.Response.ParseJSON: failed to unmarshal: %v\nbody: %s", err, r.recorder.Body.String())
	}
	return r
}

// StatusCode returns the response status code.
func (r *Response) StatusCode() int {
	return r.recorder.Code
}

// Body returns the response body as a string.
func (r *Response) Body() string {
	return r.recorder.Body.String()
}
