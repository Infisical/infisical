package chita

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

// HTTPTest makes an HTTP request using the schema's BuildRequest to construct the URL and body.
// It returns the decoded response and status code.
func HTTPTest[Req SchemaProvider, Resp any](t *testing.T, srv *httptest.Server, method, basePath string, req Req) (result Resp, statusCode int) {
	t.Helper()

	path, bodyFields := req.Schema().BuildRequest(basePath)

	var reqBody io.Reader = http.NoBody
	if len(bodyFields) > 0 {
		b, err := json.Marshal(bodyFields)
		require.NoError(t, err)
		reqBody = bytes.NewReader(b)
	}

	httpReq, err := http.NewRequestWithContext(context.Background(), method, srv.URL+path, reqBody)
	require.NoError(t, err)

	if len(bodyFields) > 0 {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(httpReq)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	_ = json.NewDecoder(resp.Body).Decode(&result)
	statusCode = resp.StatusCode

	return
}
