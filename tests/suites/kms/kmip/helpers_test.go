package kmip_test

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Every KMIP operation a client can be granted.
var allOperations = []string{"create", "locate", "get", "get-attributes", "activate", "revoke", "destroy", "register"}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "body: %s", apierr.Body(body))
}

func newProject(t *testing.T, tn *harness.Tenant) *fixture.Project {
	t.Helper()
	return fixture.NewProject(t, tn, fixture.WithProjectType("kms"))
}

type kmipClient struct {
	ID          string
	Name        string
	Description *string
	Permissions []string
	ProjectID   string `json:"projectId"`
}

func createClientBody(p *fixture.Project, permissions ...string) map[string]any {
	if permissions == nil {
		permissions = []string{}
	}
	return map[string]any{"projectId": p.ID, "name": "c-" + id.Short(), "permissions": permissions}
}

func newClient(t *testing.T, p *fixture.Project, permissions ...string) kmipClient {
	t.Helper()
	res, err := p.Tenant().Admin.API.CreateKmipClientWithBodyWithResponse(t.Context(), "application/json",
		kms.JSON(t, createClientBody(p, permissions...)))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[kmipClient](t, res.Body)
}

func getClient(t *testing.T, p *fixture.Project, clientID string) kmipClient {
	t.Helper()
	res, err := p.Tenant().Admin.API.GetKmipClientWithResponse(t.Context(), clientID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[kmipClient](t, res.Body)
}

type issuedCertificate struct {
	SerialNumber     string `json:"serialNumber"`
	Certificate      string
	CertificateChain string `json:"certificateChain"`
	PrivateKey       string `json:"privateKey"`
}

func issueCertificate(t *testing.T, p *fixture.Project, clientID string, body map[string]any) (*api.CreateKmipClientCertificateResponse, issuedCertificate) {
	t.Helper()
	res, err := p.Tenant().Admin.API.CreateKmipClientCertificateWithBodyWithResponse(t.Context(), clientID, "application/json",
		kms.JSON(t, body))
	require.NoError(t, err)
	var out issuedCertificate
	if res.StatusCode() == http.StatusOK {
		out = kms.Decode[issuedCertificate](t, res.Body)
	}
	return res, out
}

type kmipServer struct {
	ID             uuid.UUID
	Name           string
	HostnamesOrIps string `json:"hostnamesOrIps"`
}

func createServer(t *testing.T, tn *harness.Tenant, hostnamesOrIPs string) kmipServer {
	t.Helper()
	res, err := tn.Admin.API.CreateKmipServerWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, map[string]any{
		"name": "s-" + id.Short(), "hostnamesOrIps": hostnamesOrIPs, "authMethod": map[string]any{"method": "token"},
	}))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[kmipServer](t, res.Body)
}

func mintEnrollmentToken(t *testing.T, tn *harness.Tenant, serverID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.GenerateKmipServerEnrollmentTokenWithResponse(t.Context(), serverID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[struct{ Token string }](t, res.Body).Token
}

func loginServer(t *testing.T, tn *harness.Tenant, token string) (*api.LoginKmipServerResponse, string) {
	t.Helper()
	res, err := tn.Anonymous(t).LoginKmipServerWithBodyWithResponse(t.Context(), "application/json",
		kms.JSON(t, map[string]any{"method": "token", "token": token}))
	require.NoError(t, err)
	if res.StatusCode() != http.StatusOK {
		return res, ""
	}
	return res, kms.Decode[struct{ AccessToken string }](t, res.Body).AccessToken
}

type serverCertificate struct {
	Certificate            string
	CertificateChain       string `json:"certificateChain"`
	ClientCertificateChain string `json:"clientCertificateChain"`
	PrivateKey             string `json:"privateKey"`
}

// enrolledServer is a KMIP server that has logged in and connected, as the KMIP daemon does on start.
type enrolledServer struct {
	kmipServer
	token       string
	certificate serverCertificate
	serial      string
}

func enrollServer(t *testing.T, tn *harness.Tenant) enrolledServer {
	t.Helper()
	server := createServer(t, tn, "kmip.example.com")
	_, token := loginServer(t, tn, mintEnrollmentToken(t, tn, server.ID))
	require.NotEmpty(t, token)

	res, err := tn.Client(t, token).ConnectKmipServerWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	cert := kms.Decode[serverCertificate](t, res.Body)
	return enrolledServer{kmipServer: server, token: token, certificate: cert, serial: serialOf(t, cert.Certificate)}
}

func parseCertificate(t *testing.T, certPEM string) *x509.Certificate {
	t.Helper()
	block, _ := pem.Decode([]byte(certPEM))
	require.NotNil(t, block, "certificate is not a PEM")
	cert, err := x509.ParseCertificate(block.Bytes)
	require.NoError(t, err)
	return cert
}

func serialOf(t *testing.T, certPEM string) string {
	t.Helper()
	return fmt.Sprintf("%040x", parseCertificate(t, certPEM).SerialNumber)
}

func parseChain(t *testing.T, chainPEM string) []*x509.Certificate {
	t.Helper()
	var certs []*x509.Certificate
	rest := []byte(chainPEM)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		require.NoError(t, err)
		certs = append(certs, cert)
	}
	require.NotEmpty(t, certs, "the chain holds no certificate")
	return certs
}

