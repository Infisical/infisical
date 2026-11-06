package api

// Hand-written; `make generate-client` never touches this file.
//
// The templates in templates/ generate, per operation, a response type and the methods
// that send it. Everything those methods have in common lives here, so it is written,
// reviewed and tested once instead of being stamped out for every operation.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"strings"

	"github.com/oapi-codegen/runtime"
)

// RequestEditorFn changes a request just before it is sent.
type RequestEditorFn func(ctx context.Context, req *http.Request) error

// HttpRequestDoer sends a request. *http.Client satisfies it.
type HttpRequestDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// ClientWithResponses calls the API and decodes what it answers.
type ClientWithResponses struct {
	server  *url.URL
	doer    HttpRequestDoer
	editors []RequestEditorFn
}

// ClientOption configures a ClientWithResponses.
type ClientOption func(*ClientWithResponses) error

// NewClientWithResponses returns a client for the API served at server. A path on server
// is kept, and every operation path is resolved below it.
func NewClientWithResponses(server string, opts ...ClientOption) (*ClientWithResponses, error) {
	c := &ClientWithResponses{doer: &http.Client{}}
	for _, opt := range opts {
		if err := opt(c); err != nil {
			return nil, err
		}
	}
	if !strings.HasSuffix(server, "/") {
		server += "/"
	}
	u, err := url.Parse(server)
	if err != nil {
		return nil, fmt.Errorf("parsing server URL %q: %w", server, err)
	}
	c.server = u
	return c, nil
}

// WithHTTPClient sends requests through doer instead of a default *http.Client.
func WithHTTPClient(doer HttpRequestDoer) ClientOption {
	return func(c *ClientWithResponses) error {
		c.doer = doer
		return nil
	}
}

// WithRequestEditorFn runs fn on every request, before any per-call editors.
func WithRequestEditorFn(fn RequestEditorFn) ClientOption {
	return func(c *ClientWithResponses) error {
		c.editors = append(c.editors, fn)
		return nil
	}
}

// Response is embedded in every generated response type. It holds the raw exchange and
// the error bodies all routes share, so a generated type declares only its own bodies.
//
// The JSON4xx/5xx fields must match the statuses overlay.yaml points at ApiError and
// ApiValidationError: the template leaves those responses to this struct, so a status the
// overlay adds without a field here would not be decoded. TestResponseCoversOverlayStatuses
// holds the two together.
type Response struct {
	Body         []byte
	HTTPResponse *http.Response

	JSON400 *ApiError
	JSON401 *ApiError
	JSON403 *ApiError
	JSON404 *ApiError
	JSON422 *ApiValidationError
	JSON500 *ApiError
}

// Status returns the HTTP status line, such as "404 Not Found".
func (r *Response) Status() string {
	if r.HTTPResponse == nil {
		return http.StatusText(0)
	}
	return r.HTTPResponse.Status
}

// StatusCode returns the HTTP status code, or 0 if there was no response.
func (r *Response) StatusCode() int {
	if r.HTTPResponse == nil {
		return 0
	}
	return r.HTTPResponse.StatusCode
}

func (r *Response) base() *Response { return r }

func (r *Response) errorDecoders() []decoder {
	return []decoder{
		decodeJSON("400", &r.JSON400),
		decodeJSON("401", &r.JSON401),
		decodeJSON("403", &r.JSON403),
		decodeJSON("404", &r.JSON404),
		decodeJSON("422", &r.JSON422),
		decodeJSON("500", &r.JSON500),
	}
}

type unreadBodyKey struct{}

// WithUnreadBody makes a call return as soon as the response headers arrive, with
// HTTPResponse.Body left open for the caller to stream and close. Nothing is decoded and
// Body stays nil. Use it for endpoints that answer with a stream rather than a document.
func WithUnreadBody(ctx context.Context) context.Context {
	return context.WithValue(ctx, unreadBodyKey{}, true)
}

// responder is every generated response type, through the Response it embeds.
type responder interface {
	base() *Response
}

// request is a call being assembled by a generated method.
//
// Encoding a parameter can fail. The first failure is kept and returned by send, so a
// generated method reads as a flat list of its parameters.
type request struct {
	client      *ClientWithResponses
	method      string
	path        string
	query       []string
	header      http.Header
	hasBody     bool
	contentType string
	body        io.Reader
	err         error
}

func (c *ClientWithResponses) newRequest(method, path string) *request {
	return &request{client: c, method: method, path: path, header: http.Header{}}
}

// pathParam fills {name} in the path, in the default style for path parameters.
func (r *request) pathParam(name string, value any) {
	r.param(runtime.ParamLocationPath, "simple", false, name, value)
}

// queryParam adds a query parameter in the default style for query parameters.
func (r *request) queryParam(name string, value any) {
	r.param(runtime.ParamLocationQuery, "form", true, name, value)
}

// headerParam sets a header in the default style for header parameters.
func (r *request) headerParam(name string, value any) {
	r.param(runtime.ParamLocationHeader, "simple", false, name, value)
}

// param encodes a parameter in any style. An unset optional parameter (a nil pointer,
// slice or map) is left out.
func (r *request) param(in runtime.ParamLocation, style string, explode bool, name string, value any) {
	if r.err != nil {
		return
	}
	value, ok := deref(value)
	if !ok {
		return
	}
	encoded, err := runtime.StyleParamWithOptions(style, explode, name, value, runtime.StyleParamOptions{ParamLocation: in})
	if err != nil {
		r.err = fmt.Errorf("encoding parameter %q: %w", name, err)
		return
	}
	switch in {
	case runtime.ParamLocationPath:
		r.path = strings.ReplaceAll(r.path, "{"+name+"}", encoded)
	case runtime.ParamLocationQuery:
		r.query = append(r.query, strings.Split(encoded, "&")...)
	case runtime.ParamLocationHeader:
		r.header.Set(name, encoded)
	default:
		r.err = fmt.Errorf("parameter %q: unsupported location %v", name, in)
	}
}

