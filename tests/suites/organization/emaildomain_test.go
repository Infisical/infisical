package organization_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestEmailDomain_Verify(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should verify a domain with the published TXT record", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := pendingDomain(t, tn)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), d.VerificationRecordName, "infisical-domain-verification="+d.VerificationCode)

		// Action
		res, err := tn.Admin.API.VerifyEmailDomainWithResponse(t.Context(), d.Id)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "verified", domainStatus(t, tn, d.Domain))
	})

	t.Run("should refuse verification when no TXT record exists and leave it pending", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := pendingDomain(t, tn)

		// Action
		res, err := tn.Admin.API.VerifyEmailDomainWithResponse(t.Context(), d.Id)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "pending", domainStatus(t, tn, d.Domain))
	})

	t.Run("should refuse verification when the TXT record holds another value and leave it pending", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := pendingDomain(t, tn)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), d.VerificationRecordName, "infisical-domain-verification=wrong")

		// Action
		res, err := tn.Admin.API.VerifyEmailDomainWithResponse(t.Context(), d.Id)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "DNS TXT record not found or value does not match")
		require.Equal(t, "pending", domainStatus(t, tn, d.Domain))
	})
}

func TestEmailDomain_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a domain already verified by another org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, other)
		domain := strings.SplitN(other.Email("x"), "@", 2)[1]

		// Action
		res, err := tn.Admin.API.CreateEmailDomainWithResponse(t.Context(), api.CreateEmailDomainJSONRequestBody{Domain: domain})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "This domain is already verified by an organization")
		require.Empty(t, domainNames(t, tn))
	})

	t.Run("should refuse when the plan has no SSO feature", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SAMLSSO, license.OIDCSSO, license.LDAP)))

		// Action
		res, err := tn.Admin.API.CreateEmailDomainWithResponse(t.Context(), api.CreateEmailDomainJSONRequestBody{Domain: id.Nonce() + ".test"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to add email domain due to plan restriction")
		require.Empty(t, domainNames(t, tn))
	})

	t.Run("should refuse a member without email domain permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.CreateEmailDomainWithResponse(t.Context(), api.CreateEmailDomainJSONRequestBody{Domain: id.Nonce() + ".test"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Empty(t, domainNames(t, tn))
	})
}

type emailDomain struct {
	Id                     openapi_types.UUID
	Domain                 string
	VerificationCode       string
	VerificationRecordName string
}

func pendingDomain(t *testing.T, tn *harness.Tenant) emailDomain {
	t.Helper()
	res, err := tn.Admin.API.CreateEmailDomainWithResponse(t.Context(), api.CreateEmailDomainJSONRequestBody{Domain: id.Nonce() + ".test"})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	d := res.JSON200.EmailDomain
	return emailDomain{Id: d.Id, Domain: d.Domain, VerificationCode: d.VerificationCode, VerificationRecordName: d.VerificationRecordName}
}

func listDomains(t *testing.T, tn *harness.Tenant) *api.ListEmailDomainsResponse {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).ListEmailDomainsWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res
}

func domainNames(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	var out []string
	for _, d := range listDomains(t, tn).JSON200.EmailDomains {
		out = append(out, d.Domain)
	}
	return out
}

func domainStatus(t *testing.T, tn *harness.Tenant, domain string) string {
	t.Helper()
	for _, d := range listDomains(t, tn).JSON200.EmailDomains {
		if d.Domain == domain {
			return deref(d.Status)
		}
	}
	t.Fatalf("domain %s is not listed", domain)
	return ""
}
