package template

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"strings"
)

const (
	errJunk = "error filtering pem: found junk"

	certTypeLeaf         = "leaf"
	certTypeIntermediate = "intermediate"
	certTypeRoot         = "root"
)

func filterPEM(pemType, input string) string {
	data := []byte(input)
	var blocks []byte
	var block *pem.Block
	var rest []byte
	for {
		block, rest = pem.Decode(data)
		data = rest

		if block == nil {
			break
		}
		if !strings.EqualFold(block.Type, pemType) {
			continue
		}

		var buf bytes.Buffer
		err := pem.Encode(&buf, block)
		if err != nil {
			panic(fmt.Sprintf("[filterPEM] Error: %v", err))
		}
		blocks = append(blocks, buf.Bytes()...)
	}

	if len(blocks) == 0 && len(rest) != 0 {
		panic(fmt.Sprintf("[filterPEM] Error: %v", errJunk))
	}

	return string(blocks)
}

func filterCertChain(certType, input string) string {
	ordered := fetchX509CertChains([]byte(input))

	switch certType {
	case certTypeLeaf:
		cert := ordered[0]
		if cert.AuthorityKeyId != nil && !bytes.Equal(cert.AuthorityKeyId, cert.SubjectKeyId) {
			return pemEncode(ordered[0].Raw, pemTypeCertificate)
		}
	case certTypeIntermediate:
		if len(ordered) < 2 {
			return ""
		}
		var pemData []byte
		for _, cert := range ordered[1:] {
			if isRootCertificate(cert) {
				break
			}
			b := &pem.Block{
				Type:  pemTypeCertificate,
				Bytes: cert.Raw,
			}
			pemData = append(pemData, pem.EncodeToMemory(b)...)
		}
		return string(pemData)
	case certTypeRoot:
		cert := ordered[len(ordered)-1]
		if isRootCertificate(cert) {
			return pemEncode(cert.Raw, pemTypeCertificate)
		}
	}

	return ""
}

func isRootCertificate(cert *x509.Certificate) bool {
	return cert.AuthorityKeyId == nil || bytes.Equal(cert.AuthorityKeyId, cert.SubjectKeyId)
}

func pemEncode(thing []byte, kind string) string {
	buf := bytes.NewBuffer(nil)
	err := pem.Encode(buf, &pem.Block{Type: kind, Bytes: thing})

	if err != nil {
		panic(fmt.Sprintf("[pemEncode] Error: %v", err))
	}

	return buf.String()
}
