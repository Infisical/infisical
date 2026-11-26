package aws

import (
	"crypto/x509"
	"encoding/asn1"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"time"
)

// ACMCertificateRenewed is a RenewCertificate that put a new body on the same ARN.
type ACMCertificateRenewed struct {
	ACMCertificateDetail
	Serial string `json:"serial"`
}

// ACMCertificateRevoked is a RevokeCertificate in ACM.
type ACMCertificateRevoked struct {
	ACMCertificateDetail
	Reason string `json:"reason"`
}

// PrivateCertificateRevoked is a RevokeCertificate on an AWS Private CA.
type PrivateCertificateRevoked struct {
	CertificateAuthorityArn string `json:"certificateAuthorityArn"`
	CertificateArn          string `json:"certificateArn"`
	Serial                  string `json:"serial"`
	Reason                  string `json:"reason"`
}

func (ACMCertificateRenewed) EventName() string     { return "aws.certificate-renewed" }
func (ACMCertificateRevoked) EventName() string     { return "aws.certificate-revoked" }
func (PrivateCertificateRevoked) EventName() string { return "aws.private-certificate-revoked" }

var acmRevocationReasons = []string{"UNSPECIFIED", "KEY_COMPROMISE", "CA_COMPROMISE", "AFFILIATION_CHANGED", "SUPERSEDED",
	"CESSATION_OF_OPERATION", "CERTIFICATE_HOLD", "REMOVE_FROM_CRL", "PRIVILEGE_WITHDRAWN", "A_A_COMPROMISE"}

var pcaRevocationReasons = []string{"UNSPECIFIED", "KEY_COMPROMISE", "CERTIFICATE_AUTHORITY_COMPROMISE", "AFFILIATION_CHANGED",
	"SUPERSEDED", "CESSATION_OF_OPERATION", "PRIVILEGE_WITHDRAWN", "A_A_COMPROMISE"}

// renewCertificate reissues an exportable certificate ACM issued under the same ARN,
// on a new key, as a manual renewal of an exportable public certificate does.
func (m *CertificateManager) renewCertificate(c call) (any, *apiError) {
	var in struct{ CertificateArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	if cert.Type != "AMAZON_ISSUED" || !cert.Exportable || cert.Status != "ISSUED" {
		return nil, errf(http.StatusBadRequest, "ValidationException", "Certificate %s is not eligible for renewal", cert.ARN)
	}
	ca, chain, err := amazonIssuer()
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	key, err := newKey(cert.KeyAlgorithm)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	old, err := parseCertificate(cert.Certificate)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	leaf, leafPEM, err := ca.sign(key.Public(), old.Subject, old.DNSNames, AmazonIssuedValidityDays)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	keyPEM, err := encodeKey(key)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	now := time.Now().UTC()
	cert.Certificate, cert.CertificateChain, cert.PrivateKey = leafPEM, chain, keyPEM
	cert.Renewals++
	cert.RenewedAt = &now
	describeParsed(cert, leaf)
	m.events.Publish(ACMCertificateRenewed{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}, cert.Serial})
	return map[string]any{}, nil
}

func (m *CertificateManager) revokeCertificate(c call) (any, *apiError) {
	var in struct {
		CertificateArn   string
		RevocationReason string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	if !slices.Contains(acmRevocationReasons, in.RevocationReason) {
		return nil, errf(http.StatusBadRequest, "ValidationException", "1 validation error detected: Value '%s' at 'revocationReason' failed to satisfy constraint: Member must satisfy enum value set: [%s]", in.RevocationReason, strings.Join(acmRevocationReasons, ", "))
	}
	if cert.Type != "AMAZON_ISSUED" || !cert.Exportable {
		return nil, errf(http.StatusBadRequest, "ValidationException", "Certificate %s is not an exportable public certificate", cert.ARN)
	}
	if cert.Status == "REVOKED" {
		return nil, errf(http.StatusBadRequest, "ResourceInUseException", "Certificate %s is already revoked", cert.ARN)
	}
	now := time.Now().UTC()
	cert.Status, cert.RevokedAt, cert.RevocationReason = "REVOKED", &now, in.RevocationReason
	m.events.Publish(ACMCertificateRevoked{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}, in.RevocationReason})
	return map[string]any{"CertificateArn": cert.ARN}, nil
}

// revoke revokes a certificate the CA issued, found by serial in hex with or without
// colons.
func (p *PrivateCAs) revoke(c call) (any, *apiError) {
	var in struct {
		CertificateAuthorityArn string
		CertificateSerial       string
		RevocationReason        string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	ca, aErr := p.find(in.CertificateAuthorityArn)
	if aErr != nil {
		return nil, aErr
	}
	if !slices.Contains(pcaRevocationReasons, in.RevocationReason) {
		return nil, errf(http.StatusBadRequest, "ValidationException", "1 validation error detected: Value '%s' at 'revocationReason' failed to satisfy constraint: Member must satisfy enum value set: [%s]", in.RevocationReason, strings.Join(pcaRevocationReasons, ", "))
	}
	if ca.Status != "ACTIVE" && ca.Status != "DISABLED" {
		return nil, errf(http.StatusBadRequest, "InvalidStateException", "The certificate authority %s is not in the correct state to revoke certificates.", ca.ARN)
	}
	serial, ok := new(big.Int).SetString(strings.ReplaceAll(in.CertificateSerial, ":", ""), 16)
	if !ok {
		return nil, errf(http.StatusBadRequest, "InvalidArgsException", "The certificate serial %s is not hexadecimal.", in.CertificateSerial)
	}
	for arn, issued := range ca.Issued {
		if issued.Serial != serial.Text(16) {
			continue
		}
		if issued.RevokedAt != nil {
			return nil, errf(http.StatusBadRequest, "RequestAlreadyProcessedException", "The certificate %s has already been revoked.", in.CertificateSerial)
		}
		now := time.Now().UTC()
		issued.RevokedAt, issued.RevocationReason = &now, in.RevocationReason
		p.events.Publish(PrivateCertificateRevoked{CertificateAuthorityArn: ca.ARN, CertificateArn: arn, Serial: issued.Serial, Reason: in.RevocationReason})
		return map[string]any{}, nil
	}
	return nil, errf(http.StatusBadRequest, "ResourceNotFoundException", "Could not find certificate with serial %s.", in.CertificateSerial)
}

var (
	oidExtKeyUsage = asn1.ObjectIdentifier{2, 5, 29, 37}
	extKeyUsageOID = map[string]x509.ExtKeyUsage{
		"1.3.6.1.5.5.7.3.1": x509.ExtKeyUsageServerAuth,
		"1.3.6.1.5.5.7.3.2": x509.ExtKeyUsageClientAuth,
		"1.3.6.1.5.5.7.3.3": x509.ExtKeyUsageCodeSigning,
		"1.3.6.1.5.5.7.3.4": x509.ExtKeyUsageEmailProtection,
		"1.3.6.1.5.5.7.3.8": x509.ExtKeyUsageTimeStamping,
		"1.3.6.1.5.5.7.3.9": x509.ExtKeyUsageOCSPSigning,
	}
)

// csrExtKeyUsage is the extended key usages a CSR requests, nil when it requests none.
func csrExtKeyUsage(csr *x509.CertificateRequest) []x509.ExtKeyUsage {
	for _, ext := range csr.Extensions {
		if !ext.Id.Equal(oidExtKeyUsage) {
			continue
		}
		var oids []asn1.ObjectIdentifier
		if _, err := asn1.Unmarshal(ext.Value, &oids); err != nil {
			return nil
		}
		var out []x509.ExtKeyUsage
		for _, oid := range oids {
			if u, ok := extKeyUsageOID[oid.String()]; ok {
				out = append(out, u)
			}
		}
		return out
	}
	return nil
}
