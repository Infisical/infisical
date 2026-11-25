package venaficloud_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/fakes/venaficloud"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func newTenant(t *testing.T, key string) (*httptest.Server, *venaficloud.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, venaficloud.Service)
	fakenet.Track(t, adminURL, venaficloud.Service.Host(), key)
	return fakes, venaficloud.Open(t, adminURL, key)
}

func call(t *testing.T, fakes *httptest.Server, key, method, path, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = venaficloud.Service.Host()
	req.Header.Set("tppl-api-key", key)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(raw)
}

func submit(t *testing.T, fakes *httptest.Server, key, app, tmpl, csr string) (int, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(map[string]any{"certificateSigningRequest": csr, "applicationId": app, "certificateIssuingTemplateId": tmpl})
	status, body := call(t, fakes, key, "POST", "/outagedetection/v1/certificaterequests", string(raw))
	var out map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &out), body)
	return status, out
}

func TestVenafiCloudFake_Requests(t *testing.T) {
	t.Run("should sign an intermediate under a CA template and serve it end entity first", func(t *testing.T) {
		// Setup
		fakes, vc := newTenant(t, "key-a")
		app, tmpl := uuid.NewString(), uuid.NewString()
		vc.Seed(t, venaficloud.WithApplication(app, tmpl))
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		require.NoError(t, err)
		subject := pkix.Name{CommonName: "Harness Intermediate", Organization: []string{"Harness"}}
		der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: subject}, key)
		require.NoError(t, err)

		// Action
		status, out := submit(t, fakes, "key-a", app, tmpl, string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})))

		// Assert
		require.Equal(t, http.StatusCreated, status, out)
		reqID := out["certificateRequests"].([]any)[0].(map[string]any)["id"].(string)
		_, polled := call(t, fakes, "key-a", "GET", "/outagedetection/v1/certificaterequests/"+reqID, "")
		var got struct{ CertificateIDs []string }
		require.NoError(t, json.Unmarshal([]byte(polled), &got))
		require.Len(t, got.CertificateIDs, 1)
		_, bundle := call(t, fakes, "key-a", "GET", "/outagedetection/v1/certificates/"+got.CertificateIDs[0]+"/contents?format=PEM&chainOrder=EE_FIRST", "")
		block, rest := pem.Decode([]byte(bundle))
		cert, err := x509.ParseCertificate(block.Bytes)
		require.NoError(t, err)
		rootBlock, _ := pem.Decode(rest)
		root, err := x509.ParseCertificate(rootBlock.Bytes)
		require.NoError(t, err)
		require.True(t, cert.IsCA)
		require.Equal(t, subject.String(), cert.Subject.String())
		require.NoError(t, cert.CheckSignatureFrom(root))
		vc.ExpectEvent[venaficloud.CertificateIssued](t, func(e venaficloud.CertificateIssued) bool { return e.RequestID == reqID })
	})

	t.Run("should refuse a template the application may not use", func(t *testing.T) {
		// Setup
		fakes, vc := newTenant(t, "key-b")
		app := uuid.NewString()
		vc.Seed(t, venaficloud.WithApplication(app, uuid.NewString()))

		// Action
		status, out := submit(t, fakes, "key-b", app, uuid.NewString(), issuer.TestCSR(t, "a.test", "a.test"))

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, out["errors"].([]any)[0].(map[string]any)["message"], "is not allowed to use issuing template")
		require.Empty(t, vc.State(t).Requests)
	})
}
