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

// LicenseServer is the fake license server scoped to one org. A sub-org gets its own scope.
func LicenseServer(tt *testing.T, tn *harness.Tenant, orgID uuid.UUID) *fakenet.Scope[license.Plan] {
	tt.Helper()
	return license.Open(tt, FakenetAdmin(tt, tn), orgID.String())
}

// LicenseOrgDeleted reports whether the instance told the license server orgID is gone.
func LicenseOrgDeleted(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) bool {
	tt.Helper()
	return ls.Received(tt, http.MethodDelete, "/v1/organizations/"+orgID.String()) > 0
}

// RequireLicenseOrgDeleted waits for that call. It goes through the outbox, so it lands
// after the delete returns.
func RequireLicenseOrgDeleted(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) {
	tt.Helper()
	wait.Until(tt, "the license server to be told the organization is gone",
		func() bool { return LicenseOrgDeleted(tt, ls, orgID) }, wait.Timeout(60*time.Second))
}
