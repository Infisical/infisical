package website_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/website"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newSite(t *testing.T, scope string) (*httptest.Server, *website.ControlPlane) {
	t.Helper()
	srv := fakenet.New(website.Service)
	fakes := httptest.NewServer(srv)
	t.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	t.Cleanup(admin.Close)
	require.NoError(t, fakenet.Listen(t.Context(), admin.URL, ""))
	fakenet.Track(t, admin.URL, website.Service.Host(), scope)
	return fakes, website.Open(t, admin.URL, scope)
}

func fetch(t *testing.T, fakes *httptest.Server, host, token string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, fakes.URL+"/.well-known/acme-challenge/"+token, nil)
	require.NoError(t, err)
	req.Host = host
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(body)
}

func TestWebsiteFake_Challenge(t *testing.T) {
	t.Run("should serve the published key authorization on every name under the scope", func(t *testing.T) {
		// Setup
		fakes, site := newSite(t, "s1")
		site.Publish(t, "tok", "tok.thumb")

		// Action
		apex, apexBody := fetch(t, fakes, "s1.web.test", "tok")
		sub, subBody := fetch(t, fakes, site.Name("www"), "tok")

		// Assert
		require.Equal(t, http.StatusOK, apex)
		require.Equal(t, "tok.thumb", apexBody)
		require.Equal(t, http.StatusOK, sub)
		require.Equal(t, "tok.thumb", subBody)
	})

	t.Run("should answer 404 and record the fetch when the token was never published", func(t *testing.T) {
		// Setup
		fakes, site := newSite(t, "s2")

		// Action
		code, _ := fetch(t, fakes, site.Name("www"), "missing")

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.Len(t, site.State(t).Fetches, 1)
	})

	t.Run("should not serve another scope's challenge", func(t *testing.T) {
		// Setup
		fakes, site := newSite(t, "s3")
		site.Publish(t, "tok", "tok.thumb")

		// Action
		code, _ := fetch(t, fakes, website.Name("other", "www"), "tok")

		// Assert
		require.Equal(t, http.StatusNotFound, code)
	})
}
