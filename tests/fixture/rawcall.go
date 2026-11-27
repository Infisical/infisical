package fixture

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/stretchr/testify/require"
)

// RawResponse is what a RawCall got back.
type RawResponse struct {
	Status int
	Header http.Header
	Body   []byte
}

// RawCall sends a request through a principal's own client, for a route the generated client
// has no operation for yet. It keeps what the client carries (the bearer token, the tenant's
// rate-limit address, and whether redirects are followed), so it is the same caller.
// path starts with "/" and may hold a query string; in, when not nil, is sent as JSON.
func RawCall(tt *testing.T, c *api.ClientWithResponses, method, path string, in any) RawResponse {
	tt.Helper()
	cl, ok := c.ClientInterface.(*api.Client)
	require.True(tt, ok, "the client is not the generated one")

	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		require.NoError(tt, err)
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(tt.Context(), method, strings.TrimSuffix(cl.Server, "/")+path, body)
	require.NoError(tt, err)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, edit := range cl.RequestEditors {
		require.NoError(tt, edit(tt.Context(), req))
	}
	res, err := cl.Client.Do(req)
	require.NoError(tt, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(tt, err)
	return RawResponse{Status: res.StatusCode, Header: res.Header, Body: raw}
}
