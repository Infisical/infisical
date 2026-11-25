package aws

import (
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// PrivateCAs is one account's AWS Private CAs in the served region, by ARN.
type PrivateCAs struct {
	Policy
	Authorities map[string]*PrivateCA `json:"authorities"`
	// NextValidityDays, when set, replaces the validity the next IssueCertificate asks
	// for, so a test can get a certificate that is already inside its renewal window.
	NextValidityDays int `json:"nextValidityDays,omitempty"`
	// HoldIssued keeps every certificate issued from now on in progress, answering
	// GetCertificate with RequestInProgressException, until a seed releases them.
	HoldIssued bool `json:"holdIssued,omitempty"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

// PrivateCA is a CA a test seeded. Its keypair and self-signed certificate are made on
// seeding, so a leaf it issues verifies against Certificate.
type PrivateCA struct {
	ARN          string                  `json:"arn"`
	Status       string                  `json:"status"`
	KeyAlgorithm string                  `json:"keyAlgorithm"`
	UsageMode    string                  `json:"usageMode,omitempty"`
	Certificate  string                  `json:"certificate"`
	PrivateKey   string                  `json:"privateKey"`
	Issued       map[string]*PCAIssuance `json:"issued,omitempty"`
}

// PCAIssuance is one IssueCertificate, by certificate ARN.
type PCAIssuance struct {
	Certificate      string `json:"certificate"`
	SigningAlgorithm string `json:"signingAlgorithm"`
	TemplateArn      string `json:"templateArn"`
	ValidityDays     int    `json:"validityDays"`
	// Serial is the leaf's serial in lowercase hex without leading zeros.
	Serial           string     `json:"serial"`
	InProgress       bool       `json:"inProgress,omitempty"`
	RevokedAt        *time.Time `json:"revokedAt,omitempty"`
	RevocationReason string     `json:"revocationReason,omitempty"`
}

func newPrivateCAs(svc service, events fakenet.Emitter) fakenet.Fake {
	p := &PrivateCAs{Authorities: map[string]*PrivateCA{}, events: events}
	p.h = handler{svc: svc, mu: &p.mu, policy: func() *Policy { return &p.Policy }, actions: map[string]func(call) (any, *apiError){
		"DescribeCertificateAuthority":       p.describe,
		"IssueCertificate":                   p.issue,
		"GetCertificate":                     p.getCertificate,
		"GetCertificateAuthorityCertificate": p.getCACertificate,
		"RevokeCertificate":                  p.revoke,
	}}
	return p
}

func (p *PrivateCAs) ServeHTTP(w http.ResponseWriter, r *http.Request) { p.h.serve(w, r) }

func (p *PrivateCAs) Snapshot() ([]byte, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Authorities map[string]*PrivateCA `json:"authorities"`
	}{p.Policy, p.Authorities})
}

// Seed merges CAs by ARN, minting a keypair and certificate for any that lacks one. It
// also sets the validity of the next issued certificate and holds or releases issuance.
func (p *PrivateCAs) Seed(raw []byte) error {
	var in struct {
		Policy
		Authorities      map[string]*PrivateCA `json:"authorities"`
		NextValidityDays int                   `json:"nextValidityDays"`
		HoldIssued       bool                  `json:"holdIssued"`
		ReleaseIssued    bool                  `json:"releaseIssued"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.merge(in.Policy)
	if in.NextValidityDays > 0 {
		p.NextValidityDays = in.NextValidityDays
	}
	if in.HoldIssued {
		p.HoldIssued = true
	}
	if in.ReleaseIssued {
		p.HoldIssued = false
		for _, ca := range p.Authorities {
			for _, issued := range ca.Issued {
				issued.InProgress = false
			}
		}
	}
	for arn, ca := range in.Authorities {
		ca.ARN = arn
		if ca.KeyAlgorithm == "" {
			ca.KeyAlgorithm = "RSA_2048"
		}
		if ca.Status == "" {
			ca.Status = "ACTIVE"
		}
		if ca.UsageMode == "" {
			ca.UsageMode = "GENERAL_PURPOSE"
		}
		if ca.Certificate == "" {
			self, err := newIssuer("Private CA "+id.Hex(4), nil, ca.KeyAlgorithm)
			if err != nil {
				return err
			}
			ca.Certificate, ca.PrivateKey = self.Certificate, self.PrivateKey
		}
		if existing, ok := p.Authorities[arn]; ok && ca.Issued == nil {
			ca.Issued = existing.Issued
		}
		p.Authorities[arn] = ca
	}
	return nil
}

func (p *PrivateCAs) find(arn string) (*PrivateCA, *apiError) {
	ca, ok := p.Authorities[arn]
	if !ok {
		return nil, errf(http.StatusBadRequest, "ResourceNotFoundException", "Could not find certificate authority %s.", arn)
	}
	return ca, nil
}

func (p *PrivateCAs) describe(c call) (any, *apiError) {
	var in struct{ CertificateAuthorityArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	ca, aErr := p.find(in.CertificateAuthorityArn)
	if aErr != nil {
		return nil, aErr
	}
	return map[string]any{"CertificateAuthority": map[string]any{
		"Arn":       ca.ARN,
		"Status":    ca.Status,
		"Type":      "ROOT",
		"UsageMode": ca.UsageMode,
		"CertificateAuthorityConfiguration": map[string]any{
			"KeyAlgorithm":     ca.KeyAlgorithm,
			"SigningAlgorithm": signingAlgorithmFor(ca.KeyAlgorithm),
		},
	}}, nil
}

func signingAlgorithmFor(keyAlg string) string {
	switch keyAlg {
	case "RSA_3072":
		return "SHA384WITHRSA"
	case "RSA_4096":
		return "SHA512WITHRSA"
	case "EC_prime256v1":
		return "SHA256WITHECDSA"
	case "EC_secp384r1":
		return "SHA384WITHECDSA"
	case "EC_secp521r1":
		return "SHA512WITHECDSA"
	}
	return "SHA256WITHRSA"
}

type pcaSubject struct {
	CommonName         string
	Organization       string
	OrganizationalUnit string
	Country            string
	State              string
	Locality           string
}

func (s pcaSubject) name() pkix.Name {
	n := pkix.Name{CommonName: s.CommonName}
	for _, f := range []struct {
		v   string
		dst *[]string
	}{{s.Organization, &n.Organization}, {s.OrganizationalUnit, &n.OrganizationalUnit}, {s.Country, &n.Country}, {s.State, &n.Province}, {s.Locality, &n.Locality}} {
		if f.v != "" {
			*f.dst = []string{f.v}
		}
	}
	return n
}

// issue signs the CSR, taking the subject and DNS names from ApiPassthrough over the
// CSR's own. An APICSRPassthrough template also copies the extended key usages the CSR
// requests, as the real templates copy the CSR's extensions.
func (p *PrivateCAs) issue(c call) (any, *apiError) {
	var in struct {
		CertificateAuthorityArn string
		Csr                     []byte
		SigningAlgorithm        string
		TemplateArn             string
		Validity                struct {
			Type  string
			Value int
		}
		ApiPassthrough *struct {
			Subject    *pcaSubject
			Extensions *struct {
				SubjectAlternativeNames []struct{ DnsName string }
			}
		}
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	ca, aErr := p.find(in.CertificateAuthorityArn)
	if aErr != nil {
		return nil, aErr
	}
	if ca.Status != "ACTIVE" {
		return nil, errf(http.StatusBadRequest, "InvalidStateException", "The certificate authority %s is not in the correct state to issue certificates.", ca.ARN)
	}
	if in.SigningAlgorithm != signingAlgorithmFor(ca.KeyAlgorithm) {
		return nil, errf(http.StatusBadRequest, "InvalidArgsException", "The signing algorithm %s is not supported by the CA's key algorithm %s.", in.SigningAlgorithm, ca.KeyAlgorithm)
	}
	if in.Validity.Type != "DAYS" || in.Validity.Value < 1 {
		return nil, errf(http.StatusBadRequest, "InvalidArgsException", "The validity is invalid.")
	}
	block, _ := pem.Decode(in.Csr)
	if block == nil {
		return nil, errf(http.StatusBadRequest, "MalformedCSRException", "The CSR is not PEM.")
	}
	csr, err := x509.ParseCertificateRequest(block.Bytes)
	if err != nil || csr.CheckSignature() != nil {
		return nil, errf(http.StatusBadRequest, "MalformedCSRException", "The CSR could not be parsed or its signature is invalid.")
	}
	subject, dnsNames := csr.Subject, csr.DNSNames
	if in.ApiPassthrough != nil {
		if in.ApiPassthrough.Subject != nil {
			subject = in.ApiPassthrough.Subject.name()
		}
		if in.ApiPassthrough.Extensions != nil && len(in.ApiPassthrough.Extensions.SubjectAlternativeNames) > 0 {
			dnsNames = nil
			for _, san := range in.ApiPassthrough.Extensions.SubjectAlternativeNames {
				if san.DnsName != "" {
					dnsNames = append(dnsNames, san.DnsName)
				}
			}
		}
	}
	var eku []x509.ExtKeyUsage
	if strings.HasSuffix(in.TemplateArn, "APICSRPassthrough/V1") {
		eku = csrExtKeyUsage(csr)
	}
	days := in.Validity.Value
	if p.NextValidityDays > 0 {
		days, p.NextValidityDays = p.NextValidityDays, 0
	}
	signer := &issuer{Certificate: ca.Certificate, PrivateKey: ca.PrivateKey}
	leaf, leafPEM, err := signer.sign(csr.PublicKey, subject, dnsNames, days, eku...)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	certARN := ca.ARN + "/certificate/" + id.Hex(16)
	if ca.Issued == nil {
		ca.Issued = map[string]*PCAIssuance{}
	}
	ca.Issued[certARN] = &PCAIssuance{Certificate: leafPEM, SigningAlgorithm: in.SigningAlgorithm, TemplateArn: in.TemplateArn, ValidityDays: days, Serial: leaf.SerialNumber.Text(16), InProgress: p.HoldIssued}
	p.events.Publish(PrivateCertificateIssued{CertificateAuthorityArn: ca.ARN, CertificateArn: certARN})
	return map[string]any{"CertificateArn": certARN}, nil
}

func (p *PrivateCAs) getCertificate(c call) (any, *apiError) {
	var in struct {
		CertificateAuthorityArn string
		CertificateArn          string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	ca, aErr := p.find(in.CertificateAuthorityArn)
	if aErr != nil {
		return nil, aErr
	}
	issued, ok := ca.Issued[in.CertificateArn]
	if !ok {
		return nil, errf(http.StatusBadRequest, "ResourceNotFoundException", "Could not find certificate %s.", in.CertificateArn)
	}
	p.events.Publish(PrivateCertificateFetched{CertificateAuthorityArn: ca.ARN, CertificateArn: in.CertificateArn, InProgress: issued.InProgress})
	if issued.InProgress {
		return nil, errf(http.StatusBadRequest, "RequestInProgressException", "Your request is already in progress.")
	}
	return map[string]any{"Certificate": issued.Certificate, "CertificateChain": ca.Certificate}, nil
}

func (p *PrivateCAs) getCACertificate(c call) (any, *apiError) {
	var in struct{ CertificateAuthorityArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	ca, aErr := p.find(in.CertificateAuthorityArn)
	if aErr != nil {
		return nil, aErr
	}
	return map[string]any{"Certificate": ca.Certificate}, nil
}
