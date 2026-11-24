package aws

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one AWS account inside fakenet, one scope per
// service host. Events, failures and the call log are per service, so a test waits on
// cp.SSM.ExpectEvent and fails cp.IAM.Fail.
//
// Every AWS JSON and Query call is a POST to "/", so a fakenet.Fail rule cannot pick
// one action. To refuse a single action, seed Deny, which answers the way AWS answers
// a policy that does not allow it.
type ControlPlane struct {
	STS            *fakenet.Scope[STSAccount]
	SSM            *fakenet.Scope[ParameterStore]
	SecretsManager *fakenet.Scope[SecretsStore]
	IAM            *fakenet.Scope[IAMAccount]
	CloudFormation *fakenet.Scope[CloudFormationAccount]
	KMS            *fakenet.Scope[KMSAccount]
	ACM            *fakenet.Scope[CertificateManager]
	ACMPCA         *fakenet.Scope[PrivateCAs]
	ELB            *fakenet.Scope[LoadBalancing]
	Route53        *fakenet.Scope[HostedZones]
}

// Open returns the account an access key id addresses, and starts collecting its
// events on every host but STS, whose events the App Connection fixture already
// tracks. Call it once per credential, before Infisical is handed anything that
// writes to AWS.
func Open(tt *testing.T, adminURL, accessKeyID string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{
		STS:            fakenet.Open[STSAccount](tt, adminURL, STS.Host(), accessKeyID),
		SSM:            tracked[ParameterStore](tt, adminURL, SSM, accessKeyID),
		SecretsManager: tracked[SecretsStore](tt, adminURL, SecretsManager, accessKeyID),
		IAM:            tracked[IAMAccount](tt, adminURL, IAM, accessKeyID),
		CloudFormation: tracked[CloudFormationAccount](tt, adminURL, CloudFormation, accessKeyID),
		KMS:            tracked[KMSAccount](tt, adminURL, KMS, accessKeyID),
		ACM:            tracked[CertificateManager](tt, adminURL, ACM, accessKeyID),
		ACMPCA:         tracked[PrivateCAs](tt, adminURL, ACMPCA, accessKeyID),
		ELB:            tracked[LoadBalancing](tt, adminURL, ELB, accessKeyID),
		Route53:        tracked[HostedZones](tt, adminURL, Route53, accessKeyID),
	}
}

func tracked[S any](tt *testing.T, adminURL string, svc service, accessKeyID string) *fakenet.Scope[S] {
	tt.Helper()
	fakenet.Track(tt, adminURL, svc.Host(), accessKeyID)
	return fakenet.Open[S](tt, adminURL, svc.Host(), accessKeyID)
}

// Fragment is a piece of state that belongs to one service.
type Fragment struct {
	svc  service
	body any
}

// Seed merges fragments into the services they belong to.
func (cp *ControlPlane) Seed(tt *testing.T, fragments ...Fragment) {
	tt.Helper()
	for _, f := range fragments {
		cp.seeder(tt, f.svc).Seed(tt, f.body)
	}
}

func (cp *ControlPlane) seeder(tt *testing.T, svc service) interface{ Seed(*testing.T, ...any) } {
	tt.Helper()
	switch svc.name {
	case STS.name:
		return cp.STS
	case SSM.name:
		return cp.SSM
	case SecretsManager.name:
		return cp.SecretsManager
	case IAM.name:
		return cp.IAM
	case CloudFormation.name:
		return cp.CloudFormation
	case KMS.name:
		return cp.KMS
	case ACM.name:
		return cp.ACM
	case ACMPCA.name:
		return cp.ACMPCA
	case ELB.name:
		return cp.ELB
	case Route53.name:
		return cp.Route53
	}
	tt.Fatalf("aws: no scope for service %q", svc.name)
	return nil
}

// Parameters is every parameter the account holds, by stored name.
func (cp *ControlPlane) Parameters(tt *testing.T) map[string]*Parameter {
	tt.Helper()
	return cp.SSM.State(tt).Parameters
}

// Secrets is every Secrets Manager secret the account holds, by name.
func (cp *ControlPlane) Secrets(tt *testing.T) map[string]*Secret {
	tt.Helper()
	return cp.SecretsManager.State(tt).Secrets
}

// User is an IAM user, nil when it does not exist.
func (cp *ControlPlane) User(tt *testing.T, name string) *User {
	tt.Helper()
	return cp.IAM.State(tt).Users[name]
}

