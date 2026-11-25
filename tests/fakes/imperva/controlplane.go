package imperva

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one API ID's account. State and seeds go through the
// provisioning host, which holds the uploads; the REST host reads the same account.
type ControlPlane struct {
	*fakenet.Scope[Account]
}

// Open returns the account an API ID addresses, collecting events from both hosts and
// removing both hosts' scopes, and with them the account, when the test ends.
func Open(tt *testing.T, adminURL, apiID string) *ControlPlane {
	tt.Helper()
	fakenet.Track(tt, adminURL, Provisioning.Host(), apiID)
	fakenet.Track(tt, adminURL, REST.Host(), apiID)
	fakenet.Open[Account](tt, adminURL, REST.Host(), apiID)
	return &ControlPlane{fakenet.Open[Account](tt, adminURL, Provisioning.Host(), apiID)}
}
