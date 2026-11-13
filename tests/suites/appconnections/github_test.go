package appconnections_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestGitHubAppConnection_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the connection when GitHub rejects the token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		token := id.Nonce()
		gh := github.Open(t, fixture.FakenetAdmin(t, tn), token)
		gh.Fail(t, "", "*", http.StatusUnauthorized)
		body, err := fixture.GitHubPATAppConnectionBody("refused-"+id.Short(), token)
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.CreateGitHubAppConnectionWithBodyWithResponse(t.Context(),
			"application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		require.Equal(t, 1, gh.Received(t, "GET", "/user"), "Infisical never checked the token with GitHub")
		require.NotEqual(t, http.StatusOK, res.StatusCode(),
			"the connection was created despite a refused token")
	})
}
