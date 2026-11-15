package webhook

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one receiving URL inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Endpoint]
}

// Open returns the endpoint a nonce addresses on a sink. The nonce has to be tracked
// with fakenet.Track before its URL reaches Infisical.
func Open(tt *testing.T, adminURL string, sink Sink, nonce string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Endpoint](tt, adminURL, sink.Host(), nonce)}
}

// Deliveries is everything the endpoint received so far, oldest first.
func (cp *ControlPlane) Deliveries(tt *testing.T) []Delivery {
	tt.Helper()
	return cp.State(tt).Deliveries
}
