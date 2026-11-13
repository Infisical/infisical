package admin_test

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestAdminConfig_SignUp(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse signups when allowSignUp is off and send no code", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		setConfig(t, h.InstanceAdmin(t), api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(false)})
		addr := tn.Email("newcomer")

		// Action
		res, err := tn.Anonymous(t).BeginEmailSignupV3WithResponse(t.Context(),
			api.BeginEmailSignupV3JSONRequestBody{Email: openapi_types.Email(addr)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Signup's are disabled")
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool { return e.Recipient == addr })
	})

	t.Run("should still let an invited user join when allowSignUp is off", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		setConfig(t, h.InstanceAdmin(t), api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(false)})

		// Action
		user := tn.NewUser(t, harness.OrgRole("member"))

		// Assert
		m := fixture.MembershipOf(t, tn, user.Email)
		require.NotNil(t, m)
		require.Equal(t, "accepted", m.Status)
	})
}

func TestAdminConfig_LoginMethods(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse email login for a member when email is not an enabled method", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		setLoginMethods(t, h, api.UpdateAdminConfigJSONBodyEnabledLoginMethodsGoogle)

		// Action
		res := login(t, tn, member.Email)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Invalid credentials")
	})

	t.Run("should let an org admin log in with email when email is not an enabled method", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		setLoginMethods(t, h, api.UpdateAdminConfigJSONBodyEnabledLoginMethodsGoogle)

		// Action
		res := login(t, tn, tn.Admin.Email)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotEmpty(t, res.JSON200.AccessToken)
	})

	t.Run("should refuse disabling every login method and keep the config", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)
		before := config(t, admin.API)

		// Action
		res, err := admin.API.UpdateAdminConfigWithResponse(t.Context(), api.UpdateAdminConfigJSONRequestBody{
			EnabledLoginMethods: &[]api.UpdateAdminConfigJSONBodyEnabledLoginMethods{},
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "At least one login method should be enabled")
		require.Equal(t, before["enabledLoginMethods"], config(t, admin.API)["enabledLoginMethods"])
	})
}

func TestAdminUsers_Delete(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse deleting the last server admin and keep them", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)
		root := serverAdminUserIDs(t, admin.API)
		require.Len(t, root, 1)

		// Action
		res, err := admin.API.DeleteAdminUserWithResponse(t.Context(), root[0])

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot delete the only server admin on this instance")
		require.Equal(t, root, serverAdminUserIDs(t, admin.API))
	})

	t.Run("should delete a user and cut off their sessions", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)
		tn := h.NewTenant(t)
		user := tn.NewUser(t, harness.OrgRole("member"))
		before, err := user.API.GetCurrentUserWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, before.StatusCode(), before.Body)

		// Action
		res, err := admin.API.DeleteAdminUserWithResponse(t.Context(), user.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		after, err := user.API.GetCurrentUserWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, after.StatusCode(), after.Body)
		require.Nil(t, fixture.MembershipOf(t, tn, user.Email))
	})
}

func TestAdminOrganizations_Delete(t *testing.T) {
	h := harness.From(t)

	t.Run("should delete the org and tell the license server so its subscription is canceled", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)
		tn := h.NewTenant(t)
		licenseServer := fixture.LicenseServer(t, tn, tn.OrgID)

		// Action
		res, err := admin.API.DeleteAdminOrganizationWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		after, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, after.StatusCode(), after.Body)
		fixture.RequireLicenseOrgDeleted(t, licenseServer, tn.OrgID)
	})
}

func TestAdminConfig_Read(t *testing.T) {
	h := harness.From(t)
	private := []string{"instanceId", "adminIdentityIds", "fipsEnabled"}

	t.Run("should hide private config fields from a tenant admin", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		got := config(t, tn.Admin.API)

		// Assert
		require.Contains(t, got, "enabledLoginMethods")
		for _, field := range private {
			require.NotContains(t, got, field)
		}
	})

	t.Run("should hide private config fields from an anonymous caller", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		got := config(t, tn.Anonymous(t))

		// Assert
		require.Contains(t, got, "allowSignUp")
		for _, field := range private {
			require.NotContains(t, got, field)
		}
	})

	t.Run("should show private config fields to the instance admin", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)

		// Action
		got := config(t, admin.API)

		// Assert
		for _, field := range private {
			require.Contains(t, got, field)
		}
	})
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}

