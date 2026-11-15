package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretRotation_CheckCredentials(t *testing.T) {
	t.Parallel()

	t.Run("should pass when the active credential logs in", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)

		// Action
		res := r.check(t, e.tn.Admin.API)

		// Assert
		requireStatus(t, http.StatusNoContent, res.StatusCode(), res.Body)
	})

	t.Run("should fail and leave the secrets when the active credential was changed at the database", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		published := e.published(t, "/")
		e.target.SetPassword(t, published.name, "changed-out-of-band")

		// Action
		res := r.check(t, e.tn.Admin.API)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "password authentication failed")
		require.Equal(t, published, e.published(t, "/"))
	})
}
