package pki

import (
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/wait"
)

// Orderer is an application issuing through a profile on an external CA, with an
// operator to request certificates.
type Orderer struct {
	App      Application
	Profile  Profile
	Operator *harness.Principal
	wait     []wait.Option
}

// NewOrderer builds an Orderer on profile. opts set how long Settled waits.
func NewOrderer(tt *testing.T, proj *Project, profile Profile, opts ...wait.Option) Orderer {
	tt.Helper()
	app := NewApplication(tt, proj, profile)
	return Orderer{App: app, Profile: profile, Operator: newOperator(tt, proj, app, profile), wait: opts}
}

// Settled polls a certificate request as the operator until it is issued, failed or
// rejected, or reaches one of the statuses in also.
func (o Orderer) Settled(tt *testing.T, requestID string, also ...api.GetCertificateRequest200JSONResponseBodyStatus) *api.GetCertificateRequestResponse {
	tt.Helper()
	return WaitRequest(tt, o.Operator, requestID, append(slices.Clone(finalRequestStatuses), also...), o.wait...)
}
