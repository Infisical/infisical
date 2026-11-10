package fixture

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
)

// LicenseServer opens the fake license server for one org. Sub-orgs get their own.
func LicenseServer(tt *testing.T, tn *harness.Tenant, orgID uuid.UUID) *fakenet.Scope[license.Plan] {
	tt.Helper()
	return license.Open(tt, FakenetAdmin(tt, tn), orgID.String())
}

// LicenseOrgDeleteCalls counts how many times the license server was told orgID is gone.
func LicenseOrgDeleteCalls(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) int {
	tt.Helper()
	return ls.Received(tt, http.MethodDelete, "/v1/organizations/"+orgID.String())
}

// LicenseOrgDeleted reports whether the license server was told orgID is gone.
func LicenseOrgDeleted(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) bool {
	tt.Helper()
	return LicenseOrgDeleteCalls(tt, ls, orgID) > 0
}

// RequireLicenseOrgDeleted waits for that call, since the outbox sends it after the delete returns.
func RequireLicenseOrgDeleted(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) {
	tt.Helper()
	wait.Until(tt, "the license server to be told the organization is gone",
		func() bool { return LicenseOrgDeleted(tt, ls, orgID) }, wait.Timeout(60*time.Second))
}
