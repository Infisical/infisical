package api

import (
	"context"
	"errors"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
)

type testBody struct {
	Name string `json:"name"`
}

type testResponse struct {
	Response
	JSON200 *struct {
		Name string `json:"name"`
	}
	JSON2XX     *testBody
	JSONDefault *testBody
}

// recorder answers every request with status, contentType and body, and keeps the
// last request it saw.
func recorder(t *testing.T, status int, contentType, body string) (*ClientWithResponses, *http.Request) {
	t.Helper()
	got := new(http.Request)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*got = *r.Clone(context.Background())
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	c, err := NewClientWithResponses(srv.URL + "/base")
	if err != nil {
		t.Fatal(err)
	}
	return c, got
}

func TestRequestEncodesParameters(t *testing.T) {
	c, got := recorder(t, http.StatusOK, "application/json", `{}`)
	env := "dev"
	var unsetTags []string

	req := c.newRequest(http.MethodGet, "/api/secrets/{secretName}")
	req.pathParam("secretName", "a b/c")
	req.queryParam("projectId", "p1")
	req.queryParam("environment", &env)
	req.queryParam("tags", unsetTags)
	req.queryParam("version", (*float32)(nil))
	req.headerParam("X-Trace", "t1")
	if _, err := send(t.Context(), req, nil, new(testResponse)); err != nil {
		t.Fatal(err)
	}

	if want := "/base/api/secrets/a%20b%2Fc"; got.URL.EscapedPath() != want {
		t.Errorf("path = %q, want %q", got.URL.EscapedPath(), want)
	}
	if want := "projectId=p1&environment=dev"; got.URL.RawQuery != want {
		t.Errorf("query = %q, want %q", got.URL.RawQuery, want)
	}
	if got.Header.Get("X-Trace") != "t1" {
		t.Errorf("X-Trace header = %q, want t1", got.Header.Get("X-Trace"))
	}
}

func TestRequestRejectsUnfilledPath(t *testing.T) {
	c, _ := recorder(t, http.StatusOK, "application/json", `{}`)

	_, err := send(t.Context(), c.newRequest(http.MethodGet, "/api/secrets/{secretName}"), nil, new(testResponse))

	if err == nil || !strings.Contains(err.Error(), "path parameter") {
		t.Fatalf("err = %v, want a missing path parameter error", err)
	}
}

func TestBodyAndEditors(t *testing.T) {
	var order []string
	editor := func(name string) RequestEditorFn {
		return func(context.Context, *http.Request) error {
			order = append(order, name)
			return nil
		}
	}
	c, got := recorder(t, http.StatusOK, "application/json", `{}`)
	c.editors = []RequestEditorFn{editor("client")}

	req := c.newRequest(http.MethodPost, "/api/secrets")
	req.setBody("application/json", jsonBody(testBody{Name: "x"}))
	if _, err := send(t.Context(), req, []RequestEditorFn{editor("call")}, new(testResponse)); err != nil {
		t.Fatal(err)
	}

	if got.Header.Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type = %q", got.Header.Get("Content-Type"))
	}
	if !slices.Equal(order, []string{"client", "call"}) {
		t.Errorf("editors ran in order %v, want client then call", order)
	}
}

func TestBodyEncodingErrorIsReturned(t *testing.T) {
	c, _ := recorder(t, http.StatusOK, "application/json", `{}`)

	req := c.newRequest(http.MethodPost, "/api/secrets")
	req.setBody("application/json", jsonBody(make(chan int)))
	res, err := send(t.Context(), req, nil, new(testResponse))

	if err == nil || !strings.Contains(err.Error(), "encoding request body") || res != nil {
		t.Fatalf("res, err = %v, %v; want nil and an encoding error", res, err)
	}
}

func TestDecodesTheBestMatchingStatus(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		check  func(*testResponse) bool
	}{
		{"exact code beats range", http.StatusOK, func(r *testResponse) bool { return r.JSON200 != nil && r.JSON2XX == nil }},
		{"range beats default", http.StatusCreated, func(r *testResponse) bool { return r.JSON2XX != nil && r.JSONDefault == nil }},
		{"shared error body", http.StatusNotFound, func(r *testResponse) bool { return r.JSON404 != nil && r.JSONDefault == nil }},
		{"default catches the rest", http.StatusTeapot, func(r *testResponse) bool { return r.JSONDefault != nil }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := recorder(t, tc.status, "application/json; charset=utf-8", `{"name":"x","message":"m"}`)
			res := new(testResponse)

			_, err := send(t.Context(), c.newRequest(http.MethodGet, "/x"), nil, res,
				decodeJSON("200", &res.JSON200), decodeJSON("2XX", &res.JSON2XX), decodeJSON("default", &res.JSONDefault))

			if err != nil {
				t.Fatal(err)
			}
			if !tc.check(res) {
				t.Errorf("decoded into the wrong field: %+v", res)
			}
			if res.StatusCode() != tc.status || string(res.Body) == "" {
				t.Errorf("StatusCode() = %d, Body = %q", res.StatusCode(), res.Body)
			}
		})
	}
}

