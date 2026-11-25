// Package issuer is the signing half of a fake certificate authority: a self-signed
// root that signs the CSRs a fake CA's API receives.
package issuer

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"math/big"
	"strings"
	"time"
)

// CA is a root that signs leaves.
type CA struct {
	key  *ecdsa.PrivateKey
	Cert *x509.Certificate
}

// New creates a root named commonName.
func New(commonName string) *CA {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: commonName},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		panic(err)
	}
	return &CA{key: key, Cert: cert}
}

// Leaf is a certificate the CA signed.
type Leaf struct {
	Serial string
	PEM    string
}

// Create signs tmpl for pub under the root and returns the certificate's DER, for a fake
// whose leaves differ from what Sign builds.
func (c *CA) Create(tmpl *x509.Certificate, pub any) ([]byte, error) {
	return x509.CreateCertificate(rand.Reader, tmpl, c.Cert, pub, c.key)
}

// Sign issues a leaf for the CSR's key, subject and DNS names, valid for days.
func (c *CA) Sign(csr *x509.CertificateRequest, days int) (Leaf, error) {
	if days <= 0 {
		days = 90
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return Leaf{}, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: csr.Subject.CommonName},
		DNSNames:     csr.DNSNames,
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Duration(days) * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := c.Create(tmpl, csr.PublicKey)
	if err != nil {
		return Leaf{}, err
	}
	return Leaf{Serial: hex.EncodeToString(serial.Bytes()), PEM: PEM(der)}, nil
}

var oidBasicConstraints = asn1.ObjectIdentifier{2, 5, 29, 19}

// SignCA issues a CA certificate for the CSR's key under its full subject, with the path
// length the CSR asks for, and returns it in PEM.
func (c *CA) SignCA(csr *x509.CertificateRequest, notAfter time.Time) (string, error) {
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return "", err
	}
	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               csr.Subject,
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            -1,
	}
	for _, ext := range csr.Extensions {
		if !ext.Id.Equal(oidBasicConstraints) {
			continue
		}
		var bc struct {
			IsCA       bool `asn1:"optional"`
			MaxPathLen int  `asn1:"optional,default:-1"`
		}
		if _, err := asn1.Unmarshal(ext.Value, &bc); err == nil && bc.MaxPathLen >= 0 {
			tmpl.MaxPathLen, tmpl.MaxPathLenZero = bc.MaxPathLen, bc.MaxPathLen == 0
		}
	}
	der, err := c.Create(tmpl, csr.PublicKey)
	if err != nil {
		return "", err
	}
	return PEM(der), nil
}

// RootPEM is the root certificate in PEM.
func (c *CA) RootPEM() string { return PEM(c.Cert.Raw) }

// PEM encodes one DER certificate.
func PEM(der []byte) string {
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

// ParseCSR reads a PKCS#10 request in PEM or bare base64 DER, checking its signature.
func ParseCSR(in string) (*x509.CertificateRequest, error) {
	var der []byte
	if block, _ := pem.Decode([]byte(in)); block != nil {
		der = block.Bytes
	} else {
		b, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(in), ""))
		if err != nil {
			return nil, errors.New("the CSR is neither PEM nor base64 DER")
		}
		der = b
	}
	csr, err := x509.ParseCertificateRequest(der)
	if err != nil {
		return nil, err
	}
	if err := csr.CheckSignature(); err != nil {
		return nil, err
	}
	return csr, nil
}
