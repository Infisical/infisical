package aws

import (
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// AmazonIssuedValidityDays is how long a certificate ACM issues is valid.
const AmazonIssuedValidityDays = 198

// CertificateManager is one account's ACM certificates in the served region, by ARN.
type CertificateManager struct {
	Policy
	Certificates map[string]*ACMCertificate `json:"certificates"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

// ACMCertificate is an imported certificate or one ACM issued. PrivateKey is what was
// imported or generated; ACM never returns it except, encrypted, from ExportCertificate.
type ACMCertificate struct {
	ARN                     string             `json:"arn"`
	Type                    string             `json:"type"`
	Status                  string             `json:"status"`
	DomainName              string             `json:"domainName"`
	SubjectAlternativeNames []string           `json:"subjectAlternativeNames,omitempty"`
	KeyAlgorithm            string             `json:"keyAlgorithm"`
	Serial                  string             `json:"serial"`
	Certificate             string             `json:"certificate"`
	CertificateChain        string             `json:"certificateChain,omitempty"`
	PrivateKey              string             `json:"privateKey,omitempty"`
	Exportable              bool               `json:"exportable,omitempty"`
	Tags                    map[string]string  `json:"tags,omitempty"`
	Validation              []ValidationRecord `json:"validation,omitempty"`
	IdempotencyToken        string             `json:"idempotencyToken,omitempty"`
	NotBefore               time.Time          `json:"notBefore"`
	NotAfter                time.Time          `json:"notAfter"`
	ImportedAt              *time.Time         `json:"importedAt,omitempty"`
	Imports                 int                `json:"imports,omitempty"`
	// Renewals counts RenewCertificate calls that put a new body on the ARN.
	Renewals         int        `json:"renewals,omitempty"`
	RenewedAt        *time.Time `json:"renewedAt,omitempty"`
	RevokedAt        *time.Time `json:"revokedAt,omitempty"`
	RevocationReason string     `json:"revocationReason,omitempty"`
}

// ValidationRecord is the DNS record ACM asks for to prove control of a domain.
type ValidationRecord struct {
	DomainName string `json:"domainName"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Value      string `json:"value"`
}

const acmMaxList = 1000

// amazonCA is the issuing CA behind every certificate ACM issues, the same for every
// account as Amazon's is.
var amazonCA = struct {
	once  sync.Once
	root  *issuer
	inter *issuer
	err   error
}{}

func amazonIssuer() (*issuer, string, error) {
	amazonCA.once.Do(func() {
		amazonCA.root, amazonCA.err = newIssuer("Amazon Root CA 1", nil, "RSA_2048")
		if amazonCA.err == nil {
			amazonCA.inter, amazonCA.err = newIssuer("Amazon RSA 2048 M01", amazonCA.root, "RSA_2048")
		}
	})
	if amazonCA.err != nil {
		return nil, "", amazonCA.err
	}
	return amazonCA.inter, amazonCA.inter.Certificate + amazonCA.root.Certificate, nil
}

func newCertificateManager(svc service, events fakenet.Emitter) fakenet.Fake {
	m := &CertificateManager{Certificates: map[string]*ACMCertificate{}, events: events}
	m.h = handler{svc: svc, mu: &m.mu, policy: func() *Policy { return &m.Policy }, actions: map[string]func(call) (any, *apiError){
		"ImportCertificate":      m.importCertificate,
		"RequestCertificate":     m.requestCertificate,
		"DescribeCertificate":    m.describeCertificate,
		"GetCertificate":         m.getCertificate,
		"ExportCertificate":      m.exportCertificate,
		"ListCertificates":       m.listCertificates,
		"DeleteCertificate":      m.deleteCertificate,
		"AddTagsToCertificate":   m.addTags,
		"ListTagsForCertificate": m.listTags,
		"RenewCertificate":       m.renewCertificate,
		"RevokeCertificate":      m.revokeCertificate,
	}}
	return m
}

func (m *CertificateManager) ServeHTTP(w http.ResponseWriter, r *http.Request) { m.h.serve(w, r) }

func (m *CertificateManager) Snapshot() ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Certificates map[string]*ACMCertificate `json:"certificates"`
	}{m.Policy, m.Certificates})
}