// SeedParameter seeds a SecureString parameter under its full name, such as /app/DB_URL.
func SeedParameter(name, value string) Fragment {
	return Fragment{SSM, map[string]any{"parameters": map[string]any{name: map[string]any{"value": value}}}}
}

// SeedSecret seeds a Secrets Manager secret holding a string.
func SeedSecret(name, value string) Fragment {
	return Fragment{SecretsManager, map[string]any{"secrets": map[string]any{name: map[string]any{"secretString": value}}}}
}

// SeedUser seeds a user, holding the given access keys if any.
func SeedUser(name string, accessKeyIDs ...string) Fragment {
	keys := make([]map[string]any, 0, len(accessKeyIDs))
	for _, id := range accessKeyIDs {
		keys = append(keys, map[string]any{"accessKeyId": id})
	}
	return Fragment{IAM, map[string]any{"users": map[string]any{name: map[string]any{"accessKeys": keys}}}}
}

// RemoveAccessKey deletes a key behind Infisical's back, as an operator would in the
// console.
func RemoveAccessKey(accessKeyID string) Fragment {
	return Fragment{IAM, map[string]any{"removedAccessKeys": []string{accessKeyID}}}
}

// SeedStack seeds a stack in a status such as CREATE_COMPLETE.
func SeedStack(name, status string) Fragment {
	return Fragment{CloudFormation, map[string]any{"stacks": map[string]any{name: map[string]any{"stackStatus": status}}}}
}

// SeedRole seeds a role in the account accountKey addresses, assumable as its trust
// policy allows (see TrustPolicy). Seed it on that same account's control plane.
func SeedRole(accountKey, name, trustPolicy string) Fragment {
	return Fragment{IAM, map[string]any{"roles": map[string]any{name: map[string]any{"owner": accountKey, "assumeRolePolicyDocument": trustPolicy}}}}
}

// SeedKey seeds a symmetric KMS key under a UUID key id.
func SeedKey(keyID string) Fragment {
	return Fragment{KMS, map[string]any{"keys": map[string]any{keyID: map[string]any{}}}}
}

// Deny makes the account's policy refuse one action, such as Deny(SSM, "PutParameter").
func Deny(svc service, action string) Fragment {
	return Fragment{svc, Policy{Denied: []string{svc.name + ":" + action}}}
}

// Certificates is every ACM certificate the account holds, by ARN.
func (cp *ControlPlane) Certificates(tt *testing.T) map[string]*ACMCertificate {
	tt.Helper()
	return cp.ACM.State(tt).Certificates
}

// SeedACMCertificate seeds a certificate someone else imported into ACM, self-signed
// for domain.
func SeedACMCertificate(domain string) Fragment {
	return Fragment{ACM, map[string]any{"certificates": map[string]any{domain: map[string]any{"domainName": domain}}}}
}

// RemoveACMCertificate deletes a certificate behind Infisical's back.
func RemoveACMCertificate(arn string) Fragment {
	return Fragment{ACM, map[string]any{"removedCertificates": []string{arn}}}
}

// SeedPrivateCA seeds an AWS Private CA in a status such as ACTIVE or DISABLED, on an
// RSA-2048 key.
func SeedPrivateCA(arn, status string) Fragment {
	return Fragment{ACMPCA, map[string]any{"authorities": map[string]any{arn: map[string]any{"status": status}}}}
}

// PrivateCAARN is an ARN for a Private CA in the account an access key id belongs to.
func PrivateCAARN(accessKeyID string) string {
	return "arn:aws:acm-pca:" + Region + ":" + AccountID(accessKeyID) + ":certificate-authority/" + requestID()
}

// SeedListener seeds an HTTPS listener on a load balancer, serving defaultCertificate.
func SeedListener(arn, loadBalancerArn string, port int, defaultCertificate string) Fragment {
	return Fragment{ELB, map[string]any{"listeners": map[string]any{arn: map[string]any{
		"loadBalancerArn": loadBalancerArn, "port": port, "defaultCertificate": defaultCertificate,
	}}}}
}

// SeedHostedZone seeds a public hosted zone for a domain name.
func SeedHostedZone(id, name string) Fragment {
	return Fragment{Route53, map[string]any{"zones": map[string]any{id: map[string]any{"name": name}}}}
}
