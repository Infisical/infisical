package offlineterminated_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestOfflineLicense_Terminated(t *testing.T) {
	h := harness.From(t)

	t.Run("should serve the OSS defaults when the license has terminated", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Nil(t, plan["slug"])
		require.Equal(t, false, plan["rbac"])
	})
}
