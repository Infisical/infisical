package settings_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// Trusted IPs are stored but not enforced today (a known security issue), so these
// tests cover storage and the plan gate only.
func TestTrustedIP(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list a trusted address with its type and comment once it is added", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		added := addTrustedIP(t, proj, "203.0.113.7", "office")

		// Assert
		got := listTrustedIPs(t, proj)
		require.Len(t, got, 1)
		require.Equal(t, added.ID, got[0].ID)
		require.Equal(t, "203.0.113.7", got[0].Address)
		require.Equal(t, "ipv4", got[0].Type)
		require.Equal(t, "office", got[0].Comment)
		require.True(t, got[0].IsActive)
	})

	t.Run("should store a CIDR range as its network address and prefix", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		addTrustedIP(t, proj, "198.51.100.0/24", "vpn")

		// Assert
		got := listTrustedIPs(t, proj)
		require.Len(t, got, 1)
		require.Equal(t, "198.51.100.0", got[0].Address)
		require.NotNil(t, got[0].Prefix)
		require.Equal(t, float32(24), *got[0].Prefix)
	})

	t.Run("should replace the address and comment when a trusted address is updated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		added := addTrustedIP(t, proj, "203.0.113.7", "office")

		// Action
		res, err := tn.Admin.API.UpdateTrustedIpWithResponse(t.Context(), proj.ID, added.ID,
			api.UpdateTrustedIpJSONRequestBody{IpAddress: "203.0.113.8", Comment: new("new office")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		got := listTrustedIPs(t, proj)
		require.Len(t, got, 1)
		require.Equal(t, added.ID, got[0].ID)
		require.Equal(t, "203.0.113.8", got[0].Address)
		require.Equal(t, "new office", got[0].Comment)
	})

	t.Run("should no longer list a trusted address once it is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		gone := addTrustedIP(t, proj, "203.0.113.7", "gone")
		addTrustedIP(t, proj, "203.0.113.9", "kept")

		// Action
		res, err := tn.Admin.API.DeleteTrustedIpWithResponse(t.Context(), proj.ID, gone.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.Equal(t, []string{"203.0.113.9"}, addresses(listTrustedIPs(t, proj)))
	})

	t.Run("should refuse and store nothing when the address is not an IP or CIDR block", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.AddTrustedIpWithResponse(t.Context(), proj.ID,
			api.AddTrustedIpJSONRequestBody{IpAddress: "not-an-ip", IsActive: true})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "The IP is not a valid IPv4, IPv6, or CIDR block", res.JSON400.Message)
		require.Empty(t, listTrustedIPs(t, proj))
	})

	t.Run("should refuse a project viewer and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.AddTrustedIpWithResponse(t.Context(), proj.ID,
			api.AddTrustedIpJSONRequestBody{IpAddress: "203.0.113.7", IsActive: true})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create on ip-allowlist", res.JSON403.Message)
		require.Empty(t, listTrustedIPs(t, proj))
	})
}

func TestTrustedIP_Plan(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	const refused = "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
	withoutAllowlisting := license.Enterprise().Without(license.IPAllowlisting)

	t.Run("should refuse adding a trusted address when the plan does not include IP allowlisting", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutAllowlisting))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.AddTrustedIpWithResponse(t.Context(), proj.ID,
			api.AddTrustedIpJSONRequestBody{IpAddress: "203.0.113.7", IsActive: true})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, refused, res.JSON400.Message)
		require.Empty(t, listTrustedIPs(t, proj))
	})

	t.Run("should refuse updating a trusted address when the plan does not include IP allowlisting", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		added := addTrustedIP(t, proj, "203.0.113.7", "office")
		tn.SetPlan(t, withoutAllowlisting)

		// Action
		res, err := tn.Admin.API.UpdateTrustedIpWithResponse(t.Context(), proj.ID, added.ID,
			api.UpdateTrustedIpJSONRequestBody{IpAddress: "203.0.113.8"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, refused, res.JSON400.Message)
		require.Equal(t, []string{"203.0.113.7"}, addresses(listTrustedIPs(t, proj)))
	})

	t.Run("should refuse deleting a trusted address when the plan does not include IP allowlisting", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		added := addTrustedIP(t, proj, "203.0.113.7", "office")
		tn.SetPlan(t, withoutAllowlisting)

		// Action
		res, err := tn.Admin.API.DeleteTrustedIpWithResponse(t.Context(), proj.ID, added.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, refused, res.JSON400.Message)
		require.Equal(t, []string{"203.0.113.7"}, addresses(listTrustedIPs(t, proj)))
	})
}
