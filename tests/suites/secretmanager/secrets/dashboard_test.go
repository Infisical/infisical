package secrets_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecret_DashboardList(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should count every secret it lists when a tag filter and a search match different tags", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		plain, billing := secretmanager.CreateTag(t, proj, "plain"), secretmanager.CreateTag(t, proj, "billing")
		newTaggedSecret(t, proj, "BILLING_KEY", plain)
		newTaggedSecret(t, proj, "OTHER_KEY", plain, billing)

		// Action
		keys, total := listDashboardKeys(t, tn.Admin, proj, new("billing"), new("plain"))

		// Assert
		require.ElementsMatch(t, []string{"BILLING_KEY", "OTHER_KEY"}, keys)
		require.Equal(t, float32(2), total)
	})
}