func (r *request) setBody(contentType string, body io.Reader) {
	r.hasBody, r.contentType, r.body = true, contentType, body
}

// send makes the call and decodes the answer into res. A body is decoded only from a
// JSON response, into the decoder whose status matches best; the shared error bodies
// are tried after the operation's own.
func send[R responder](ctx context.Context, r *request, editors []RequestEditorFn, res R, decoders ...decoder) (R, error) {
	if err := r.do(ctx, editors, res.base(), decoders); err != nil {
		var zero R
		return zero, err
	}
	return res, nil
}

func (r *request) do(ctx context.Context, editors []RequestEditorFn, res *Response, decoders []decoder) error {
	req, err := r.build(ctx)
	if err != nil {
		return err
	}
	for _, edits := range [][]RequestEditorFn{r.client.editors, editors} {
		for _, edit := range edits {
			if err := edit(ctx, req); err != nil {
				return err
			}
		}
	}

	rsp, err := r.client.doer.Do(req)
	if err != nil {
		return err
	}
	if ctx.Value(unreadBodyKey{}) != nil {
		res.HTTPResponse = rsp
		return nil
	}
	defer func() { _ = rsp.Body.Close() }()
	body, err := io.ReadAll(rsp.Body)
	if err != nil {
		return fmt.Errorf("%s %s: reading response body: %w", r.method, r.path, err)
	}
	res.Body, res.HTTPResponse = body, rsp

	if !strings.Contains(rsp.Header.Get("Content-Type"), "json") {
		return nil
	}
	d, ok := bestMatch(rsp.StatusCode, append(decoders, res.errorDecoders()...))
	if !ok {
		return nil
	}
	if err := d.decode(body); err != nil {
		return fmt.Errorf("%s %s: decoding %d response: %w", r.method, r.path, rsp.StatusCode, err)
	}
	return nil
}

func (r *request) build(ctx context.Context) (*http.Request, error) {
	if r.err != nil {
		return nil, fmt.Errorf("%s %s: %w", r.method, r.path, r.err)
	}
	if strings.ContainsAny(r.path, "{}") {
		return nil, fmt.Errorf("%s %s: a path parameter was not set", r.method, r.path)
	}
	// Resolved relative to the server so a base path on it is kept.
	u, err := r.client.server.Parse("." + r.path)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", r.method, r.path, err)
	}
	u.RawQuery = strings.Join(r.query, "&")

	req, err := http.NewRequestWithContext(ctx, r.method, u.String(), r.body)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", r.method, r.path, err)
	}
	for name, values := range r.header {
		req.Header[name] = values
	}
	if r.hasBody {
		req.Header.Set("Content-Type", r.contentType)
	}
	return req, nil
}

// decoder fills one response field. status is the response's name in the spec: a code
// such as "200", a range such as "2XX", or "default".
type decoder struct {
	status string
	decode func(body []byte) error
}

// decodeJSON decodes into *dst. T is inferred from dst, so a generated field whose body
// is an anonymous struct is still declared only once, on the response type.
func decodeJSON[T any](status string, dst **T) decoder {
	return decoder{status: status, decode: func(body []byte) error {
		v := new(T)
		if err := json.Unmarshal(body, v); err != nil {
			return err
		}
		*dst = v
		return nil
	}}
}

// bestMatch picks the decoder for code: an exact status beats a range, which beats
// default. Among equals the first wins, so an operation's own body beats a shared one.
func bestMatch(code int, decoders []decoder) (decoder, bool) {
	var best decoder
	bestRank := 0
	for _, d := range decoders {
		if rank := d.rank(code); rank > bestRank {
			best, bestRank = d, rank
		}
	}
	return best, bestRank > 0
}

func (d decoder) rank(code int) int {
	switch {
	case d.status == strconv.Itoa(code):
		return 3
	case len(d.status) == 3 && strings.HasSuffix(d.status, "XX") && d.status[0] == byte('0'+code/100):
		return 2
	case d.status == "default":
		return 1
	default:
		return 0
	}
}

// jsonBody encodes a typed request body. A marshal error comes back from the first Read,
// so it surfaces from send like any other failure to write the request.
func jsonBody(v any) io.Reader {
	b, err := json.Marshal(v)
	if err != nil {
		return errReader{fmt.Errorf("encoding request body: %w", err)}
	}
	return bytes.NewReader(b)
}

// formBody encodes a typed application/x-www-form-urlencoded body, reporting an error
// the same way jsonBody does.
func formBody(v any) io.Reader {
	values, err := runtime.MarshalForm(v, nil)
	if err != nil {
		return errReader{fmt.Errorf("encoding request body: %w", err)}
	}
	return strings.NewReader(values.Encode())
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }

// deref unwraps a pointer and reports false for an unset optional value: a nil pointer,
// slice or map.
func deref(value any) (any, bool) {
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.Invalid:
		return nil, false
	case reflect.Pointer:
		if v.IsNil() {
			return nil, false
		}
		return v.Elem().Interface(), true
	case reflect.Slice, reflect.Map:
		return value, !v.IsNil()
	default:
		return value, true
	}
}