// requireVerifies runs the standard library's full X.509 verification of the leaf, trusting only the chain's
// root, the way an admin loads a CA into a trust store.
func requireVerifies(t *testing.T, leafPEM, chainPEM string, usage x509.ExtKeyUsage) {
	t.Helper()
	certs := parseChain(t, chainPEM)
	roots, intermediates := x509.NewCertPool(), x509.NewCertPool()
	roots.AddCert(certs[len(certs)-1])
	for _, c := range certs[:len(certs)-1] {
		intermediates.AddCert(c)
	}
	_, err := parseCertificate(t, leafPEM).Verify(x509.VerifyOptions{
		Roots: roots, Intermediates: intermediates, KeyUsages: []x509.ExtKeyUsage{usage},
	})
	require.NoError(t, err)
}

// session is a KMIP client talking through a KMIP server: the server's token plus the headers the KMIP daemon
// sets once it has checked both sides of the TLS connection.
type session struct {
	client  *api.ClientWithResponses
	headers map[string]string
}

func (s session) with(overrides map[string]string) session {
	headers := map[string]string{}
	for k, v := range s.headers {
		headers[k] = v
	}
	for k, v := range overrides {
		if v == "" {
			delete(headers, k)
		} else {
			headers[k] = v
		}
	}
	return session{client: s.client, headers: headers}
}

func (s session) editor() api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		for k, v := range s.headers {
			req.Header.Set(k, v)
		}
		return nil
	}
}

func sessionHeaders(p *fixture.Project, clientID, clientSerial, serverSerial string) map[string]string {
	return map[string]string{
		"x-kmip-project-id":                       p.ID,
		"x-kmip-client-id":                        clientID,
		"x-kmip-client-certificate-serial-number": clientSerial,
		"x-kmip-server-certificate-serial-number": serverSerial,
	}
}

// newSession registers a KMIP client with the operations given, issues its certificate, and enrolls a KMIP server
// for the project's organization.
func newSession(t *testing.T, p *fixture.Project, permissions ...string) (session, kmipClient) {
	t.Helper()
	tn := p.Tenant()
	c := newClient(t, p, permissions...)
	res, cert := issueCertificate(t, p, c.ID, map[string]any{"keyAlgorithm": "RSA_2048", "ttl": "1d"})
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	server := enrollServer(t, tn)
	return session{client: tn.Client(t, server.token), headers: sessionHeaders(p, c.ID, cert.SerialNumber, server.serial)}, c
}

// call sends one KMIP operation and returns the status and body.
func (s session) call(t *testing.T, operation string, body map[string]any) (int, []byte) {
	t.Helper()
	ctx, editor, ct := t.Context(), s.editor(), "application/json"
	switch operation {
	case "create":
		r, err := s.client.KmipCreateWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "get":
		r, err := s.client.KmipGetWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "get-attributes":
		r, err := s.client.KmipGetAttributesWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "destroy":
		r, err := s.client.KmipDestroyWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "activate":
		r, err := s.client.KmipActivateWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "revoke":
		r, err := s.client.KmipRevokeWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "locate":
		r, err := s.client.KmipLocateWithResponse(ctx, editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	case "register":
		r, err := s.client.KmipRegisterWithBodyWithResponse(ctx, ct, kms.JSON(t, body), editor)
		require.NoErrorf(t, err, "KMIP %s", operation)
		return r.StatusCode(), r.Body
	}
	t.Fatalf("unknown KMIP operation %q", operation)
	return 0, nil
}

// callOK sends one KMIP operation that must succeed and decodes its body.
func callOK[T any](t *testing.T, s session, operation string, body map[string]any) T {
	t.Helper()
	status, raw := s.call(t, operation, body)
	requireStatus(t, http.StatusOK, status, raw)
	return kms.Decode[T](t, raw)
}

type kmipAttributes struct {
	ID        uuid.UUID
	Algorithm string
	IsActive  bool `json:"isActive"`
}

// sampleBody is a body that passes validation for each operation, so a refusal is about the caller.
func sampleBody(operation string, keyID uuid.UUID) map[string]any {
	switch operation {
	case "create":
		return map[string]any{"algorithm": "aes-256-gcm"}
	case "locate":
		return nil
	case "register":
		return map[string]any{"key": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "name": "r-" + id.Short(), "algorithm": "aes-256-gcm"}
	default:
		return map[string]any{"id": keyID.String()}
	}
}
