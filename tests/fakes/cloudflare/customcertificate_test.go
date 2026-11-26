package cloudflare_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/stretchr/testify/require"
)

func selfSigned(t *testing.T, name string) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: name}, DNSNames: []string{name},
		NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func uploadBody(t *testing.T, cert string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]string{"certificate": cert, "private_key": "-----BEGIN PRIVATE KEY-----", "type": "sni_custom", "bundle_method": "force"})
	require.NoError(t, err)
	return string(raw)
}

func TestCloudflareFake_CustomCertificates(t *testing.T) {
	t.Run("should keep the certificate id and replace the body when a custom certificate is patched", func(t *testing.T) {
		// Setup
		fakes, cf := newAccount(t, "tok-cc-a")
		cf.Seed(t, cloudflare.WithZone("zone1"))
		_, created := call(t, fakes, "tok-cc-a", "POST", "/client/v4/zones/zone1/custom_certificates", uploadBody(t, selfSigned(t, "a.test")))
		id := created["result"].(map[string]any)["id"].(string)

		// Action
		code, _ := call(t, fakes, "tok-cc-a", "PATCH", "/client/v4/zones/zone1/custom_certificates/"+id, uploadBody(t, selfSigned(t, "b.test")))

		// Assert
		require.Equal(t, http.StatusOK, code)
		certs := cf.State(t).CustomCertificates["zone1"]
		require.Len(t, certs, 1)
		require.Equal(t, id, certs[0].ID)
		require.Equal(t, []string{"b.test"}, certs[0].Hosts)
		require.Equal(t, "sni_custom", certs[0].Type)
	})

	t.Run("should page the list and report the page count", func(t *testing.T) {
		// Setup
		fakes, cf := newAccount(t, "tok-cc-b")
		cf.Seed(t, cloudflare.WithZone("zone1"))
		for range 3 {
			call(t, fakes, "tok-cc-b", "POST", "/client/v4/zones/zone1/custom_certificates", uploadBody(t, selfSigned(t, "a.test")))
		}

		// Action
		_, page := call(t, fakes, "tok-cc-b", "GET", "/client/v4/zones/zone1/custom_certificates?page=2&per_page=2", "")

		// Assert
		require.Len(t, page["result"], 1)
		require.EqualValues(t, 2, page["result_info"].(map[string]any)["total_pages"])
	})

	t.Run("should refuse an upload that is not a certificate", func(t *testing.T) {
		// Setup
		fakes, cf := newAccount(t, "tok-cc-c")
		cf.Seed(t, cloudflare.WithZone("zone1"))

		// Action
		code, body := call(t, fakes, "tok-cc-c", "POST", "/client/v4/zones/zone1/custom_certificates", uploadBody(t, "nope"))

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.True(t, strings.Contains(body["errors"].([]any)[0].(map[string]any)["message"].(string), "invalid"))
		require.Empty(t, cf.State(t).CustomCertificates["zone1"])
	})
}
