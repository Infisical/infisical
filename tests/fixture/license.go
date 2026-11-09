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

// LicenseServer is the fake License Server's view of one of the tenant's organizations.
// Calls are scoped by the organization in the path, so a sub-organization has its own.
func LicenseServer(tt *testing.T, tn *harness.Tenant, orgID uuid.UUID) *fakenet.Scope[license.Plan] {
	tt.Helper()
	return license.Open(tt, FakenetAdmin(tt, tn), orgID.String())
}

// LicenseOrgDeleted reports whether the instance has told the License Server that orgID
// is gone, which is what cancels its subscription.
func LicenseOrgDeleted(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) bool {
	tt.Helper()
	return ls.Received(tt, http.MethodDelete, "/v1/organizations/"+orgID.String()) > 0
}

// RequireLicenseOrgDeleted waits for that call. It travels through the event outbox,
// so it lands after the delete has answered: allow the relay interval plus its start jitter.
func RequireLicenseOrgDeleted(tt *testing.T, ls *fakenet.Scope[license.Plan], orgID uuid.UUID) {
	tt.Helper()
	wait.Until(tt, "the license server to be told the organization is gone",
		func() bool { return LicenseOrgDeleted(tt, ls, orgID) }, wait.Timeout(60*time.Second))
}
