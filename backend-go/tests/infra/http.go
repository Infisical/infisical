//go:build integration

package infra

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/auth"
)

// ClientBuilder constructs an HTTPClient with extensible configuration.
type ClientBuilder struct {
	t              *testing.T
	router         http.Handler
	identity       *TestIdentity
	defaultHeaders http.Header
}

// NewClientBuilder creates a new client builder for the given router.
func NewClientBuilder(t *testing.T, router http.Handler) *ClientBuilder {
	t.Helper()
	return &ClientBuilder{
		t:              t,
		router:         router,
		defaultHeaders: make(http.Header),
	}
}

// Identity sets the test identity for authentication.
func (b *ClientBuilder) Identity(identity *TestIdentity) *ClientBuilder {
	b.identity = identity
	return b
}

// Header adds a default header to all requests.
func (b *ClientBuilder) Header(key, value string) *ClientBuilder {
	b.defaultHeaders.Set(key, value)
	return b
}

// Build creates the HTTPClient and starts the test server.
func (b *ClientBuilder) Build() *HTTPClient {
	b.t.Helper()

	handler := b.router
	if b.identity != nil {
		handler = applyTestIdentity(b.identity, handler)
	}

	srv := httptest.NewServer(handler)
	b.t.Cleanup(func() { srv.Close() })

	return &HTTPClient{
		t:              b.t,
		srv:            srv,
		defaultHeaders: b.defaultHeaders.Clone(),
	}
}

func applyTestIdentity(identity *TestIdentity, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := auth.WithIdentity(r.Context(), identity.ToAuthIdentity())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// HTTPClient wraps an httptest.Server for fluent request building.
type HTTPClient struct {
	t              *testing.T
	srv            *httptest.Server
	defaultHeaders http.Header
}

// Get creates a GET request builder.
func (c *HTTPClient) Get(path string) *Request {
	return c.newRequest(http.MethodGet, path)
}

// Post creates a POST request builder.
func (c *HTTPClient) Post(path string) *Request {
	return c.newRequest(http.MethodPost, path)
}

// Put creates a PUT request builder.
func (c *HTTPClient) Put(path string) *Request {
	return c.newRequest(http.MethodPut, path)
}

// Patch creates a PATCH request builder.
func (c *HTTPClient) Patch(path string) *Request {
	return c.newRequest(http.MethodPatch, path)
}

// Delete creates a DELETE request builder.
func (c *HTTPClient) Delete(path string) *Request {
	return c.newRequest(http.MethodDelete, path)
}

func (c *HTTPClient) newRequest(method, path string) *Request {
	return &Request{
		t:       c.t,
		srv:     c.srv,
		method:  method,
		path:    path,
		params:  url.Values{},
		headers: c.defaultHeaders.Clone(),
	}
}

// Request builds an HTTP request with fluent methods.
type Request struct {
	t       *testing.T
	srv     *httptest.Server
	method  string
	path    string
	params  url.Values
	headers http.Header
	body    any
}

// Param adds a query parameter.
func (r *Request) Param(key, value string) *Request {
	r.params.Set(key, value)
	return r
}

// ParamIf adds a query parameter if the value is non-nil.
func (r *Request) ParamIf(key string, value *string) *Request {
	if value != nil {
		r.params.Set(key, *value)
	}
	return r
}

// ParamBool adds a boolean query parameter if non-nil.
func (r *Request) ParamBool(key string, value *bool) *Request {
	if value != nil {
		r.params.Set(key, strconv.FormatBool(*value))
	}
	return r
}

// ParamInt adds an integer query parameter if non-nil.
func (r *Request) ParamInt(key string, value *int) *Request {
	if value != nil {
		r.params.Set(key, strconv.Itoa(*value))
	}
	return r
}

// Params encodes a struct's json-tagged fields as query parameters. Field names
// are taken from the json tag, so request structs generated from the OpenAPI
// spec (e.g. secret.ListSecretsV4Query) stay in sync with the wire contract
// automatically: a new spec param shows up as a struct field with no helper
// edit. Nil pointer fields are omitted (matching omitempty wire semantics);
// every other field is set, including required zero values.
//
// Use raw Param/ParamInt/ParamBool for negative tests that need to send invalid
// or omitted-required input, which a typed struct cannot express.
func (r *Request) Params(v any) *Request {
	r.t.Helper()

	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return r
		}
		rv = rv.Elem()
	}
	require.Equal(r.t, reflect.Struct, rv.Kind(), "Params requires a struct or pointer to struct")

	rt := rv.Type()
	for i := 0; i < rt.NumField(); i++ {
		field := rt.Field(i)
		if !field.IsExported() {
			continue
		}

		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" || name == "-" {
			continue
		}

		fv := rv.Field(i)
		if fv.Kind() == reflect.Pointer {
			if fv.IsNil() {
				continue
			}
			fv = fv.Elem()
		}

		r.params.Set(name, fmt.Sprintf("%v", fv.Interface()))
	}

	return r
}

