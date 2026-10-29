package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/stretchr/testify/require"
)

func TestPrincipal_ProjectAccess(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an org admin who is not a project member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		orgAdmin := tn.NewUser(t, harness.OrgRole("admin"))

		// Action
		res := listSecrets(t, orgAdmin.API, proj, "dev", "/")

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "You are not a member of this project")
		require.Nil(t, userRoles(t, proj, orgAdmin))
	})

	t.Run("should make an org admin a project admin through grant-admin-access and record it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		orgAdmin := tn.NewUser(t, harness.OrgRole("admin"))

		// Action
		res, err := orgAdmin.API.GrantOrganizationAdminProjectAccessWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []string{"admin"}, slugs(userRoles(t, proj, orgAdmin)))
		created := createSecret(t, orgAdmin.API, proj, "dev", "/", "NEW", "value")
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		event := auditEvent(t, tn, "org-admin-accessed-project", func(m map[string]any) bool {
			return m["projectId"] == proj.ID
		})
		require.Equal(t, orgAdmin.ID.String(), event["userId"])
	})

	t.Run("should refuse grant-admin-access to an org member and add no membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.GrantOrganizationAdminProjectAccessWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Nil(t, userRoles(t, proj, member))
	})

	t.Run("should refuse an identity once it is removed from the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		identity := tn.NewMachineIdentity(t)
		proj.Grant(t, identity, "viewer")
		before := listSecrets(t, identity.API, proj, "dev", "/")
		requireStatus(t, http.StatusOK, before.StatusCode(), before.Body)

		// Action
		res, err := tn.Admin.API.DeleteProjectIdentityMembershipWithResponse(t.Context(), proj.ID, identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) {
			r := listSecrets(t, identity.API, proj, "dev", "/")
			return r.StatusCode(), r.Body
		})
		require.Contains(t, string(body), "You are not a member of this project")
	})

	t.Run("should refuse a deleted identity's token as unauthenticated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := tn.NewMachineIdentity(t)
		proj.Grant(t, identity, "viewer")

		// Action
		res, err := tn.Admin.API.DeleteMachineIdentityWithResponse(t.Context(), identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		waitForStatus(t, http.StatusUnauthorized, func() (int, []byte) {
			r := listSecrets(t, identity.API, proj, "dev", "/")
			return r.StatusCode(), r.Body
		})
	})
}

func TestPrincipal_TrustedIPs(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an identity token used from outside its trusted IPs and accept it from inside", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		trusted := sourceIP()
		identity := identityTrustedFrom(t, tn, trusted)
		proj.Grant(t, identity, "viewer")
		outside := tn.Client(t, identity.Token, infisical.ForwardedFor(sourceIP()))

		// Action
		res := listSecrets(t, outside, proj, "dev", "/")

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "You are not allowed to access this resource from the current IP address")
		inside := listSecrets(t, identity.API, proj, "dev", "/")
		requireStatus(t, http.StatusOK, inside.StatusCode(), inside.Body)
		require.Equal(t, []string{"EXISTING"}, keysOf(inside))
	})
}

// identityTrustedFrom creates an org identity whose access tokens are valid only from
// one address, logged in from that address. Its API sends that address.
func identityTrustedFrom(t *testing.T, tn *harness.Tenant, ip string) *harness.Principal {
	t.Helper()
	ctx, admin := t.Context(), tn.Admin.API
	name := "trusted-" + ip

	created, err := admin.CreateMachineIdentityWithResponse(ctx, api.CreateMachineIdentityJSONRequestBody{
		Name: name, OrganizationId: tn.OrgID.String(), Role: new("member"),
	})
	require.NoError(t, err)
	require.NotNilf(t, created.JSON200, "creating identity returned %d: %s", created.StatusCode(), created.Body)
	identityID := created.JSON200.Identity.Id

	trustedIPs := []struct {
		IpAddress string `json:"ipAddress"`
	}{{IpAddress: ip + "/32"}}
	attached, err := admin.AttachUniversalAuthWithResponse(ctx, identityID.String(), api.AttachUniversalAuthJSONRequestBody{
		AccessTokenTrustedIps: &trustedIPs,
	})
	require.NoError(t, err)
	require.NotNilf(t, attached.JSON200, "attaching universal auth returned %d: %s", attached.StatusCode(), attached.Body)

	secret, err := admin.CreateUniversalAuthClientSecretWithResponse(ctx, identityID.String(),
		api.CreateUniversalAuthClientSecretJSONRequestBody{})
	require.NoError(t, err)
	require.NotNilf(t, secret.JSON200, "creating a client secret returned %d: %s", secret.StatusCode(), secret.Body)

	login, err := tn.Anonymous(t, infisical.ForwardedFor(ip)).LoginWithUniversalAuthWithResponse(ctx,
		api.LoginWithUniversalAuthJSONRequestBody{
			ClientId:         attached.JSON200.IdentityUniversalAuth.ClientId,
			ClientSecret:     secret.JSON200.ClientSecret,
			OrganizationSlug: &tn.OrgSlug,
		})
	require.NoError(t, err)
	require.NotNilf(t, login.JSON200, "logging in returned %d: %s", login.StatusCode(), login.Body)

	token := login.JSON200.AccessToken
	return &harness.Principal{
		Kind:  harness.MachineIdentity,
		ID:    identityID,
		Name:  name,
		Token: token,
		API:   tn.Client(t, token, infisical.ForwardedFor(ip)),
	}
}
