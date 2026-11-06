package sessionbinding_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSessionBinding_OpenSession(t *testing.T) {
	t.Parallel()

	t.Run("should refuse org resources on the next request once the org starts enforcing SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")
		alice, _ := iss.session(t, iss.login(t), other.Tenant.OrgID)
		status, body := readOrg(t, alice, other.Tenant.OrgID)
		require.Equalf(t, http.StatusOK, status, "reading the org before enforcement: %s", apierr.Body(body))
		other.Enforce(t)

		// Action
		status, body = readOrg(t, alice, other.Tenant.OrgID)

		// Assert
		requireForeignSession(t, status, body)
	})

	t.Run("should refuse a project read on the next request once the org starts enforcing SSO", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "the first read caches the project permission, enforcement can't wait for it to expire")

		// Setup
		iss, other := setup(t, "member")
		proj := fixture.NewProject(t, other.Tenant, fixture.WithProjectType("secret-manager"))
		proj.Grant(t, &harness.Principal{Kind: harness.User, Email: iss.email})
		alice, _ := iss.session(t, iss.login(t), other.Tenant.OrgID)
		status, body := readProject(t, alice, proj.ID)
		require.Equalf(t, http.StatusOK, status, "reading the project before enforcement: %s", apierr.Body(body))
		other.Enforce(t)

		// Action
		status, body = readProject(t, alice, proj.ID)

		// Assert
		requireForeignSession(t, status, body)
	})
}
