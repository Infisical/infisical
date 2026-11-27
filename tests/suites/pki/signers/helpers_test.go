package signers_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
)

// newSigner creates an active signer issued by a new internal CA, with a new Product
// Member holding role on it.
func newSigner(t *testing.T, tn *harness.Tenant, role string, opts ...pki.SignerOption) (pki.Signer, *harness.Principal) {
	t.Helper()
	proj := pki.CertManager(t, tn)
	member := tn.NewUser(t, harness.WithName(role))
	proj.Grant(t, member)
	return pki.NewSigner(t, proj, append(opts, pki.SignerMember(member, role))...), member
}
