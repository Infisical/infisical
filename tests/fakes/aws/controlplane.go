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
}

// Open returns the account an access key id addresses, and starts collecting its
// events on every host but STS, whose events the App Connection fixture already
// tracks. Call it once per credential, before Infisical is handed anything that
// writes to AWS.
func Open(tt *testing.T, adminURL, accessKeyID string) *ControlPlane {
	tt.Helper()
	for _, svc := range []service{SSM, SecretsManager, IAM, CloudFormation} {
		fakenet.Track(tt, adminURL, svc.Host(), accessKeyID)
	}
	return &ControlPlane{
		STS:            fakenet.Open[STSAccount](tt, adminURL, STS.Host(), accessKeyID),
		SSM:            fakenet.Open[ParameterStore](tt, adminURL, SSM.Host(), accessKeyID),
		SecretsManager: fakenet.Open[SecretsStore](tt, adminURL, SecretsManager.Host(), accessKeyID),
		IAM:            fakenet.Open[IAMAccount](tt, adminURL, IAM.Host(), accessKeyID),
		CloudFormation: fakenet.Open[CloudFormationAccount](tt, adminURL, CloudFormation.Host(), accessKeyID),
	}
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
		cp.seeder(f.svc).Seed(tt, f.body)
	}
}

func (cp *ControlPlane) seeder(svc service) interface{ Seed(*testing.T, ...any) } {
	switch svc.name {
	case SSM.name:
		return cp.SSM
	case SecretsManager.name:
		return cp.SecretsManager
	case IAM.name:
		return cp.IAM
	case CloudFormation.name:
		return cp.CloudFormation
	}
	return cp.STS
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

// Deny makes the account's policy refuse one action, such as Deny(SSM, "PutParameter").
func Deny(svc service, action string) Fragment {
	return Fragment{svc, Policy{Denied: []string{svc.name + ":" + action}}}
}
