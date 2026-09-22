package fakenet

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// CA signs a certificate per hostname on demand.
//
// Per name rather than one certificate carrying every faked host as a SAN, because a
// host nobody faked still has to complete a handshake before it can be told, in a
// 501, that it was never faked. A fixed SAN list cannot answer for a name it has
// never heard of.
type CA struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
	pem  []byte

	mu    sync.Mutex
	cache map[string]*tls.Certificate
}

// LoadOrCreateCA reads the CA at path, creating it if absent.
//
// It has to outlive the container. Infisical is handed this certificate once, when
// its container is created, and is then adopted by later test binaries; a CA minted
// at boot would be replaced every time a fake is edited, and the running Infisical
// would trust an authority that no longer exists.
func LoadOrCreateCA(path string) (*CA, error) {
	if b, err := os.ReadFile(path); err == nil {
		ca, pErr := parseCA(b)
		if pErr == nil {
			return ca, nil
		}
		// A truncated or half-written file is not worth a manual recovery step.
		if rErr := os.Remove(path); rErr != nil {
			return nil, fmt.Errorf("fakenet: removing unreadable CA %s: %w", path, rErr)
		}
	}

	ca, keyPEM, err := newCA()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, append(append([]byte{}, ca.pem...), keyPEM...), 0o600); err != nil {
		return nil, fmt.Errorf("fakenet: writing CA to %s: %w", path, err)
	}
	return ca, nil
}

func newCA() (*CA, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			// Named so that anyone who finds it in a real trust store knows at once
			// what it is and that it does not belong there.
			CommonName:   "Infisical test harness fakenet CA (test use only)",
			Organization: []string{"Infisical blackbox test harness"},
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, nil, err
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, nil, err
	}
	return &CA{
			cert:  cert,
			key:   key,
			pem:   pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
			cache: map[string]*tls.Certificate{},
		},
		pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}),
		nil
}

func parseCA(b []byte) (*CA, error) {
	var certDER, keyDER []byte
	for {
		block, rest := pem.Decode(b)
		if block == nil {
			break
		}
		switch block.Type {
		case "CERTIFICATE":
			certDER = block.Bytes
		case "EC PRIVATE KEY":
			keyDER = block.Bytes
		}
		b = rest
	}
	if certDER == nil || keyDER == nil {
		return nil, fmt.Errorf("fakenet: CA file is missing a certificate or a key")
	}
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, err
	}
	key, err := x509.ParseECPrivateKey(keyDER)
	if err != nil {
		return nil, err
	}
	return &CA{
		cert:  cert,
		key:   key,
		pem:   pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}),
		cache: map[string]*tls.Certificate{},
	}, nil
}

// CertPEM is what the application trusts, through NODE_EXTRA_CA_CERTS or, for a Go
// service, SSL_CERT_FILE.
func (c *CA) CertPEM() []byte { return c.pem }

// TLSConfig serves any hostname a client asks for.
func (c *CA) TLSConfig() *tls.Config {
	return &tls.Config{
		GetCertificate: c.certFor,
		// http/1.1 only. Node's undici negotiates h2 given the chance and this server
		// speaks one protocol.
		NextProtos: []string{"http/1.1"},
		MinVersion: tls.VersionTLS12,
	}
}

func (c *CA) certFor(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	name := hello.ServerName
	if name == "" {
		// No SNI means the client dialled an IP. Nothing can be forged for that, so
		// let the handshake fail against a name the error will report.
		name = "no-sni.invalid"
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if got, ok := c.cache[name]; ok {
		return got, nil
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}
	der, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: name},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(1, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}, c.cert, &key.PublicKey, c.key)
	if err != nil {
		return nil, err
	}

	out := &tls.Certificate{Certificate: [][]byte{der, c.cert.Raw}, PrivateKey: key}
	c.cache[name] = out
	return out, nil
}