// Header sets a request header.
func (r *Request) Header(key, value string) *Request {
	r.headers.Set(key, value)
	return r
}

// Body sets the request body. Structs/maps are JSON-encoded; []byte and
// json.RawMessage are sent verbatim (so a generated request struct round-trips
// through its own json tags, and raw payloads are not double-encoded).
func (r *Request) Body(v any) *Request {
	r.body = v
	return r
}

// RawBody sets a verbatim request body without JSON encoding. Use for negative
// tests that send malformed JSON (e.g. RawBody([]byte(`{"secretValue":`))).
func (r *Request) RawBody(b []byte) *Request {
	r.body = json.RawMessage(b)
	return r
}

// Do executes the request and returns raw body, status code, and response headers.
func (r *Request) Do() (body []byte, status int, header http.Header) {
	r.t.Helper()

	fullPath := r.path
	if len(r.params) > 0 {
		fullPath += "?" + r.params.Encode()
	}

	var bodyReader io.Reader = http.NoBody
	if r.body != nil {
		switch b := r.body.(type) {
		case json.RawMessage:
			bodyReader = bytes.NewReader(b)
		case []byte:
			bodyReader = bytes.NewReader(b)
		default:
			bodyBytes, err := json.Marshal(r.body)
			require.NoError(r.t, err, "failed to marshal request body")
			bodyReader = bytes.NewReader(bodyBytes)
		}
	}

	req, err := http.NewRequestWithContext(r.t.Context(), r.method, r.srv.URL+fullPath, bodyReader)
	require.NoError(r.t, err, "failed to create request")

	if r.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range r.headers {
		req.Header[k] = v
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(r.t, err, "failed to execute request")
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			r.t.Logf("closing response body: %v", cerr)
		}
	}()

	body, err = io.ReadAll(resp.Body)
	require.NoError(r.t, err, "failed to read response body")

	return body, resp.StatusCode, resp.Header
}

// Into executes the request and unmarshals the response into v.
// Returns an error if status >= 400.
func (r *Request) Into(v any) error {
	r.t.Helper()

	body, status, _ := r.Do()

	if status >= 400 {
		var errResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		if err := json.Unmarshal(body, &errResp); err != nil {
			return errors.New(string(body))
		}
		msg := errResp.Message
		if msg == "" {
			msg = errResp.Error
		}
		if msg == "" {
			msg = string(body)
		}
		return errors.New(msg)
	}

	if v != nil {
		return json.Unmarshal(body, v)
	}
	return nil
}

// MustInto executes the request and unmarshals the response into v.
// Fails the test if status >= 400 or unmarshal fails.
func (r *Request) MustInto(v any) {
	r.t.Helper()
	require.NoError(r.t, r.Into(v))
}

// ExpectStatus executes the request and asserts the expected status code.
// Returns the response body for further inspection if needed.
func (r *Request) ExpectStatus(expectedStatus int) []byte {
	r.t.Helper()
	body, status, _ := r.Do()
	require.Equal(r.t, expectedStatus, status, "unexpected status code: %s", string(body))
	return body
}
