package nutanix

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one Prism Central inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[PrismCentral]
}

// Open returns the Prism Central an API key addresses.
func Open(tt *testing.T, adminURL, apiKey string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[PrismCentral](tt, adminURL, Service.Host(), apiKey)}
}
