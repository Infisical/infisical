package aws

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	fakeissuer "github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/youmark/pkcs8"
)

// issuer is a CA the fake signs with, kept as PEM so it survives a Snapshot.
type issuer struct {
	Certificate string `json:"certificate"`
	PrivateKey  string `json:"privateKey"`
}

func newKey(alg string) (crypto.Signer, error) {
	switch alg {
	case "", "RSA_2048":
		return rsa.GenerateKey(rand.Reader, 2048)
	case "RSA_3072":
		return rsa.GenerateKey(rand.Reader, 3072)
	case "RSA_4096":
		return rsa.GenerateKey(rand.Reader, 4096)
	case "EC_prime256v1":
		return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case "EC_secp384r1":
		return ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	case "EC_secp521r1":
		return ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	}
	return nil, fmt.Errorf("unsupported key algorithm %s", alg)
}

// keyAlgorithmOf names a public key the way ACM and ACM PCA report it.
func keyAlgorithmOf(pub crypto.PublicKey) string {
	switch k := pub.(type) {
	case *rsa.PublicKey:
		return fmt.Sprintf("RSA_%d", k.N.BitLen())
	case *ecdsa.PublicKey:
		switch k.Curve {
		case elliptic.P256():
			return "EC_prime256v1"
		case elliptic.P384():
			return "EC_secp384r1"
		case elliptic.P521():
			return "EC_secp521r1"
		}
	}
	return "UNKNOWN"
}

func serialNumber() *big.Int {
	n, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 127))
	return n.Add(n, big.NewInt(1))
}

func encodeKey(k crypto.Signer) (string, error) {
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return "", err
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})), nil
}

func newIssuer(commonName string, parent *issuer, keyAlg string) (*issuer, error) {
	key, err := newKey(keyAlg)
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber:          serialNumber(),
		Subject:               pkix.Name{CommonName: commonName, Organization: []string{"Amazon"}, Country: []string{"US"}},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
	}
	parentCert, parentKey := tmpl, key
	if parent != nil {
		if parentCert, parentKey, err = parent.parse(); err != nil {
			return nil, err
		}
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parentCert, key.Public(), parentKey)
	if err != nil {
		return nil, err
	}
	keyPEM, err := encodeKey(key)
	if err != nil {
		return nil, err
	}
	return &issuer{Certificate: fakeissuer.PEM(der), PrivateKey: keyPEM}, nil
}

func (i *issuer) parse() (*x509.Certificate, crypto.Signer, error) {
	cert, err := parseCertificate(i.Certificate)
	if err != nil {
		return nil, nil, err
	}
	key, err := parsePrivateKey(i.PrivateKey)
	if err != nil {
		return nil, nil, err
	}
	return cert, key, nil
}

// sign issues a leaf for pub, valid for days from now, for serverAuth and clientAuth
// unless eku names other extended key usages.
func (i *issuer) sign(pub crypto.PublicKey, subject pkix.Name, dnsNames []string, days int, eku ...x509.ExtKeyUsage) (*x509.Certificate, string, error) {
	ca, caKey, err := i.parse()
	if err != nil {
		return nil, "", err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serialNumber(),
		Subject:      subject,
		DNSNames:     dnsNames,
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Duration(days) * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
	}
	if len(eku) > 0 {
		tmpl.ExtKeyUsage = eku
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca, pub, caKey)
	if err != nil {
		return nil, "", err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, "", err
	}
	return cert, fakeissuer.PEM(der), nil
}

func parseCertificate(p string) (*x509.Certificate, error) {
	block, rest := pem.Decode([]byte(p))
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, errors.New("not a PEM certificate")
	}
	if more, _ := pem.Decode(rest); more != nil {
		return nil, errors.New("more than one certificate")
	}
	return x509.ParseCertificate(block.Bytes)
}

func parsePrivateKey(p string) (crypto.Signer, error) {
	block, _ := pem.Decode([]byte(p))
	if block == nil {
		return nil, errors.New("not a PEM private key")
	}
	switch block.Type {
	case "RSA PRIVATE KEY":
		return x509.ParsePKCS1PrivateKey(block.Bytes)
	case "EC PRIVATE KEY":
		return x509.ParseECPrivateKey(block.Bytes)
	case "PRIVATE KEY":
		k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		s, ok := k.(crypto.Signer)
		if !ok {
			return nil, errors.New("unsupported private key")
		}
		return s, nil
	}
	return nil, fmt.Errorf("unsupported PEM block %s", block.Type)
}

func samePublicKey(a, b crypto.PublicKey) bool {
	type equaler interface{ Equal(crypto.PublicKey) bool }
	e, ok := a.(equaler)
	return ok && e.Equal(b)
}

// colonSerial is a serial as ACM reports it: lowercase hex bytes joined by colons.
func colonSerial(n *big.Int) string {
	h := hex.EncodeToString(n.Bytes())
	parts := make([]string, 0, len(h)/2)
	for i := 0; i+1 < len(h); i += 2 {
		parts = append(parts, h[i:i+2])
	}
	return strings.Join(parts, ":")
}

// encryptPrivateKey is what ACM's ExportCertificate returns: the key as PKCS#8
// encrypted under the caller's passphrase (PBES2 with AES-256-CBC), so only the
// holder of the passphrase can read it.
func encryptPrivateKey(keyPEM string, passphrase []byte) (string, error) {
	key, err := parsePrivateKey(keyPEM)
	if err != nil {
		return "", err
	}
	der, err := pkcs8.MarshalPrivateKey(key, passphrase, nil)
	if err != nil {
		return "", err
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "ENCRYPTED PRIVATE KEY", Bytes: der})), nil
}
