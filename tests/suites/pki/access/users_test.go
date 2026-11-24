package access_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

// invite adds an organization user to Certificate Manager with a role.
func invite(t *testing.T, tn *harness.Tenant, u *harness.Principal, role string) {
	t.Helper()
	res, err := tn.Admin.API.InviteCertManagerUsersWithResponse(t.Context(), api.InviteCertManagerUsersJSONRequestBody{
		Emails:    &[]openapi_types.Email{openapi_types.Email(strings.ToLower(u.Email))},
		RoleSlugs: &[]string{role},
	})
	require.NoError(t, err)
	requireOK(t, res.StatusCode(), res.Body, "inviting the user")
}

func TestCertManagerAccess_Users(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give an invited organization user the member role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		u := tn.NewUser(t, harness.WithName("bob"))

		// Action
		invite(t, tn, u, "member")

		// Assert
		res, err := tn.Admin.API.GetCertManagerUserWithResponse(t.Context(), u.ID)
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the membership returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Len(t, res.JSON200.Membership.Roles, 1)
		require.Equal(t, "member", res.JSON200.Membership.Roles[0].Role)
		requirePolicyRefused(t, tn, u)
	})

	t.Run("should list the invited user beside the admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		u := tn.NewUser(t, harness.WithName("bob"))
		invite(t, tn, u, "member")

		// Action
		res, err := tn.Admin.API.ListCertManagerUsersWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing users returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []string
		for _, m := range res.JSON200.Memberships {
			ids = append(ids, m.UserId.String())
		}
		require.ElementsMatch(t, []string{tn.Admin.ID.String(), u.ID.String()}, ids)
	})

	t.Run("should let a member promoted to admin create a policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		u := tn.NewUser(t, harness.WithName("bob"))
		invite(t, tn, u, "member")

		// Action
		res, err := tn.Admin.API.UpdateCertManagerUserWithBodyWithResponse(t.Context(), u.ID, "application/json", rolesBody(t, "admin"))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body, "updating the user's role")
		requirePolicyCreated(t, tn, u)
	})

	t.Run("should stop a removed user listing the project's CAs", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "a principal's project permissions are cached for up to 10 seconds, so the refusal is polled for")

		// Setup
		tn := h.NewTenant(t)
		u := tn.NewUser(t, harness.WithName("bob"))
		invite(t, tn, u, "member")
		requireOK(t, listCAsStatus(t, u), nil, "listing CAs as a member")

		// Action
		res, err := tn.Admin.API.RemoveCertManagerUserWithResponse(t.Context(), u.ID)

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body, "removing the user")
		got, err := wait.For(t.Context(), func(ctx context.Context) (*api.ListCertificateAuthoritiesV1GeneralResponse, bool, error) {
			res, err := u.API.ListCertificateAuthoritiesV1GeneralWithResponse(ctx, nil)
			if err != nil {
				return nil, false, err
			}
			status := res.StatusCode()
			if status == http.StatusOK || status == http.StatusTooManyRequests || status >= 500 {
				return nil, false, fmt.Errorf("listing CAs returned %d: %s", status, apierr.Body(res.Body))
			}
			return res, true, nil
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, got.StatusCode(), "listing CAs after removal: %s", apierr.Body(got.Body))
	})
}
