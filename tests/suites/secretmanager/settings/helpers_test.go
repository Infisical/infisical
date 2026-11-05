package settings_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

type trustedIP struct {
	ID       string
	Address  string
	Type     string
	Prefix   *float32
	Comment  string
	IsActive bool
}

func addTrustedIP(t *testing.T, proj *fixture.Project, address, comment string) trustedIP {
	t.Helper()
	res, err := proj.Tenant().Admin.API.AddTrustedIpWithResponse(t.Context(), proj.ID,
		api.AddTrustedIpJSONRequestBody{IpAddress: address, Comment: &comment, IsActive: true})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "adding trusted IP %s returned %d: %s", address, res.StatusCode(), apierr.Body(res.Body))
	return trustedIP{ID: res.JSON200.TrustedIp.Id.String(), Address: res.JSON200.TrustedIp.IpAddress}
}

func listTrustedIPs(t *testing.T, proj *fixture.Project) []trustedIP {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListTrustedIpsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing trusted IPs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := make([]trustedIP, 0, len(res.JSON200.TrustedIps))
	for _, ip := range res.JSON200.TrustedIps {
		entry := trustedIP{ID: ip.Id.String(), Address: ip.IpAddress, Type: ip.Type, Prefix: ip.Prefix}
		if ip.Comment != nil {
			entry.Comment = *ip.Comment
		}
		if ip.IsActive != nil {
			entry.IsActive = *ip.IsActive
		}
		out = append(out, entry)
	}
	return out
}

func addresses(ips []trustedIP) []string {
	out := make([]string, 0, len(ips))
	for _, ip := range ips {
		out = append(out, ip.Address)
	}
	return out
}

func projectName(t *testing.T, proj *fixture.Project) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading project returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Project.Name
}