func TestValidationErrorAcceptsAListOfIssues(t *testing.T) {
	c, _ := recorder(t, http.StatusUnprocessableEntity, "application/json",
		`{"reqId":"r","statusCode":422,"error":"ValidationFailure","message":[{"path":["channels"]}]}`)
	res := new(testResponse)

	_, err := send(t.Context(), c.newRequest(http.MethodPost, "/x"), nil, res)

	if err != nil {
		t.Fatal(err)
	}
	if res.JSON422 == nil || res.JSON422.Error != "ValidationFailure" {
		t.Errorf("JSON422 = %+v", res.JSON422)
	}
}

func TestOperationBodyBeatsSharedErrorBody(t *testing.T) {
	c, _ := recorder(t, http.StatusBadRequest, "application/json", `{"name":"x"}`)
	res := &struct {
		Response
		JSON400 *testBody
	}{}

	_, err := send(t.Context(), c.newRequest(http.MethodGet, "/x"), nil, res, decodeJSON("400", &res.JSON400))

	if err != nil {
		t.Fatal(err)
	}
	if res.JSON400 == nil || res.Response.JSON400 != nil {
		t.Errorf("operation body = %v, shared body = %v; want only the operation's", res.JSON400, res.Response.JSON400)
	}
}

func TestNonJSONResponseIsNotDecoded(t *testing.T) {
	c, _ := recorder(t, http.StatusOK, "text/plain", `{"name":"x"}`)
	res := new(testResponse)

	_, err := send(t.Context(), c.newRequest(http.MethodGet, "/x"), nil, res, decodeJSON("200", &res.JSON200))

	if err != nil || res.JSON200 != nil || string(res.Body) != `{"name":"x"}` {
		t.Fatalf("err = %v, JSON200 = %v, Body = %q", err, res.JSON200, res.Body)
	}
}

func TestMalformedJSONIsAnError(t *testing.T) {
	c, _ := recorder(t, http.StatusOK, "application/json", `{`)
	res := new(testResponse)

	_, err := send(t.Context(), c.newRequest(http.MethodGet, "/x"), nil, res, decodeJSON("200", &res.JSON200))

	if err == nil || !strings.Contains(err.Error(), "decoding 200 response") {
		t.Fatalf("err = %v, want a decoding error", err)
	}
}

func TestWithUnreadBodyLeavesTheStreamOpen(t *testing.T) {
	c, _ := recorder(t, http.StatusOK, "application/json", `{"name":"x"}`)
	res := new(testResponse)

	_, err := send(WithUnreadBody(t.Context()), c.newRequest(http.MethodGet, "/x"), nil, res, decodeJSON("200", &res.JSON200))

	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.HTTPResponse.Body.Close() }()
	if res.Body != nil || res.JSON200 != nil {
		t.Fatalf("Body = %q, JSON200 = %v; want both unset", res.Body, res.JSON200)
	}
	raw, err := io.ReadAll(res.HTTPResponse.Body)
	if err != nil || string(raw) != `{"name":"x"}` {
		t.Fatalf("stream = %q, %v", raw, err)
	}
}

func TestTransportErrorIsReturned(t *testing.T) {
	failing := errors.New("connection refused")
	c, err := NewClientWithResponses("http://example.invalid", WithHTTPClient(doerFunc(func(*http.Request) (*http.Response, error) {
		return nil, failing
	})))
	if err != nil {
		t.Fatal(err)
	}

	res, err := send(t.Context(), c.newRequest(http.MethodGet, "/x"), nil, new(testResponse))

	if !errors.Is(err, failing) || res != nil {
		t.Fatalf("res, err = %v, %v; want nil and the transport error", res, err)
	}
}

// The template leaves every response typed with a shared error schema to Response, so a
// status overlay.yaml points at one without a matching field here would never be decoded.
func TestResponseCoversOverlayStatuses(t *testing.T) {
	overlay, err := os.ReadFile("overlay.yaml")
	if err != nil {
		t.Fatal(err)
	}
	actions := regexp.MustCompile(`responses\[([^\]]+)\]\.content\['application/json'\]\n\s+update:\n\s+schema:\n\s+\$ref: '#/components/schemas/(\w+)'`).FindAllSubmatch(overlay, -1)
	if len(actions) == 0 {
		t.Fatal("overlay.yaml has no action pointing error responses at a shared schema")
	}
	fromOverlay := map[string]string{}
	for _, a := range actions {
		for _, code := range strings.Split(string(a[1]), ",") {
			fromOverlay["JSON"+strings.Trim(code, "' ")] = string(a[2])
		}
	}

	onResponse := map[string]string{}
	rt := reflect.TypeFor[Response]()
	for i := range rt.NumField() {
		if f := rt.Field(i); strings.HasPrefix(f.Name, "JSON") {
			onResponse[f.Name] = f.Type.Elem().Name()
		}
	}

	if !maps.Equal(fromOverlay, onResponse) {
		t.Errorf("overlay.yaml sets %v, but Response has %v", fromOverlay, onResponse)
	}
}

type doerFunc func(*http.Request) (*http.Response, error)

func (f doerFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }
