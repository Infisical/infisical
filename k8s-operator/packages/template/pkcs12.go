package template

import (
	"bytes"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"

	gopkcs12 "software.sslmate.com/src/go-pkcs12"
)

func pkcs12keyPass(pass, input string) string {
	privateKey, _, _, err := gopkcs12.DecodeChain([]byte(input), pass)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	marshalPrivateKey, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{
		Type:  pemTypeKey,
		Bytes: marshalPrivateKey,
	}); err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}
	return buf.String()
}

func parsePrivateKey(block []byte) any {
	if k, err := x509.ParsePKCS1PrivateKey(block); err == nil {
		return k
	}
	if k, err := x509.ParsePKCS8PrivateKey(block); err == nil {
		return k
	}
	if k, err := x509.ParseECPrivateKey(block); err == nil {
		return k
	}
	panic("Error: unable to parse private key")
}

func pkcs12key(input string) string {
	return pkcs12keyPass("", input)
}

func pkcs12certPass(pass, input string) string {
	_, certificate, caCerts, err := gopkcs12.DecodeChain([]byte(input), pass)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	var pemData []byte
	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{
		Type:  pemTypeCertificate,
		Bytes: certificate.Raw,
	}); err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	pemData = append(pemData, buf.Bytes()...)

	for _, ca := range caCerts {
		var buf bytes.Buffer
		if err := pem.Encode(&buf, &pem.Block{
			Type:  pemTypeCertificate,
			Bytes: ca.Raw,
		}); err != nil {
			panic(fmt.Sprintf("Error: %v", err))
		}
		pemData = append(pemData, buf.Bytes()...)
	}

	// try to order certificate chain. If it fails we return
	// the unordered raw pem data.
	// This fails if multiple leaf or disjunct certs are provided.
	ordered := fetchCertChains(pemData)

	return string(ordered)
}

func pkcs12cert(input string) string {
	return pkcs12certPass("", input)
}

func pemToPkcs12(cert, key string) string {
	return pemToPkcs12Pass(cert, key, "")
}

func pemToPkcs12Pass(cert, key, pass string) string {
	certPem, _ := pem.Decode([]byte(cert))

	parsedCert, err := x509.ParseCertificate(certPem.Bytes)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	return certsToPkcs12(parsedCert, key, nil, pass)
}

func fullPemToPkcs12(cert, key string) string {
	return fullPemToPkcs12Pass(cert, key, "")
}

func fullPemToPkcs12Pass(cert, key, pass string) string {
	certPem, rest := pem.Decode([]byte(cert))

	parsedCert, err := x509.ParseCertificate(certPem.Bytes)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	caCerts := make([]*x509.Certificate, 0)
	for len(rest) > 0 {
		caPem, restBytes := pem.Decode(rest)
		rest = restBytes

		caCert, err := x509.ParseCertificate(caPem.Bytes)
		if err != nil {
			panic(fmt.Sprintf("Error: %v", err))
		}

		caCerts = append(caCerts, caCert)
	}

	return certsToPkcs12(parsedCert, key, caCerts, pass)
}

func certsToPkcs12(cert *x509.Certificate, key string, caCerts []*x509.Certificate, password string) string {
	keyPem, _ := pem.Decode([]byte(key))
	parsedKey := parsePrivateKey(keyPem.Bytes)

	pfx, err := gopkcs12.Modern.Encode(parsedKey, cert, caCerts, password)
	if err != nil {
		panic(fmt.Sprintf("Error: %v", err))
	}

	return base64.StdEncoding.EncodeToString(pfx)
}
