package permissions_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestProjectPermission_Errors(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should name the project in the not-a-member refusal", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")
		outsider := tn.NewMachineIdentity(t)

		// Action
		got := listSecrets(t, outsider, proj, "dev", "/", false)

		// Assert
		require.Equalf(t, http.StatusForbidden, got.status, "listing as a non-member: %s", got.body)
		require.Contains(t, string(got.body), fmt.Sprintf(
			"You are not a member of this project with ID %s. Please assign this identity to the project with the appropriate permissions, then try again.",
			proj.ID))
		require.NotContains(t, string(got.body), "plaintext")
	})

	t.Run("should refuse a secret-manager operation on a cert-manager project, naming the type", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("cert-manager"))

		// Action
		res := createSecret(t, tn.Admin, proj, "dev", "/", "API_KEY", "value")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating a secret: %s", res.Body)
		require.Equal(t, "The project is of type cert-manager. Operations of type secret-manager are not allowed.",
			res.JSON400.Message)
	})
}
