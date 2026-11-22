package templates_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestProjectTemplate_Validation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a duplicate name and keep the first template", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := newTemplate(t, tn, templateBody(map[string]any{"description": "first"}))

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{"name": first.Name, "description": "second"}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, fmt.Sprintf("A project template with the name %q already exists.", first.Name), res.JSON400.Message)
		require.Equal(t, []string{first.Name}, templateNames(t, tn))
		require.Equal(t, "first", *getTemplate(t, tn, first.ID).Description)
	})

	t.Run("should refuse a user who is not a member of the organization and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		stranger := tn.Email("stranger")

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"users": []map[string]any{{"username": stranger, "roles": []string{"viewer"}}},
		}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "The following users are not members of this organization: "+stranger, res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse a user with a role slug that is neither predefined nor in the template", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := tn.NewUser(t)

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"users": []map[string]any{{"username": user.Email, "roles": []string{"no-such-role"}}},
		}))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), `references invalid role slug \"no-such-role\"`)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse a group with a role slug that is neither predefined nor in the template", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"groups": []map[string]any{{"groupSlug": group.Slug, "roles": []string{"no-such-role"}}},
		}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, fmt.Sprintf(`Group %q references invalid role slug "no-such-role". Role must be a predefined role or defined in the template roles.`, group.Slug),
			res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse an identity with a role slug that is neither predefined nor in the template", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t)

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"identities": []map[string]any{{"identityId": identity.ID.String(), "roles": []string{"no-such-role"}}},
		}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, fmt.Sprintf(`Identity %q references invalid role slug "no-such-role". Role must be a predefined role or defined in the template roles.`, identity.ID),
			res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse an identity from outside the organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		unknown := uuid.New()

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"identities": []map[string]any{{"identityId": unknown.String(), "roles": []string{"member"}}},
		}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "The following identities do not exist in this organization: "+unknown.String(), res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse more environments than the plan allows", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.EnvironmentLimit, 2)))

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"environments": []map[string]any{env("One", "one", 1), env("Two", "two", 2), env("Three", "three", 3)},
		}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to create project template due to environment count exceeding your current limit of 2. Contact Infisical to increase limit.",
			res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse environments on a template that is not for secret manager", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{
			"type":         "kms",
			"environments": []map[string]any{env("One", "one", 1)},
		}))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cannot configure environments for non-SecretManager project templates", res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse a certificate manager template", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(map[string]any{"type": "cert-manager"}))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered %s", apierr.Body(res.Body))
		require.Equal(t, "Certificate Manager project templates are not supported", res.JSON400.Message)
		require.Empty(t, templateNames(t, tn))
	})
}
