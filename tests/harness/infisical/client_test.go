package infisical_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/stretchr/testify/require"
)

func TestNewClient_Redirects(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/landed" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "jid", Value: "refresh", Path: "/api"})
		http.Redirect(w, r, "/landed", http.StatusFound)
	}))
	t.Cleanup(server.Close)

	t.Run("should follow a redirect when NoRedirects is not passed", func(t *testing.T) {
		t.Parallel()

		// Setup
		client, err := infisical.NewClient(server.URL)
		require.NoError(t, err)

		// Action
		res, err := client.RedirectSamlByOrgSlugWithResponse(t.Context(), "acme", nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
	})

	t.Run("should return the redirect with its location and cookie when NoRedirects is passed", func(t *testing.T) {
		t.Parallel()

		// Setup
		client, err := infisical.NewClient(server.URL, infisical.NoRedirects())
		require.NoError(t, err)

		// Action
		res, err := client.RedirectSamlByOrgSlugWithResponse(t.Context(), "acme", &api.RedirectSamlByOrgSlugParams{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusFound, res.StatusCode())
		require.Equal(t, "/landed", res.HTTPResponse.Header.Get("Location"))
		require.Len(t, res.HTTPResponse.Cookies(), 1)
		require.Equal(t, "jid", res.HTTPResponse.Cookies()[0].Name)
	})
}
