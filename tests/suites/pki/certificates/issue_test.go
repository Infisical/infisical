package certificates_test

import (
	"crypto/x509"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificate_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a certificate for the requested name that chains to the intermediate and the root", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".issue.test"

		// Action
		got := g.Issue(t, pki.ServerCertificate(name))

		// Assert
		leaf := pki.ParseLeaf(t, got.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.Equal(t, []string{name}, leaf.DNSNames)
		require.Equal(t, []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, leaf.ExtKeyUsage)
		require.WithinDuration(t, time.Now().Add(30*24*time.Hour), leaf.NotAfter, time.Hour)
		verifyChain(t, leaf, got.Chain)
		require.True(t, publicKeyOf(t, got.PrivateKey).Equal(leaf.PublicKey), "the returned key is not the leaf's")
	})

	t.Run("should issue on the CSR's key and return no private key when a CSR is sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".csr.test"
		csr, pub := newCSR(t, name, name)

		// Action
		got := g.Issue(t, csrRequest(csr))

		// Assert
		require.Empty(t, got.PrivateKey)
		leaf := pki.ParseLeaf(t, got.Certificate)
		require.True(t, pub.Equal(leaf.PublicKey))
		require.Equal(t, []string{name}, leaf.DNSNames)
	})

	t.Run("should issue to a machine identity the application has as an operator", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		identity := tn.NewMachineIdentity(t)
		g.Project.Grant(t, identity)
		pki.AddMember(t, g.App, identity, "operator")
		name := id.Short() + ".identity.test"

		// Action
		got := g.Issue(t, pki.ServerCertificate(name), pki.As(identity))

		// Assert
		require.Equal(t, []string{name}, pki.ParseLeaf(t, got.Certificate).DNSNames)
		read := pki.ReadCertificate(t, identity, got.ID)
		require.Equal(t, &g.App.ID, read.JSON200.Certificate.ApplicationId)
	})

	t.Run("should issue at the policy's limits", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		body := pki.AllowAll(t)
		body.Validity.Max = new("30d")
		(*body.Sans)[0].Allowed = &[]string{"*.allowed.test"}
		g := pki.NewGraph(t, tn, pki.WithPolicy(body))
		name := id.Short() + ".allowed.test"

		// Action
		got := g.Issue(t, pki.ServerCertificate(name))

		// Assert
		require.Equal(t, []string{name}, pki.ParseLeaf(t, got.Certificate).DNSNames)
		require.Equal(t, 1, pki.Requests(t, g.Project, g.Profile))
	})

	t.Run("should refuse an application whose profile has no API enrollment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		root := pki.NewInternalCA(t, p)
		profile := pki.NewProfile(t, p, root, pki.NewPolicy(t, p, pki.AllowAll(t)))
		app := pki.NewApplication(t, p, profile)
		operator := tn.NewUser(t)
		p.Grant(t, operator)
		pki.AddMember(t, app, operator, "operator")

		// Action
		res := pki.Request(t, operator, app, profile, pki.ServerCertificate(id.Short()+".noapi.test"))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "API enrollment is not configured for this profile on the Application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p, profile))
	})

	t.Run("should refuse another organization issuing through the profile", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, crossOrgWhy)

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		g := pki.NewGraph(t, owner)

		// Action
		res := pki.Request(t, other.Admin, g.App, g.Profile, pki.ServerCertificate(id.Short()+".cross.test"))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})
}
