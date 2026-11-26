package azureadcs_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/stretchr/testify/require"
)

func TestAzureADCSFake_CATemplates(t *testing.T) {
	t.Run("should issue a CA certificate under the request's subject for a CA template, chaining to CACert", func(t *testing.T) {
		// Setup
		fakes, ca := newServer(t, "s2")
		ca.Seed(t, azureadcs.WithCATemplates("SubCA"))
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		require.NoError(t, err)
		subject := pkix.Name{CommonName: "Harness Intermediate", Organization: []string{"Harness"}}
		der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: subject}, key)
		require.NoError(t, err)
		form := url.Values{"Mode": {"newreq"}, "CertRequest": {base64.StdEncoding.EncodeToString(der)},
			"CertAttrib": {"CertificateTemplate:SubCA\r\n"}}.Encode()

		// Action
		status, _ := call(t, fakes, "bob", azureadcs.Password("bob"), "POST", "/s2/certsrv/certfnsh.asp", form)

		// Assert
		require.Equal(t, http.StatusOK, status)
		_, certPEM := call(t, fakes, "bob", azureadcs.Password("bob"), "GET", "/s2/certsrv/certnew.cer?ReqID=1&Enc=b64", "")
		_, rootPEM := call(t, fakes, "bob", azureadcs.Password("bob"), "GET", "/s2/certsrv/certnew.cer?ReqID=CACert&Renewal=0&Enc=b64", "")
		cert, root := parsePEM(t, certPEM), parsePEM(t, rootPEM)
		require.True(t, cert.IsCA)
		require.Equal(t, subject.String(), cert.Subject.String())
		require.NoError(t, cert.CheckSignatureFrom(root))
	})

	t.Run("should list every published template on certrqxt.asp", func(t *testing.T) {
		// Setup
		fakes, ca := newServer(t, "s3")
		ca.Seed(t, azureadcs.WithTemplates("WebServer"), azureadcs.WithCATemplates("SubCA"))

		// Action
		status, page := call(t, fakes, "bob", azureadcs.Password("bob"), "GET", "/s3/certsrv/certrqxt.asp", "")

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Contains(t, page, `<option value="E;WebServer;1;1;41;16;-1509949440;0;">WebServer</option>`)
		require.Contains(t, page, `<option value="E;SubCA;1;1;41;16;-1509949440;0;">SubCA</option>`)
	})
}

func parsePEM(t *testing.T, p string) *x509.Certificate {
	t.Helper()
	block, _ := pem.Decode([]byte(p))
	require.NotNil(t, block, p)
	c, err := x509.ParseCertificate(block.Bytes)
	require.NoError(t, err)
	return c
}
