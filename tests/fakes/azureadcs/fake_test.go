package azureadcs_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Azure/go-ntlmssp"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newServer(t *testing.T, scope string) (*httptest.Server, *azureadcs.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, azureadcs.Service)
	fakenet.Track(t, adminURL, azureadcs.Service.Host(), scope)
	return fakes, azureadcs.Open(t, adminURL, scope)
}

// call does the three-leg NTLM handshake the way axios-ntlm does and returns the
// final answer.
func call(t *testing.T, fakes *httptest.Server, user, password, method, path, form string) (int, string) {
	t.Helper()
	send := func(auth string) *http.Response {
		req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(form))
		require.NoError(t, err)
		req.Host = azureadcs.Service.Host()
		if form != "" {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		res, err := fakes.Client().Do(req)
		require.NoError(t, err)
		return res
	}
	first := send("")
	_ = first.Body.Close()
	require.Equal(t, http.StatusUnauthorized, first.StatusCode)
	require.Equal(t, "NTLM", first.Header.Get("WWW-Authenticate"))

	negotiate, err := ntlmssp.NewNegotiateMessage("", "")
	require.NoError(t, err)
	second := send("NTLM " + base64.StdEncoding.EncodeToString(negotiate))
	_ = second.Body.Close()
	require.Equal(t, http.StatusUnauthorized, second.StatusCode)
	type2, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(second.Header.Get("WWW-Authenticate"), "NTLM "))
	require.NoError(t, err)

	authenticate, err := ntlmssp.ProcessChallenge(type2, user, password, false)
	require.NoError(t, err)
	final := send("NTLM " + base64.StdEncoding.EncodeToString(authenticate))
	defer func() { _ = final.Body.Close() }()
	raw, err := io.ReadAll(final.Body)
	require.NoError(t, err)
	return final.StatusCode, string(raw)
}

func csrForm(t *testing.T, name, template string) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkix.Name{CommonName: name}, DNSNames: []string{name}}, key)
	require.NoError(t, err)
	return url.Values{
		"Mode":        {"newreq"},
		"CertRequest": {base64.StdEncoding.EncodeToString(der)},
		"CertAttrib":  {"CertificateTemplate:" + template + "\r\n"},
	}.Encode()
}

func TestAzureADCSFake_Enrollment(t *testing.T) {
	t.Run("should issue under a published template and serve the certificate from certnew.cer", func(t *testing.T) {
		// Setup
		fakes, ca := newServer(t, "s1")
		ca.Seed(t, azureadcs.WithTemplates("HarnessWeb"))

		// Action
		status, page := call(t, fakes, "bob", azureadcs.Password("bob"), "POST", "/s1/certsrv/certfnsh.asp", csrForm(t, "a.test", "HarnessWeb"))

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Contains(t, page, "certnew.cer?ReqID=1&amp;Enc=b64")
		got, cert := call(t, fakes, "bob", azureadcs.Password("bob"), "GET", "/s1/certsrv/certnew.cer?ReqID=1&Enc=b64", "")
		require.Equal(t, http.StatusOK, got)
		require.Contains(t, cert, "-----BEGIN CERTIFICATE-----")
		ca.ExpectEvent[azureadcs.CertificateIssued](t, func(e azureadcs.CertificateIssued) bool { return e.Template == "HarnessWeb" && e.Username == "bob" })
	})

	t.Run("should deny a request for a template the CA does not publish", func(t *testing.T) {
		// Setup
		fakes, ca := newServer(t, "s1")

		// Action
		status, page := call(t, fakes, "bob", azureadcs.Password("bob"), "POST", "/s1/certsrv/certfnsh.asp", csrForm(t, "a.test", "Missing"))

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Contains(t, page, "denied")
		ca.ExpectEvent[azureadcs.RequestDenied](t, func(e azureadcs.RequestDenied) bool { return e.Template == "Missing" })
	})

	t.Run("should refuse a wrong password at the last leg of the handshake", func(t *testing.T) {
		// Setup
		fakes, _ := newServer(t, "s1")

		// Action
		status, _ := call(t, fakes, "bob", "nope", "GET", "/s1/certsrv/certrqus.asp", "")

		// Assert
		require.Equal(t, http.StatusUnauthorized, status)
	})
}
