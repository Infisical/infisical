package oidcidp

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one tenant's OP inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Provider]
	Tenant string
}

func Open(tt *testing.T, adminURL, tenant string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{Scope: fakenet.Open[Provider](tt, adminURL, Service.Host(), tenant), Tenant: tenant}
}

// Client registers the relying party Infisical authenticates as.
func Client(id, secret string) any { return Provider{ClientID: id, ClientSecret: secret} }

// LogIn is the person finishing the OP's login page: it returns the code the OP
// would put on the redirect back to Infisical.
func (cp *ControlPlane) LogIn(tt *testing.T, p Person) string {
	tt.Helper()
	code := randomString(16)
	cp.Seed(tt, Provider{Codes: map[string]Person{code: p}})
	return code
}
