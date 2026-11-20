package machineidentity_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/stretchr/testify/require"
)

func TestMachineIdentity_TrustedIPs(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an identity token used from outside its trusted IPs and accept it from inside", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		trusted := sourceIP()
		identity := identityTrustedFrom(t, tn, trusted)
		outside := tn.Client(t, identity.Token, infisical.ForwardedFor(sourceIP()))

		// Action
		status, body := whoami(t, outside)

		// Assert
		requireStatus(t, http.StatusForbidden, status, body)
		require.Contains(t, string(body), "You are not allowed to access this resource from the current IP address")
		requireWorks(t, identity.API)
	})

	t.Run("should apply a narrowed allowlist to tokens issued before the update", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		token := ua.login(t, tn)
		before := tn.Client(t, token, infisical.ForwardedFor(sourceIP()))
		requireWorks(t, before)
		trusted := sourceIP()

		// Action
		res, err := tn.Admin.API.UpdateUniversalAuthWithResponse(t.Context(), ua.ID.String(),
			api.UpdateUniversalAuthJSONRequestBody{AccessTokenTrustedIps: ips(trusted + "/32")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return whoami(t, before) })
		require.Contains(t, string(body), "from the current IP address")
		requireWorks(t, tn.Client(t, token, infisical.ForwardedFor(trusted)))
	})

	t.Run("should refuse a non-wildcard allowlist when the plan lacks IP allowlisting, and keep the old one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.IPAllowlisting)))
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		old := storedIPs(getUA(t, tn, ua.ID).JSON200.IdentityUniversalAuth.AccessTokenTrustedIps)

		// Action
		res, err := tn.Admin.API.UpdateUniversalAuthWithResponse(t.Context(), ua.ID.String(),
			api.UpdateUniversalAuthJSONRequestBody{AccessTokenTrustedIps: ips(sourceIP() + "/32")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Upgrade plan to add IP access range")
		require.Equal(t, old, storedIPs(getUA(t, tn, ua.ID).JSON200.IdentityUniversalAuth.AccessTokenTrustedIps))
	})

	t.Run("should refuse an invalid CIDR and keep the old allowlist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		trusted := sourceIP() + "/32"
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenTrustedIps: ips(trusted)})

		// Action
		res, err := tn.Admin.API.UpdateUniversalAuthWithResponse(t.Context(), ua.ID.String(),
			api.UpdateUniversalAuthJSONRequestBody{AccessTokenTrustedIps: ips("10.0.0.0/99")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "The IP is not a valid IPv4, IPv6, or CIDR block")
		require.Equal(t, []string{trusted}, storedIPs(getUA(t, tn, ua.ID).JSON200.IdentityUniversalAuth.AccessTokenTrustedIps))
	})
}

// identityTrustedFrom creates an org identity whose access tokens are valid only from
// one address, logged in from that address. Its API sends that address.
func identityTrustedFrom(t *testing.T, tn *harness.Tenant, ip string) *harness.Principal {
	t.Helper()
	ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenTrustedIps: ips(ip + "/32")})
	login := uaLogin(t, tn.Anonymous(t, infisical.ForwardedFor(ip)), ua.ClientID, ua.ClientSecret, tn.OrgSlug)
	require.NotNilf(t, login.JSON200, "logging in returned %d: %s", login.StatusCode(), login.Body)

	token := login.JSON200.AccessToken
	return &harness.Principal{
		Kind:  harness.MachineIdentity,
		ID:    ua.ID,
		Name:  ua.Name,
		Token: token,
		API:   tn.Client(t, token, infisical.ForwardedFor(ip)),
	}
}
