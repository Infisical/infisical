package machineidentity_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/ldap"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const fedLdapPassword = "workload-password-1"

func TestLdapAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for a directory user with the right password and required fields", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		dir := fedNewDirectory(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachLdap(t, tn, identityID, fedLdapConfig(dir, dir.BindPassword))

		// Action
		res := fedLoginLdap(t, tn, identityID, "svc-app", fedLdapPassword)

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a wrong password and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		dir := fedNewDirectory(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachLdap(t, tn, identityID, fedLdapConfig(dir, dir.BindPassword))

		// Action
		res := fedLoginLdap(t, tn, identityID, "svc-app", "not-the-password")

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid credentials", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a user whose entry lacks a required field value and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		dir := fedNewDirectory(t, tn)
		dir.AddUser(t, "svc-other", fedLdapPassword, map[string][]string{"departmentNumber": {"billing"}})
		identityID := fedNewIdentity(t, tn)
		fedAttachLdap(t, tn, identityID, fedLdapConfig(dir, dir.BindPassword))

		// Action
		res := fedLoginLdap(t, tn, identityID, "svc-other", fedLdapPassword)

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid credentials", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse login once the plan no longer includes LDAP and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		dir := fedNewDirectory(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachLdap(t, tn, identityID, fedLdapConfig(dir, dir.BindPassword))
		tn.SetPlan(t, license.Enterprise().Without(license.LDAP))

		// Action
		res := fedLoginLdap(t, tn, identityID, "svc-app", fedLdapPassword)

		// Assert
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to login to identity due to plan restriction. Upgrade plan to login to use LDAP authentication.",
			apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no LDAP auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginLdap(t, tn, identityID, "svc-app", fedLdapPassword)

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "LDAP auth with ID '"+identityID.String()+"' not found", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func TestLdapAuth_Attach(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse bind credentials the directory does not accept and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		dir := fedNewDirectory(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res, err := tn.Admin.API.AttachLdapAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json",
			fedJSON(t, fedLdapConfig(dir, "wrong-bind-password")))

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to connect to LDAP server. Please ensure that the LDAP server is running and your credentials are correct.",
			apierr.Message(res.Body))
		require.NotContains(t, fedAuthMethods(t, tn, identityID), "ldap-auth")
	})

	t.Run("should refuse a bind DN the directory does not know and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		dir := fedNewDirectory(t, tn)
		identityID := fedNewIdentity(t, tn)
		config := fedLdapConfig(dir, dir.BindPassword)
		config["bindDN"] = "cn=nobody," + dir.BaseDN

		// Action
		res, err := tn.Admin.API.AttachLdapAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json", fedJSON(t, config))

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to connect to LDAP server. Please ensure that the LDAP server is running and your credentials are correct.",
			apierr.Message(res.Body))
		require.NotContains(t, fedAuthMethods(t, tn, identityID), "ldap-auth")
	})

	t.Run("should refuse attaching when the plan does not include LDAP and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.LDAP)))
		dir := fedNewDirectory(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res, err := tn.Admin.API.AttachLdapAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json",
			fedJSON(t, fedLdapConfig(dir, dir.BindPassword)))

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to add LDAP Auth to identity due to plan restriction. Upgrade plan to add LDAP Auth.", apierr.Message(res.Body))
		require.NotContains(t, fedAuthMethods(t, tn, identityID), "ldap-auth")
	})
}

// fedNewDirectory opens a test-owned directory holding svc-app in the payments department.
func fedNewDirectory(t *testing.T, tn *harness.Tenant) *ldap.ControlPlane {
	t.Helper()
	dir := ldap.Open(t, fixture.FakenetAdmin(t, tn))
	dir.AddUser(t, "svc-app", fedLdapPassword, map[string][]string{"departmentNumber": {"payments"}})
	return dir
}

func fedLdapConfig(dir *ldap.ControlPlane, bindPassword string) map[string]any {
	return map[string]any{
		"url":           ldap.Service.URL(),
		"bindDN":        dir.BindDN,
		"bindPass":      bindPassword,
		"searchBase":    "ou=people," + dir.BaseDN,
		"searchFilter":  "(uid={{username}})",
		"allowedFields": []map[string]string{{"key": "departmentNumber", "value": "payments"}},
	}
}

func fedAttachLdap(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, config map[string]any) {
	t.Helper()
	res, err := tn.Admin.API.AttachLdapAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json", fedJSON(t, config))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching LDAP auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginLdap(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, username, password string) *api.LoginWithLdapAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithLdapAuthWithResponse(t.Context(), api.LoginWithLdapAuthJSONRequestBody{
		IdentityId: identityID, Username: username, Password: password,
	})
	require.NoError(t, err)
	return res
}
