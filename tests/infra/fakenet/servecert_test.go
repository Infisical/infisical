package fakenet

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func selfSigned(t *testing.T, name string) (certPEM, keyPEM string, der []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err = x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: big.NewInt(42),
		Subject:      pkix.Name{CommonName: name},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}, &x509.Certificate{SerialNumber: big.NewInt(42), Subject: pkix.Name{CommonName: name}}, &key.PublicKey, key)
	require.NoError(t, err)
	keyDER, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})), der
}

func TestServeCertificate(t *testing.T) {
	t.Parallel()

	t.Run("should present the supplied certificate for its name and keep minting for other names", func(t *testing.T) {
		t.Parallel()

		// Setup
		ca, _, err := newCA()
		require.NoError(t, err)
		admin := httptest.NewServer(New().Admin(ca))
		t.Cleanup(admin.Close)
		certPEM, keyPEM, der := selfSigned(t, "rotated.disc.test")
		minted, err := ca.certFor(&tls.ClientHelloInfo{ServerName: "rotated.disc.test"})
		require.NoError(t, err)

		// Action
		ServeCertificate(t, admin.URL, "rotated.disc.test", certPEM, keyPEM)

		// Assert
		got, err := ca.certFor(&tls.ClientHelloInfo{ServerName: "rotated.disc.test"})
		require.NoError(t, err)
		require.Equal(t, der, got.Certificate[0])
		require.NotEqual(t, minted.Certificate[0], got.Certificate[0])
		upper, err := ca.certFor(&tls.ClientHelloInfo{ServerName: "Rotated.DISC.test"})
		require.NoError(t, err)
		require.Equal(t, der, upper.Certificate[0])
		other, err := ca.certFor(&tls.ClientHelloInfo{ServerName: "other.disc.test"})
		require.NoError(t, err)
		require.NotEqual(t, der, other.Certificate[0])
	})

	t.Run("should refuse a key that does not match the certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		ca, _, err := newCA()
		require.NoError(t, err)
		certPEM, _, _ := selfSigned(t, "a.disc.test")
		_, otherKey, _ := selfSigned(t, "a.disc.test")
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("PUT", AdminPrefix+"/tls/a.disc.test", jsonBody(t, servedCertificate{Certificate: certPEM, PrivateKey: otherKey}))

		// Action
		New().Admin(ca).ServeHTTP(rec, req)

		// Assert
		require.Equal(t, 400, rec.Code)
		_, minted := ca.cache["a.disc.test"]
		require.False(t, minted)
	})
}

func jsonBody(t *testing.T, v any) io.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return strings.NewReader(string(raw))
}
