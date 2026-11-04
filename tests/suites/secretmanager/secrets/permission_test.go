package secrets_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecret_ListTagPermissions(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the secrets carrying the tag the role allows", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		newTaggedSecret(t, proj, "ALLOWED_KEY", secretmanager.CreateTag(t, proj, "read-allowed"))
		newTaggedSecret(t, proj, "OTHER_KEY", secretmanager.CreateTag(t, proj, "other"))
		secretmanager.CreateSecret(t, proj, "dev", "UNTAGGED", "v")
		proj.NewRole(t, "tag-reader", readSecretsTagged("read-allowed"))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("tag-reader"))

		// Action
		keys := listKeys(t, reader, proj, nil)

		// Assert
		require.ElementsMatch(t, []string{"ALLOWED_KEY"}, keys)
	})

	t.Run("should leave out a secret carrying a denied tag when the list is filtered by its other tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		plain, restricted := secretmanager.CreateTag(t, proj, "plain"), secretmanager.CreateTag(t, proj, "restricted")
		newTaggedSecret(t, proj, "PLAIN_KEY", plain)
		newTaggedSecret(t, proj, "RESTRICTED_KEY", plain, restricted)
		deny := readSecretsTagged("restricted")
		deny.Inverted = true
		proj.NewRole(t, "restricted-tag-reader", fixture.Permission{Subject: "secrets", Action: []string{"read"}}, deny)
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("restricted-tag-reader"))

		// Action
		keys := listKeys(t, reader, proj, new("plain"))

		// Assert
		require.ElementsMatch(t, []string{"PLAIN_KEY"}, keys)
	})

	t.Run("should leave out a secret carrying a denied tag when a dashboard search matches only its other tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		plain, restricted := secretmanager.CreateTag(t, proj, "plain"), secretmanager.CreateTag(t, proj, "restricted")
		newTaggedSecret(t, proj, "PLAIN_KEY", plain)
		newTaggedSecret(t, proj, "RESTRICTED_KEY", plain, restricted)
		deny := readSecretsTagged("restricted")
		deny.Inverted = true
		proj.NewRole(t, "restricted-tag-reader",
			fixture.Permission{Subject: "secrets", Action: []string{"read"}},
			fixture.Permission{Subject: "secret-imports", Action: []string{"read"}},
			deny)
		reader := proj.NewUser(t, fixture.WithRoles("restricted-tag-reader"))

		// Action
		keys, _ := listDashboardKeys(t, reader, proj, new("plain"), nil)

		// Assert
		require.ElementsMatch(t, []string{"PLAIN_KEY"}, keys)
	})

	t.Run("should leave out a secret when one role allows its tag and another role denies it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		newTaggedSecret(t, proj, "SHARED_KEY", secretmanager.CreateTag(t, proj, "shared"))
		deny := readSecretsTagged("shared")
		deny.Inverted = true
		proj.NewRole(t, "shared-allow", readSecretsTagged("shared"))
		proj.NewRole(t, "shared-deny", deny)
		allowOnly := proj.NewMachineIdentity(t, fixture.WithRoles("shared-allow"))
		both := proj.NewMachineIdentity(t, fixture.WithRoles("shared-allow", "shared-deny"))

		// Action
		keys := listKeys(t, both, proj, nil)

		// Assert
		require.Empty(t, keys)
		require.ElementsMatch(t, []string{"SHARED_KEY"}, listKeys(t, allowOnly, proj, nil))
	})
}
