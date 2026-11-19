package panos_test

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/panos"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newFirewall(t *testing.T, user string) (*httptest.Server, *panos.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, panos.Service)
	fakenet.Track(t, adminURL, panos.Service.Host(), user)
	return fakes, panos.Open(t, adminURL, user)
}

func post(t *testing.T, fakes *httptest.Server, key, query, contentType string, body io.Reader) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), "POST", fakes.URL+"/api/"+query, body)
	require.NoError(t, err)
	req.Host = panos.Service.Host()
	req.Header.Set("Content-Type", contentType)
	if key != "" {
		req.Header.Set("X-PAN-KEY", key)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(raw)
}

func form(t *testing.T, fakes *httptest.Server, key string, params url.Values) (int, string) {
	t.Helper()
	return post(t, fakes, key, "", "application/x-www-form-urlencoded", strings.NewReader(params.Encode()))
}

func keygen(t *testing.T, fakes *httptest.Server, user string) string {
	t.Helper()
	code, body := form(t, fakes, "", url.Values{"type": {"keygen"}, "user": {user}, "password": {panos.Password(user)}})
	require.Equal(t, http.StatusOK, code)
	key, _, _ := strings.Cut(strings.TrimPrefix(body, `<response status="success"><result><key>`), "</key>")
	return key
}

func importFile(t *testing.T, fakes *httptest.Server, key string, params url.Values, content string) (int, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "x.pem")
	require.NoError(t, err)
	_, _ = fw.Write([]byte(content))
	require.NoError(t, mw.Close())
	return post(t, fakes, key, "?"+params.Encode(), mw.FormDataContentType(), &buf)
}

const certPEM = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----"

func TestPanosFake_Certificates(t *testing.T) {
	t.Run("should import a key pair and make it running on commit", func(t *testing.T) {
		// Setup
		fakes, fw := newFirewall(t, "u-a")
		key := keygen(t, fakes, "u-a")
		code, _ := importFile(t, fakes, key, url.Values{"type": {"import"}, "category": {"keypair"}, "certificate-name": {"web"}, "format": {"pem"}, "passphrase": {"p"}},
			certPEM+"\n-----BEGIN ENCRYPTED PRIVATE KEY-----\ny\n-----END ENCRYPTED PRIVATE KEY-----")
		require.Equal(t, http.StatusOK, code)

		// Action
		code, body := form(t, fakes, key, url.Values{"type": {"commit"}, "action": {"partial"}, "cmd": {"<commit><partial></partial></commit>"}})

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Contains(t, body, "<job>1</job>")
		state := fw.State(t)
		require.Equal(t, certPEM, state.Certificates["web"].PublicKey)
		require.Equal(t, []string{"web"}, state.Committed.Certificates)
	})

	t.Run("should refuse pointing a profile at a certificate that does not exist", func(t *testing.T) {
		// Setup
		fakes, fw := newFirewall(t, "u-b")
		fw.Seed(t, panos.WithProfile("mgmt"))
		key := keygen(t, fakes, "u-b")

		// Action
		code, body := form(t, fakes, key, url.Values{"type": {"config"}, "action": {"edit"},
			"xpath": {"/config/shared/ssl-tls-service-profile/entry[@name='mgmt']/certificate"}, "element": {"<certificate>nope</certificate>"}})

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Contains(t, body, `status="error"`)
		require.Empty(t, fw.State(t).Profiles["mgmt"])
	})

	t.Run("should refuse an API key it did not issue", func(t *testing.T) {
		// Setup
		fakes, _ := newFirewall(t, "u-c")

		// Action
		code, _ := form(t, fakes, "u-c.forged", url.Values{"type": {"op"}, "cmd": {"<show><system><info></info></system></show>"}})

		// Assert
		require.Equal(t, http.StatusForbidden, code)
	})
}

func TestPanosFake_Removal(t *testing.T) {
	t.Run("should refuse deleting a certificate a profile presents until the profile is switched", func(t *testing.T) {
		// Setup
		fakes, fw := newFirewall(t, "u-d")
		fw.Seed(t, panos.WithCertificate("old", certPEM), panos.WithCertificate("fallback", certPEM),
			panos.Firewall{Profiles: map[string]string{"portal": "old"}})
		key := keygen(t, fakes, "u-d")
		del := url.Values{"type": {"config"}, "action": {"delete"}, "xpath": {"/config/shared/certificate/entry[@name='old']"}}
		code, body := form(t, fakes, key, del)
		require.Equal(t, http.StatusBadRequest, code)
		require.Contains(t, body, `code="10"><msg><line>old cannot be deleted because of references from: shared -&gt; ssl-tls-service-profile -&gt; portal -&gt; certificate`)
		code, _ = form(t, fakes, key, url.Values{"type": {"config"}, "action": {"edit"},
			"xpath": {"/config/shared/ssl-tls-service-profile/entry[@name='portal']/certificate"}, "element": {"<certificate>fallback</certificate>"}})
		require.Equal(t, http.StatusOK, code)

		// Action
		code, _ = form(t, fakes, key, del)

		// Assert
		require.Equal(t, http.StatusOK, code)
		state := fw.State(t)
		require.NotContains(t, state.Certificates, "old")
		require.Equal(t, "fallback", state.Profiles["portal"])
	})
}

func TestPanosFake_ImportRefusal(t *testing.T) {
	t.Run("should refuse every import with the seeded reason and store nothing", func(t *testing.T) {
		// Setup
		fakes, fw := newFirewall(t, "u-e")
		fw.Seed(t, panos.RefuseImports("Import of web failed. Certificate storage is full"))
		key := keygen(t, fakes, "u-e")

		// Action
		code, body := importFile(t, fakes, key, url.Values{"type": {"import"}, "category": {"certificate"}, "certificate-name": {"web"}, "format": {"pem"}}, certPEM)

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Equal(t, `<response status="error" code="13"><msg><line>Import of web failed. Certificate storage is full</line></msg></response>`, body)
		require.Empty(t, fw.State(t).Certificates)
	})
}

func TestPanosFake_ConfigGet(t *testing.T) {
	t.Run("should return a certificate's PEM with raw newlines", func(t *testing.T) {
		// Setup
		fakes, fw := newFirewall(t, "u-f")
		fw.Seed(t, panos.WithCertificate("web", certPEM))
		key := keygen(t, fakes, "u-f")

		// Action
		code, body := form(t, fakes, key, url.Values{"type": {"config"}, "action": {"get"}, "xpath": {"/config/shared/certificate/entry[@name='web']"}})

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Contains(t, body, "<public-key>"+certPEM+"</public-key>")
	})
}
