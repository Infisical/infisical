package netscaler

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one NetScaler inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[ADC]
}

// Open returns the NetScaler a user addresses.
func Open(tt *testing.T, adminURL, user string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[ADC](tt, adminURL, Service.Host(), user)}
}
