package discovery_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// targetName is a name of the test's own that fakenet answers TLS for.
func targetName() string { return id.Short() + ".disc.test" }

func newDiscovery(t *testing.T, tn *harness.Tenant, proj *pki.Project, ports string, domains ...string) uuid.UUID {
	t.Helper()
	body := api.CreatePkiDiscoveryJSONRequestBody{
		ProjectId:     new(proj.ID.String()),
		Name:          "discovery-" + id.Short(),
		DiscoveryType: new(api.CreatePkiDiscoveryJSONBodyDiscoveryTypeNetwork),
	}
	body.TargetConfig.Domains = &domains
	body.TargetConfig.Ports = &ports
	res, err := tn.Admin.API.CreatePkiDiscoveryWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a discovery returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Id
}

// triggerScan starts a scan and requires it to be queued.
func triggerScan(t *testing.T, tn *harness.Tenant, discoveryID uuid.UUID) {
	t.Helper()
	res, err := tn.Admin.API.TriggerPkiDiscoveryScanWithResponse(t.Context(), discoveryID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering a scan: %s", apierr.Body(res.Body))
}

// scanned triggers a scan and waits for it to finish.
func scanned(t *testing.T, tn *harness.Tenant, discoveryID uuid.UUID) *api.GetPkiDiscoveryLatestScanResponse {
	t.Helper()
	triggerScan(t, tn, discoveryID)
	return pki.ScanFinished(t, tn.Admin, discoveryID)
}

type installation struct {
	ID         uuid.UUID
	LastSeenAt time.Time
	Details    map[string]any
}

// installationsNamed is every installation of the project named name.
func installationsNamed(t *testing.T, tn *harness.Tenant, proj *pki.Project, name string) []installation {
	t.Helper()
	res, err := tn.Admin.API.ListPkiInstallationsWithResponse(t.Context(), &api.ListPkiInstallationsParams{ProjectId: new(proj.ID.String())})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing installations returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out []installation
	for _, i := range res.JSON200.Installations {
		if i.Name == nil || *i.Name != name {
			continue
		}
		details, _ := i.LocationDetails.(map[string]any)
		out = append(out, installation{ID: i.Id, LastSeenAt: i.LastSeenAt, Details: details})
	}
	return out
}

type linkedCertificate struct {
	ID         uuid.UUID
	CommonName string
	Serial     string
}

// certificatesAt is every certificate linked to an installation.
func certificatesAt(t *testing.T, tn *harness.Tenant, installationID uuid.UUID) []linkedCertificate {
	t.Helper()
	res, err := tn.Admin.API.GetPkiInstallationWithResponse(t.Context(), installationID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading an installation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out []linkedCertificate
	if res.JSON200.Certificates == nil {
		return out
	}
	for _, c := range *res.JSON200.Certificates {
		l := linkedCertificate{ID: c.CertificateId}
		if c.CommonName != nil {
			l.CommonName = *c.CommonName
		}
		if c.SerialNumber != nil {
			l.Serial = *c.SerialNumber
		}
		out = append(out, l)
	}
	return out
}

// selfSignedServerCert is a certificate and key for name that fakenet can present in
// place of the one it mints.
func selfSignedServerCert(t *testing.T, name string) (certPEM, keyPEM string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 64))
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: name, Organization: []string{"Rotated"}},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(0, 3, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	keyDER, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}))
}
