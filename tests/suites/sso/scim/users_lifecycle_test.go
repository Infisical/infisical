package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

const inactiveMembership = "User organization membership is inactive"

func deactivate(t *testing.T, s *scim, membershipID string) {
	t.Helper()
	requireOK(t, s.patchUser(t, membershipID, op("replace", "", map[string]any{"active": false})), "deactivating")
}

func reactivate(t *testing.T, s *scim, membershipID string) {
	t.Helper()
	requireOK(t, s.patchUser(t, membershipID, op("replace", "", map[string]any{"active": true})), "reactivating")
}

func TestScimUser_Lifecycle(t *testing.T) {
	t.Parallel()

	for _, kind := range []idpKind{viaSAML, viaOIDC} {
		t.Run(string(kind), func(t *testing.T) {
			t.Parallel()

			t.Run("should let a provisioned person sign in, confirm the mailed code, and join the org", func(t *testing.T) {
				t.Parallel()

				// Setup
				s := setupWith(t, kind, harness.From(t).NewTenant(t))
				p := s.person()
				s.provision(t, p)

				// Action
				session := s.session(t, p)

				// Assert
				res, err := session.GetOrganizationByIdWithResponse(t.Context(), s.tn.OrgID.String())
				require.NoError(t, err)
				requireOK(t, reply{res.StatusCode(), res.Body}, "reading the org as the new member")
				require.Equal(t, "accepted", fixture.MembershipOf(t, s.tn, p.email).Status)
			})

			t.Run("should refuse SSO login when the member is deactivated", func(t *testing.T) {
				t.Parallel()

				// Setup
				s := setupWith(t, kind, harness.From(t).NewTenant(t))
				p := s.person()
				user := s.provision(t, p)
				s.session(t, p)
				deactivate(t, s, user.ID)

				// Action
				login := s.signIn(t, p)

				// Assert
				require.Nil(t, sso.RefreshCookie(login.http), "a deactivated member must not get a session")
				require.Contains(t, string(login.body), inactiveMembership)
			})

			t.Run("should cut off an open session on its next request when the member is deactivated", func(t *testing.T) {
				t.Parallel()

				// Setup
				s := setupWith(t, kind, harness.From(t).NewTenant(t))
				p := s.person()
				user := s.provision(t, p)
				session := s.session(t, p)

				// Action
				deactivate(t, s, user.ID)

				// Assert
				res, err := session.GetOrganizationByIdWithResponse(t.Context(), s.tn.OrgID.String())
				require.NoError(t, err)
				require.Equal(t, http.StatusForbidden, res.StatusCode())
				require.Contains(t, string(res.Body), inactiveMembership)
			})

			t.Run("should let a reactivated member sign in again", func(t *testing.T) {
				t.Parallel()

				// Setup
				s := setupWith(t, kind, harness.From(t).NewTenant(t))
				p := s.person()
				user := s.provision(t, p)
				s.session(t, p)
				deactivate(t, s, user.ID)

				// Action
				reactivate(t, s, user.ID)

				// Assert
				login := s.signIn(t, p)
				require.NotNilf(t, sso.RefreshCookie(login.http), "reactivated member got no session: %s", string(login.body))
			})
		})
	}

	t.Run("should sign a provisioned person straight in without a mailed code when SSO is enforced", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.enforce(t)
		p := s.person()
		s.provision(t, p)

		// Action
		login := s.signIn(t, p)

		// Assert
		require.NotNilf(t, sso.RefreshCookie(login.http), "expected a session on first login: %s", string(login.body))
	})

	t.Run("should give a reactivated member back the project access their group grants", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		proj := fixture.NewProject(t, s.tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, proj.Environments[0], "DB_URL", "postgres://")
		proj.GrantGroup(t, asGroup(s.provisionGroup(t, "engineering", user.ID)))
		s.session(t, p)
		deactivate(t, s, user.ID)

		// Action
		reactivate(t, s, user.ID)

		// Assert
		require.Equal(t, http.StatusOK, readsSecrets(t, s.session(t, p), proj))
	})

	t.Run("should refuse a self-service email change while SCIM manages the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		s.provision(t, p)
		session := s.session(t, p)

		// Action
		res, err := session.RequestEmailChangeOtpWithResponse(t.Context(), api.RequestEmailChangeOtpJSONRequestBody{NewEmail: openapi_types.Email(s.tn.Email("elsewhere"))})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Email changes are disabled because SCIM is enabled")
	})
}
