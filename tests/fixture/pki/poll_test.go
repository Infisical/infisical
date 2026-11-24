package pki

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/stretchr/testify/require"
)

func respond(body string) func(context.Context) (*http.Response, error) {
	return func(context.Context) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
		}, nil
	}
}

func TestReadResponse(t *testing.T) {
	t.Run("keeps the status and body of a 200 that does not decode", func(t *testing.T) {
		_, status, body, err := ReadResponse(t.Context(), respond(`{"status":`), api.ParseGetCertificateRequestResponse)
		require.Error(t, err)
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, `{"status":`, string(body))
	})

	t.Run("decodes a valid 200", func(t *testing.T) {
		res, status, _, err := ReadResponse(t.Context(), respond(`{"status":"issued"}`), api.ParseGetCertificateRequestResponse)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		require.NotNil(t, res.JSON200)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, res.JSON200.Status)
	})
}

func TestPollOnce(t *testing.T) {
	t.Run("ends the wait with the body on a 200 that does not decode", func(t *testing.T) {
		read := func(ctx context.Context) (*api.GetCertificateRequestResponse, int, []byte, error) {
			return ReadResponse(ctx, respond(`{"status":`), api.ParseGetCertificateRequestResponse)
		}

		_, stop, err := pollOnce(t.Context(), "reading the request", read, func(*api.GetCertificateRequestResponse) bool { return false })

		require.True(t, stop)
		require.ErrorContains(t, err, `reading the request returned an unexpected 200`)
		require.ErrorContains(t, err, `{"status":`)
	})
}
