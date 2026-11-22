package sessionbinding_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSessionBinding_SelectOrganization(t *testing.T) {
	t.Parallel()

	issuers := []struct {
		name string
		new  func(*testing.T) issuer
	}{
		{"SAML", samlIssuer},
		{"OIDC", oidcIssuer},
	}
	for _, i := range issuers {
		t.Run("should refuse selection when the org enforces SSO and another org's "+i.name+" IdP issued the session", func(t *testing.T) {
			t.Parallel()

			// Setup
			iss, other := setupWith(t, i.new, "member")
			other.Enforce(t)

			// Action
			res := iss.selectOrg(t, iss.login(t), other.Tenant.OrgID)

			// Assert
			requireForeignSession(t, res.StatusCode(), res.Body)
		})
	}

	t.Run("should audit the refusal in the refusing org without naming the issuing org", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")
		other.Enforce(t)

		// Action
		iss.selectOrg(t, iss.login(t), other.Tenant.OrgID)

		// Assert
		refused := waitForAuditEvent(t, other.Tenant, "select-organization-refused", func(m map[string]any) bool {
			return m["organizationId"] == other.Tenant.OrgID.String()
		})
		require.NotContains(t, fmt.Sprint(refused), iss.tn.OrgID.String())
	})

	t.Run("should admit a session another org's IdP issued when the org does not enforce SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")

		// Action
		res := iss.selectOrg(t, iss.login(t), other.Tenant.OrgID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
	})

	t.Run("should let a member who can bypass SSO through as break-glass and alert the org's admins", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "admin")
		other.Enforce(t)

		// Action
		res := iss.selectOrg(t, iss.login(t), other.Tenant.OrgID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		alert := other.Tenant.Mail(t).Expect(t, other.Tenant.Admin.Email, smtp.Subject("SSO Bypass"))
		require.Contains(t, alert.Body, iss.email)
	})
}
