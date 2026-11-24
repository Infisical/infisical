package gcp

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one workload identity pool inside fakenet, one
// scope per host: STS holds the pool's providers and the exchanges it accepted, IAM
// Credentials the service accounts the pool's identities may be granted.
type ControlPlane struct {
	STS            *fakenet.Scope[Pool]
	IAMCredentials *fakenet.Scope[ServiceAccounts]

	PoolID        string
	ProjectNumber string
}

// Open returns the pool a test invented, and starts collecting its events on both
// hosts. The pool id is the credential: it must start with the binary's nonce prefix,
// and fit GCP's 4 to 32 lowercase letters, digits and hyphens. Call it before the
// pool reaches Infisical.
func Open(tt *testing.T, adminURL, poolID string) *ControlPlane {
	tt.Helper()
	for _, svc := range Services {
		fakenet.Track(tt, adminURL, svc.Host(), poolID)
	}
	return &ControlPlane{
		STS:            fakenet.Open[Pool](tt, adminURL, STS.Host(), poolID),
		IAMCredentials: fakenet.Open[ServiceAccounts](tt, adminURL, IAMCredentials.Host(), poolID),
		PoolID:         poolID,
		ProjectNumber:  ProjectNumber(poolID),
	}
}

// Provider is the full resource name of one of the pool's providers, the value a
// customer gives Infisical.
func (cp *ControlPlane) Provider(providerID string) string {
	return ProviderName{ProjectNumber: cp.ProjectNumber, Pool: cp.PoolID, Provider: providerID}.String()
}

// Principal is the IAM member for one subject of the pool.
func (cp *ControlPlane) Principal(subject string) string {
	return "principal://" + cp.poolPrefix() + "/subject/" + subject
}

// PrincipalSet is the IAM member for every identity of the pool whose mapped
// attribute has this value.
func (cp *ControlPlane) PrincipalSet(attribute, value string) string {
	return "principalSet://" + cp.poolPrefix() + "/attribute." + attribute + "/" + value
}

func (cp *ControlPlane) poolPrefix() string {
	return identity{ProjectNumber: cp.ProjectNumber, Pool: cp.PoolID}.poolPrefix()
}

// TrustIssuer adds an OIDC provider that trusts an issuer, mapping google.subject from
// sub and attribute.project_id from project_id, the mapping Infisical documents.
// dialOrigin is where the fake reaches the issuer; see Provider.DialOrigin.
func (cp *ControlPlane) TrustIssuer(tt *testing.T, providerID, issuerURI, dialOrigin string) {
	tt.Helper()
	cp.STS.Seed(tt, map[string]any{"providers": map[string]Provider{providerID: {
		IssuerURI: issuerURI,
		AttributeMapping: map[string]string{
			"google.subject":       "assertion.sub",
			"attribute.project_id": "assertion.project_id",
		},
		DialOrigin: dialOrigin,
	}}})
}

// GrantWorkloadIdentityUser grants roles/iam.workloadIdentityUser on a service
// account, creating the account if needed.
func (cp *ControlPlane) GrantWorkloadIdentityUser(tt *testing.T, serviceAccount string, members ...string) {
	tt.Helper()
	cp.IAMCredentials.Seed(tt, map[string]any{"accounts": map[string]ServiceAccount{
		serviceAccount: {WorkloadIdentityUsers: members},
	}})
}
