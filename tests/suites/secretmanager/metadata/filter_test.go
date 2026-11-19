package metadata_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretMetadata_ListFilter(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should not match encrypted metadata in the v4 metadata filter while the dashboard search does", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		createWithMetadata(t, proj, "PLAIN", plain("env", "prod"))
		createWithMetadata(t, proj, "ENCRYPTED", encrypted("env", "prod"))

		// Action
		status, keys, body := listFiltered(t, proj, "key=env,value=prod")

		// Assert
		require.Equalf(t, http.StatusOK, status, "filtered list returned %s", body)
		require.Equal(t, []string{"PLAIN"}, keys)
		require.ElementsMatch(t, []string{"PLAIN", "ENCRYPTED"}, keysOf(searchDashboard(t, tn.Admin, proj, "and", [2]string{"env", "prod"})))
	})

	t.Run("should return every secret when a metadata filter has only a key", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] A pair without a value is dropped while parsing, which leaves no filter
			at all, so the list is not narrowed. A later fix updates this claim.`)

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		createWithMetadata(t, proj, "LABELLED", plain("env", "prod"))
		createWithMetadata(t, proj, "UNLABELLED")

		// Action
		status, keys, body := listFiltered(t, proj, "key=env")

		// Assert
		require.Equalf(t, http.StatusOK, status, "filtered list returned %s", body)
		require.ElementsMatch(t, []string{"LABELLED", "UNLABELLED"}, keys)
	})

	t.Run("should refuse more than 10 filter pairs", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		createWithMetadata(t, proj, "LABELLED", plain("k0", "v0"))

		// Action
		status, keys, body := listFiltered(t, proj, filterPairs(11))

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, status, "filtered list returned %s", body)
		require.Contains(t, string(body), "You can only filter by up to 10 metadata fields")
		require.Empty(t, keys)
	})
}
