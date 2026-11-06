package acmeca_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/acmeca"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/acme"
)

// newCA serves fakenet in-process over TLS and returns an ACME client whose every
// dial reaches it, so the client uses the real acme.ca.test URLs the CA hands out.
func newCA(t *testing.T, scope string) (*acme.Client, *acmeca.ControlPlane) {
	t.Helper()
	srv := fakenet.New(acmeca.Service)
	fakes := httptest.NewTLSServer(srv)
	t.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	t.Cleanup(admin.Close)
	require.NoError(t, fakenet.Listen(t.Context(), admin.URL, ""))
	fakenet.Track(t, admin.URL, acmeca.Service.Host(), scope)
	cp := acmeca.Open(t, admin.URL, scope)

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // the in-process server's certificate
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, fakes.Listener.Addr().String())
		},
	}
	return &acme.Client{Key: key, DirectoryURL: cp.DirectoryURL(), HTTPClient: &http.Client{Transport: transport}}, cp
}

func csrFor(t *testing.T, names ...string) []byte {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkix.Name{}, DNSNames: names}, key)
	require.NoError(t, err)
	return der
}

func TestAcmeCAFake_Issue(t *testing.T) {
	t.Run("should issue a certificate naming the order's identifiers after its challenge is answered", func(t *testing.T) {
		// Setup
		client, ca := newCA(t, "issue")
		ctx := t.Context()
		_, err := client.Register(ctx, &acme.Account{}, acme.AcceptTOS)
		require.NoError(t, err)
		order, err := client.AuthorizeOrder(ctx, acme.DomainIDs("a.example.test"))
		require.NoError(t, err)
		authz, err := client.GetAuthorization(ctx, order.AuthzURLs[0])
		require.NoError(t, err)
		_, err = client.Accept(ctx, authz.Challenges[0])
		require.NoError(t, err)
		order, err = client.WaitOrder(ctx, order.URI)
		require.NoError(t, err)

		// Action
		chain, _, err := client.CreateOrderCert(ctx, order.FinalizeURL, csrFor(t, "a.example.test"), true)

		// Assert
		require.NoError(t, err)
		leaf, err := x509.ParseCertificate(chain[0])
		require.NoError(t, err)
		require.Equal(t, []string{"a.example.test"}, leaf.DNSNames)
		require.Len(t, ca.State(t).Issued, 1)
	})

	t.Run("should refuse to finalize when the challenge was never answered", func(t *testing.T) {
		// Setup
		client, ca := newCA(t, "unready")
		ctx := t.Context()
		_, err := client.Register(ctx, &acme.Account{}, acme.AcceptTOS)
		require.NoError(t, err)
		order, err := client.AuthorizeOrder(ctx, acme.DomainIDs("b.example.test"))
		require.NoError(t, err)

		// Action
		_, _, err = client.CreateOrderCert(ctx, order.FinalizeURL, csrFor(t, "b.example.test"), true)

		// Assert
		var acmeErr *acme.Error
		require.ErrorAs(t, err, &acmeErr)
		require.Equal(t, "urn:ietf:params:acme:error:orderNotReady", acmeErr.ProblemType)
		require.Empty(t, ca.State(t).Issued)
	})

	t.Run("should refuse a CSR naming more than the order", func(t *testing.T) {
		// Setup
		client, ca := newCA(t, "mismatch")
		ctx := t.Context()
		_, err := client.Register(ctx, &acme.Account{}, acme.AcceptTOS)
		require.NoError(t, err)
		order, err := client.AuthorizeOrder(ctx, acme.DomainIDs("c.example.test"))
		require.NoError(t, err)
		authz, err := client.GetAuthorization(ctx, order.AuthzURLs[0])
		require.NoError(t, err)
		_, err = client.Accept(ctx, authz.Challenges[0])
		require.NoError(t, err)

		// Action
		_, _, err = client.CreateOrderCert(ctx, order.FinalizeURL, csrFor(t, "c.example.test", "d.example.test"), true)

		// Assert
		var acmeErr *acme.Error
		require.ErrorAs(t, err, &acmeErr)
		require.Equal(t, "urn:ietf:params:acme:error:badCSR", acmeErr.ProblemType)
		require.Empty(t, ca.State(t).Issued)
	})
}