// config is GET /admin/config as the caller sees it.
func config(t *testing.T, c *api.ClientWithResponses) map[string]any {
	t.Helper()
	res, err := c.GetAdminConfigWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var out struct {
		Config map[string]any `json:"config"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.Config
}

// setConfig writes instance config and puts back what it changed when the test ends.
func setConfig(t *testing.T, admin *harness.Principal, body api.UpdateAdminConfigJSONRequestBody) {
	t.Helper()
	before := config(t, admin.API)

	res, err := admin.API.UpdateAdminConfigWithResponse(t.Context(), body)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

	t.Cleanup(func() {
		restore := api.UpdateAdminConfigJSONRequestBody{}
		if body.AllowSignUp != nil {
			allow, _ := before["allowSignUp"].(bool)
			restore.AllowSignUp = &allow
		}
		if body.EnabledLoginMethods != nil {
			methods := allLoginMethods()
			if raw, ok := before["enabledLoginMethods"].([]any); ok && len(raw) > 0 {
				methods = methods[:0]
				for _, m := range raw {
					methods = append(methods, api.UpdateAdminConfigJSONBodyEnabledLoginMethods(m.(string)))
				}
			}
			restore.EnabledLoginMethods = &methods
		}
		res, err := admin.API.UpdateAdminConfigWithResponse(context.WithoutCancel(t.Context()), restore)
		if err != nil || res.StatusCode() != http.StatusOK {
			t.Errorf("restoring instance config: %v %s", err, res.Body)
		}
	})
}

// setLoginMethods writes the enabled login methods as the root user, after letting it
// sign in with Google too so the lockout guard allows email to be switched off. The lockout
// guard only protects a user admin, so the claims about it need a user caller, and granting
// server admin to another user needs an instance license.
func setLoginMethods(t *testing.T, h *harness.Stack, methods ...api.UpdateAdminConfigJSONBodyEnabledLoginMethods) {
	t.Helper()
	setConfig(t, rootUser(t, h), api.UpdateAdminConfigJSONRequestBody{EnabledLoginMethods: &methods})
}

func rootUser(t *testing.T, h *harness.Stack) *harness.Principal {
	t.Helper()
	tn := h.NewTenant(t)
	res, err := tn.Anonymous(t, infisical.ForwardedFor(sourceIP())).LoginV3WithResponse(t.Context(),
		api.LoginV3JSONRequestBody{Email: infisical.RootEmail, Password: infisical.RootPassword})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ip := sourceIP()
	unscoped := tn.Client(t, res.JSON200.AccessToken, infisical.ForwardedFor(ip))
	orgs, err := h.InstanceAdmin(t).API.ListAdminOrganizationsWithResponse(t.Context(),
		&api.ListAdminOrganizationsParams{SearchTerm: new(infisical.RootOrgName)})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, orgs.StatusCode(), orgs.Body)
	require.Len(t, orgs.JSON200.Organizations, 1)
	selected, err := unscoped.SelectOrganizationV3WithResponse(t.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgs.JSON200.Organizations[0].Id.String()})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, selected.StatusCode(), selected.Body)
	root := &harness.Principal{Kind: harness.User, Email: infisical.RootEmail, Token: selected.JSON200.Token}
	root.API = tn.Client(t, root.Token, infisical.ForwardedFor(ip))

	setAuthMethods := func(ctx context.Context, methods ...api.UpdateUserAuthMethodsJSONBodyAuthMethods) {
		res, err := root.API.UpdateUserAuthMethodsWithResponse(ctx, api.UpdateUserAuthMethodsJSONRequestBody{AuthMethods: methods})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	}
	setAuthMethods(t.Context(), api.UpdateUserAuthMethodsJSONBodyAuthMethodsEmail, api.UpdateUserAuthMethodsJSONBodyAuthMethodsGoogle)
	t.Cleanup(func() {
		setAuthMethods(context.WithoutCancel(t.Context()), api.UpdateUserAuthMethodsJSONBodyAuthMethodsEmail)
	})
	return root
}

func allLoginMethods() []api.UpdateAdminConfigJSONBodyEnabledLoginMethods {
	return []api.UpdateAdminConfigJSONBodyEnabledLoginMethods{
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsEmail,
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsGoogle,
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsGithub,
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsGitlab,
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsSaml,
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsLdap,
		api.UpdateAdminConfigJSONBodyEnabledLoginMethodsOidc,
	}
}

func login(t *testing.T, tn *harness.Tenant, email string) *api.LoginV3Response {
	t.Helper()
	res, err := tn.Anonymous(t, infisical.ForwardedFor(sourceIP())).LoginV3WithResponse(t.Context(),
		api.LoginV3JSONRequestBody{Email: email, Password: harness.UserPassword})
	require.NoError(t, err)
	return res
}

func serverAdminUserIDs(t *testing.T, c *api.ClientWithResponses) []string {
	t.Helper()
	res, err := c.ListAdminUsersWithResponse(t.Context(), &api.ListAdminUsersParams{AdminsOnly: new("true")})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var ids []string
	for _, u := range res.JSON200.Users {
		if u.SuperAdmin != nil && *u.SuperAdmin {
			ids = append(ids, u.Id.String())
		}
	}
	return ids
}

func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

func TestAdminConfig_IdentityAdmin(t *testing.T) {
	h := harness.From(t)

	t.Run("should let the machine identity instance admin set the enabled login methods", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)
		methods := allLoginMethods()

		// Action
		res, err := admin.API.UpdateAdminConfigWithResponse(t.Context(), api.UpdateAdminConfigJSONRequestBody{EnabledLoginMethods: &methods})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	})
}