// Seed merges certificates someone else imported, keyed by any name, and deletes the
// ARNs listed as removed, as an operator would in the console. A seed without a body
// gets a self-signed one for its domain, and one without an ARN gets one.
func (m *CertificateManager) Seed(raw []byte) error {
	var in struct {
		Policy
		Certificates map[string]*ACMCertificate `json:"certificates"`
		Removed      []string                   `json:"removedCertificates"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.merge(in.Policy)
	for _, arn := range in.Removed {
		delete(m.Certificates, arn)
	}
	for _, c := range in.Certificates {
		if c.Certificate == "" {
			self, err := newIssuer(c.DomainName, nil, "RSA_2048")
			if err != nil {
				return err
			}
			c.Certificate, c.PrivateKey = self.Certificate, self.PrivateKey
		}
		parsed, err := parseCertificate(c.Certificate)
		if err != nil {
			return err
		}
		if c.ARN == "" {
			c.ARN = "arn:aws:acm:" + Region + ":000000000000:certificate/" + requestID()
		}
		if c.Type == "" {
			c.Type = "IMPORTED"
		}
		if c.Status == "" {
			c.Status = "ISSUED"
		}
		describeParsed(c, parsed)
		m.Certificates[c.ARN] = c
	}
	return nil
}

func describeParsed(c *ACMCertificate, parsed *x509.Certificate) {
	c.Serial = colonSerial(parsed.SerialNumber)
	c.NotBefore, c.NotAfter = parsed.NotBefore.UTC(), parsed.NotAfter.UTC()
	c.KeyAlgorithm = keyAlgorithmOf(parsed.PublicKey)
	if c.DomainName == "" {
		c.DomainName = parsed.Subject.CommonName
		if c.DomainName == "" && len(parsed.DNSNames) > 0 {
			c.DomainName = parsed.DNSNames[0]
		}
	}
	if len(c.SubjectAlternativeNames) == 0 {
		c.SubjectAlternativeNames = parsed.DNSNames
	}
}

func acmNotFound(arn string) *apiError {
	return errf(http.StatusBadRequest, "ResourceNotFoundException", "Certificate with arn %s not found", arn)
}

func (m *CertificateManager) find(arn string) (*ACMCertificate, *apiError) {
	if arn == "" {
		return nil, errf(http.StatusBadRequest, "ValidationException", "1 validation error detected: Value null at 'certificateArn' failed to satisfy constraint: Member must not be null")
	}
	c, ok := m.Certificates[arn]
	if !ok {
		return nil, acmNotFound(arn)
	}
	return c, nil
}

func (m *CertificateManager) importCertificate(c call) (any, *apiError) {
	var in struct {
		CertificateArn   string
		Certificate      []byte
		PrivateKey       []byte
		CertificateChain []byte
		Tags             []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	parsed, err := parseCertificate(string(in.Certificate))
	if err != nil {
		return nil, errf(http.StatusBadRequest, "ValidationException", "Could not validate the certificate with the certificate chain. %s", err)
	}
	key, err := parsePrivateKey(string(in.PrivateKey))
	if err != nil {
		return nil, errf(http.StatusBadRequest, "ValidationException", "The private key is not supported.")
	}
	if !samePublicKey(parsed.PublicKey, key.Public()) {
		return nil, errf(http.StatusBadRequest, "ValidationException", "The private key does not match the public key in the certificate.")
	}

	at := now()
	cert := &ACMCertificate{Type: "IMPORTED", Status: "ISSUED", Tags: map[string]string{}}
	reimport := in.CertificateArn != ""
	if reimport {
		existing, aErr := m.find(in.CertificateArn)
		if aErr != nil {
			return nil, aErr
		}
		if existing.Type != "IMPORTED" {
			return nil, errf(http.StatusBadRequest, "ValidationException", "Certificate %s is not an imported certificate and can't be reimported.", in.CertificateArn)
		}
		if len(in.Tags) > 0 {
			return nil, errf(http.StatusBadRequest, "ValidationException", "Tags can't be applied when reimporting a certificate.")
		}
		cert = existing
		cert.DomainName, cert.SubjectAlternativeNames = "", nil
	} else {
		cert.ARN = "arn:aws:acm:" + c.svc.region + ":" + c.account() + ":certificate/" + requestID()
		for _, t := range in.Tags {
			cert.Tags[t.Key] = t.Value
		}
	}
	keyPEM, kErr := encodeKey(key)
	if kErr != nil {
		return nil, errf(http.StatusBadRequest, "ValidationException", "The private key is not supported.")
	}
	cert.Certificate, cert.CertificateChain, cert.PrivateKey = string(in.Certificate), string(in.CertificateChain), keyPEM
	cert.ImportedAt = &at
	cert.Imports++
	describeParsed(cert, parsed)
	m.Certificates[cert.ARN] = cert
	m.events.Publish(CertificateImported{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}, reimport})
	return map[string]any{"CertificateArn": cert.ARN}, nil
}

// requestCertificate issues straight away, so a caller polling for ISSUED never waits.
// ExportCertificate still refuses until Route 53 serves every validation CNAME, so a
// caller that exports before writing the record fails as it would against ACM.
func (m *CertificateManager) requestCertificate(c call) (any, *apiError) {
	var in struct {
		DomainName              string
		SubjectAlternativeNames []string
		KeyAlgorithm            string
		ValidationMethod        string
		IdempotencyToken        string
		Options                 struct{ Export string }
		Tags                    []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if in.DomainName == "" {
		return nil, errf(http.StatusBadRequest, "ValidationException", "1 validation error detected: Value null at 'domainName' failed to satisfy constraint: Member must not be null")
	}
	if in.ValidationMethod != "" && in.ValidationMethod != "DNS" {
		return nil, errf(http.StatusBadRequest, "InvalidParameterException", "Only DNS validation is served")
	}
	if in.IdempotencyToken != "" {
		for _, existing := range m.Certificates {
			if existing.IdempotencyToken == in.IdempotencyToken && existing.Type == "AMAZON_ISSUED" {
				return map[string]any{"CertificateArn": existing.ARN}, nil
			}
		}
	}
	keyAlg := in.KeyAlgorithm
	if keyAlg == "" {
		keyAlg = "RSA_2048"
	}
	if !slices.Contains([]string{"RSA_2048", "EC_prime256v1", "EC_secp384r1"}, keyAlg) {
		return nil, errf(http.StatusBadRequest, "ValidationException", "Key algorithm %s is not supported for public certificates", keyAlg)
	}
	names := []string{in.DomainName}
	for _, n := range in.SubjectAlternativeNames {
		if !slices.Contains(names, n) {
			names = append(names, n)
		}
	}

	ca, chain, err := amazonIssuer()
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	key, err := newKey(keyAlg)
	if err != nil {
		return nil, errf(http.StatusBadRequest, "ValidationException", "%v", err)
	}
	leaf, leafPEM, err := ca.sign(key.Public(), pkix.Name{CommonName: in.DomainName}, names, AmazonIssuedValidityDays)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	keyPEM, err := encodeKey(key)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}

	cert := &ACMCertificate{
		ARN:              "arn:aws:acm:" + c.svc.region + ":" + c.account() + ":certificate/" + requestID(),
		Type:             "AMAZON_ISSUED",
		Status:           "ISSUED",
		Certificate:      leafPEM,
		CertificateChain: chain,
		PrivateKey:       keyPEM,
		Exportable:       in.Options.Export == "ENABLED",
		IdempotencyToken: in.IdempotencyToken,
		Tags:             map[string]string{},
	}
	for _, t := range in.Tags {
		cert.Tags[t.Key] = t.Value
	}
	for _, n := range names {
		token := strings.ReplaceAll(requestID(), "-", "")
		cert.Validation = append(cert.Validation, ValidationRecord{
			DomainName: n,
			Name:       "_" + token[:32] + "." + strings.TrimPrefix(n, "*.") + ".",
			Type:       "CNAME",
			Value:      "_" + token[:16] + token[16:32] + ".acm-validations.aws.",
		})
	}
	describeParsed(cert, leaf)
	m.Certificates[cert.ARN] = cert
	m.events.Publish(CertificateRequested{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}})
	m.events.Publish(CertificateIssued{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}})
	return map[string]any{"CertificateArn": cert.ARN}, nil
}

// keyAlgorithmName is how ACM reports a key algorithm in its output, which spells it
// with a hyphen where the input enum has an underscore.
func keyAlgorithmName(alg string) string {
	if rest, ok := strings.CutPrefix(alg, "RSA_"); ok {
		return "RSA-" + rest
	}
	switch alg {
	case "EC_prime256v1":
		return "EC-prime256v1"
	case "EC_secp384r1":
		return "EC-secp384r1"
	case "EC_secp521r1":
		return "EC-secp521r1"
	}
	return alg
}

func (m *CertificateManager) describeCertificate(c call) (any, *apiError) {
	var in struct{ CertificateArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	out := map[string]any{
		"CertificateArn":          cert.ARN,
		"DomainName":              cert.DomainName,
		"SubjectAlternativeNames": cert.SubjectAlternativeNames,
		"Status":                  cert.Status,
		"Type":                    cert.Type,
		"Serial":                  cert.Serial,
		"KeyAlgorithm":            keyAlgorithmName(cert.KeyAlgorithm),
		"NotBefore":               epoch(cert.NotBefore),
		"NotAfter":                epoch(cert.NotAfter),
		"InUseBy":                 []string{},
	}
	if cert.ImportedAt != nil {
		out["ImportedAt"] = epoch(*cert.ImportedAt)
	}
	if cert.RenewedAt != nil {
		out["RenewalSummary"] = map[string]any{"RenewalStatus": "SUCCESS", "UpdatedAt": epoch(*cert.RenewedAt)}
	}
	if cert.RevokedAt != nil {
		out["RevokedAt"] = epoch(*cert.RevokedAt)
		out["RevocationReason"] = cert.RevocationReason
	}
	if cert.Type == "AMAZON_ISSUED" {
		out["Options"] = map[string]string{"Export": map[bool]string{true: "ENABLED", false: "DISABLED"}[cert.Exportable]}
		dvos := make([]map[string]any, 0, len(cert.Validation))
		for _, v := range cert.Validation {
			dvos = append(dvos, map[string]any{
				"DomainName":       v.DomainName,
				"ValidationDomain": v.DomainName,
				"ValidationMethod": "DNS",
				"ValidationStatus": "SUCCESS",
				"ResourceRecord":   map[string]string{"Name": v.Name, "Type": v.Type, "Value": v.Value},
			})
		}
		out["DomainValidationOptions"] = dvos
	}
	return map[string]any{"Certificate": out}, nil
}

func (m *CertificateManager) getCertificate(c call) (any, *apiError) {
	var in struct{ CertificateArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	if cert.Status != "ISSUED" {
		return nil, errf(http.StatusBadRequest, "RequestInProgressException", "Certificate %s is still in process", cert.ARN)
	}
	out := map[string]any{"Certificate": cert.Certificate}
	if cert.CertificateChain != "" {
		out["CertificateChain"] = cert.CertificateChain
	}
	return out, nil
}

func (m *CertificateManager) exportCertificate(c call) (any, *apiError) {
	var in struct {
		CertificateArn string
		Passphrase     []byte
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	if cert.Type == "IMPORTED" || (cert.Type == "AMAZON_ISSUED" && !cert.Exportable) {
		return nil, errf(http.StatusBadRequest, "ValidationException", "Certificate ARN: %s is not a private certificate", cert.ARN)
	}
	for _, v := range cert.Validation {
		if !cnameServed(v.Name, v.Value) {
			return nil, errf(http.StatusBadRequest, "RequestInProgressException", "Certificate %s is still in process", cert.ARN)
		}
	}
	if len(in.Passphrase) < 4 || len(in.Passphrase) > 128 {
		return nil, errf(http.StatusBadRequest, "ValidationException", "1 validation error detected: Value at 'passphrase' failed to satisfy constraint: Member must have length between 4 and 128")
	}
	encrypted, err := encryptPrivateKey(cert.PrivateKey, in.Passphrase)
	if err != nil {
		return nil, errf(http.StatusInternalServerError, "InternalFailure", "%v", err)
	}
	m.events.Publish(CertificateExported{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}})
	return map[string]any{"Certificate": cert.Certificate, "CertificateChain": cert.CertificateChain, "PrivateKey": encrypted}, nil
}

func (m *CertificateManager) listCertificates(c call) (any, *apiError) {
	var in struct {
		CertificateStatuses []string
		Includes            struct{ KeyTypes []string }
		MaxItems            int
		NextToken           string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	keyTypes := in.Includes.KeyTypes
	if len(keyTypes) == 0 {
		keyTypes = []string{"RSA_1024", "RSA_2048"}
	}
	limit := in.MaxItems
	if limit <= 0 || limit > acmMaxList {
		limit = acmMaxList
	}
	arns := make([]string, 0, len(m.Certificates))
	for arn, cert := range m.Certificates {
		if len(in.CertificateStatuses) > 0 && !slices.Contains(in.CertificateStatuses, cert.Status) {
			continue
		}
		if !slices.Contains(keyTypes, cert.KeyAlgorithm) {
			continue
		}
		arns = append(arns, arn)
	}
	sort.Strings(arns)
	start := 0
	if in.NextToken != "" {
		n, err := strconv.Atoi(in.NextToken)
		if err != nil || n < 0 || n > len(arns) {
			return nil, errf(http.StatusBadRequest, "InvalidArgsException", "The nextToken is invalid.")
		}
		start = n
	}
	end := min(start+limit, len(arns))
	summaries := make([]map[string]any, 0, end-start)
	for _, arn := range arns[start:end] {
		cert := m.Certificates[arn]
		summaries = append(summaries, map[string]any{
			"CertificateArn": cert.ARN,
			"DomainName":     cert.DomainName,
			"Status":         cert.Status,
			"Type":           cert.Type,
			"KeyAlgorithm":   keyAlgorithmName(cert.KeyAlgorithm),
		})
	}
	out := map[string]any{"CertificateSummaryList": summaries}
	if end < len(arns) {
		out["NextToken"] = strconv.Itoa(end)
	}
	return out, nil
}

func (m *CertificateManager) deleteCertificate(c call) (any, *apiError) {
	var in struct{ CertificateArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	delete(m.Certificates, cert.ARN)
	m.events.Publish(CertificateDeleted{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}, time.Now()})
	return nil, nil
}

func (m *CertificateManager) addTags(c call) (any, *apiError) {
	var in struct {
		CertificateArn string
		Tags           []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	if cert.Tags == nil {
		cert.Tags = map[string]string{}
	}
	for _, t := range in.Tags {
		cert.Tags[t.Key] = t.Value
	}
	m.events.Publish(CertificateTagged{ACMCertificateDetail{ARN: cert.ARN, DomainName: cert.DomainName}})
	return nil, nil
}

func (m *CertificateManager) listTags(c call) (any, *apiError) {
	var in struct{ CertificateArn string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	cert, aErr := m.find(in.CertificateArn)
	if aErr != nil {
		return nil, aErr
	}
	return map[string]any{"Tags": tagList(cert.Tags)}, nil
}
