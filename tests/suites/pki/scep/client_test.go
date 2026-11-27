package scep_test

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/smallstep/pkcs7"
	"github.com/smallstep/scep"
	"github.com/smallstep/scep/x509util"
	"github.com/stretchr/testify/require"
)

// scepProfile is a profile with SCEP enrollment on, issuing from an internal CA under a
// policy that allows anything. Its enrollment belongs to an application, or to the
// profile itself when app is unset.
type scepProfile struct {
	api     *api.ClientWithResponses
	project *pki.Project
	app     pki.Application
	profile pki.Profile
	// ca is the certificate of the CA the profile issues from.
	ca *x509.Certificate
}

// staticChallenge is the enrollment sscep was run against: a static challenge
// password, the CA certificate in GetCACert, and certificate-based renewal allowed.
func staticChallenge(password string) api.SetPkiApplicationScepEnrollmentJSONRequestBody {
	return api.SetPkiApplicationScepEnrollmentJSONRequestBody{
		ChallengeType:           new(api.SetPkiApplicationScepEnrollmentJSONBodyChallengeTypeStatic),
		ChallengePassword:       new(password),
		IncludeCaCertInResponse: new(true),
		AllowCertBasedRenewal:   new(true),
	}
}

// dynamicChallenge is an enrollment that takes one-time challenge passwords, at most
// maxPending of them unused at once.
func dynamicChallenge(maxPending int) api.SetPkiApplicationScepEnrollmentJSONRequestBody {
	return api.SetPkiApplicationScepEnrollmentJSONRequestBody{
		ChallengeType:              new(api.SetPkiApplicationScepEnrollmentJSONBodyChallengeTypeDynamic),
		DynamicChallengeMaxPending: new(maxPending),
		IncludeCaCertInResponse:    new(true),
		AllowCertBasedRenewal:      new(true),
	}
}

// withoutRenewal refuses a renewal signed by a previously issued certificate.
func withoutRenewal(enrollment api.SetPkiApplicationScepEnrollmentJSONRequestBody) api.SetPkiApplicationScepEnrollmentJSONRequestBody {
	enrollment.AllowCertBasedRenewal = new(false)
	return enrollment
}

func newScepProfile(t *testing.T, tn *harness.Tenant, enrollment api.SetPkiApplicationScepEnrollmentJSONRequestBody) scepProfile {
	t.Helper()
	proj := pki.CertManager(t, tn)
	ca := pki.NewInternalCA(t, proj)
	profile := pki.NewProfile(t, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)))
	app := pki.NewApplication(t, proj, profile)
	pki.EnableSCEP(t, app, profile, enrollment)
	return scepProfile{api: tn.Anonymous(t), project: proj, app: app, profile: profile, ca: pki.CACertificate(t, tn.Admin, ca.ID)}
}

// newStandaloneScepProfile is a profile with SCEP enrollment of its own, outside any
// application, that takes one-time challenge passwords valid for expiryMinutes, at most
// one of them unused at once.
func newStandaloneScepProfile(t *testing.T, tn *harness.Tenant, expiryMinutes int) scepProfile {
	t.Helper()
	proj := pki.CertManager(t, tn)
	ca := pki.NewInternalCA(t, proj)
	policy := pki.NewPolicy(t, proj, pki.AllowAll(t))
	var body api.CreateCertificateProfileJSONRequestBody
	require.NoError(t, json.Unmarshal(fmt.Appendf(nil, `{
		"projectId": %q, "slug": "profile-%s", "caId": %q, "certificatePolicyId": %q,
		"enrollmentType": "scep",
		"scepConfig": {"challengeType": "dynamic", "dynamicChallengeMaxPending": 1, "dynamicChallengeExpiryMinutes": %d, "includeCaCertInResponse": true, "allowCertBasedRenewal": true}
	}`, proj.ID, id.Short(), ca.ID, policy.ID, expiryMinutes), &body))
	res, err := tn.Admin.API.CreateCertificateProfileWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the SCEP profile returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	profile := pki.Profile{ID: res.JSON200.CertificateProfile.Id, Slug: res.JSON200.CertificateProfile.Slug}
	return scepProfile{api: tn.Anonymous(t), project: proj, profile: profile, ca: pki.CACertificate(t, tn.Admin, ca.ID)}
}

// operation sends a SCEP GET, which is how a client without POSTPKIOperation, or
// any client for GetCACaps and GetCACert, talks to the server.
func (p scepProfile) operation(t *testing.T, op string, message []byte) *api.GetScepApplicationOperationResponse {
	t.Helper()
	var encoded *string
	if message != nil {
		encoded = new(base64.StdEncoding.EncodeToString(message))
	}
	if p.app.ID == uuid.Nil {
		res, err := p.api.GetScepOperationWithResponse(t.Context(), p.profile.ID, &api.GetScepOperationParams{Operation: op, Message: encoded})
		require.NoError(t, err)
		return &api.GetScepApplicationOperationResponse{Body: res.Body, HTTPResponse: res.HTTPResponse}
	}
	res, err := p.api.GetScepApplicationOperationWithResponse(t.Context(), p.app.ID, p.profile.ID,
		&api.GetScepApplicationOperationParams{Operation: op, Message: encoded})
	require.NoError(t, err)
	return res
}

// caCerts is GetCACert's bundle: the RA first, then the CA chain when included.
func (p scepProfile) caCerts(t *testing.T) []*x509.Certificate {
	t.Helper()
	res := p.operation(t, "GetCACert", nil)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "GetCACert returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	certs, err := scep.CACerts(res.Body)
	require.NoError(t, err)
	require.NotEmpty(t, certs)
	return certs
}

// device is a client enrolling with SCEP: its key, and the certificate it signs its
// requests with.
type device struct {
	key  *rsa.PrivateKey
	cert *x509.Certificate
}

// newDevice is a device that has never enrolled, so it signs with a self-signed
// certificate as a SCEP client does.
func newDevice(t *testing.T, commonName string) device {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return device{key: key, cert: cert}
}

// enrollment is the outcome of a PKCSReq: the CertRep's status, and the issued
// certificate when it succeeded.
type enrollment struct {
	status   scep.PKIStatus
	failInfo scep.FailInfo
	cert     *x509.Certificate
}

// request is a PKCSReq: the message, the RA it is encrypted to, and the key its CSR
// was made on.
type request struct {
	msg *scep.PKIMessage
	ra  *x509.Certificate
	key *rsa.PrivateKey
}

// pkcsReq builds a PKCSReq for a CSR naming commonName on a fresh key, signed by
// signer, with password as the CSR's challengePassword (none when empty).
func (p scepProfile) pkcsReq(t *testing.T, signer device, commonName, password string) request {
	t.Helper()
	return p.csrRequest(t, scep.PKCSReq, signer, commonName, password)
}

// csrRequest builds a message of msgType carrying a CSR naming commonName on a fresh
// key, signed by signer, with password as the CSR's challengePassword (none when empty).
func (p scepProfile) csrRequest(t *testing.T, msgType scep.MessageType, signer device, commonName, password string) request {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der, err := x509util.CreateCertificateRequest(rand.Reader, &x509util.CertificateRequest{
		CertificateRequest: x509.CertificateRequest{Subject: pkix.Name{CommonName: commonName}},
		ChallengePassword:  password,
	}, key)
	require.NoError(t, err)
	csr, err := x509.ParseCertificateRequest(der)
	require.NoError(t, err)
	ra := p.caCerts(t)[0]
	return request{msg: message(t, msgType, ra, signer, csr), ra: ra, key: key}
}

// message wraps a CSR in a message of msgType encrypted to the RA, signed by signer. Its
// transaction ID is derived from the CSR's key, so the same CSR names the same
// transaction.
func message(t *testing.T, msgType scep.MessageType, ra *x509.Certificate, signer device, csr *x509.CertificateRequest) *scep.PKIMessage {
	t.Helper()
	msg, err := scep.NewCSRRequest(csr, &scep.PKIMessage{
		MessageType: msgType,
		Recipients:  []*x509.Certificate{ra},
		SignerKey:   signer.key,
		SignerCert:  signer.cert,
	})
	require.NoError(t, err)
	return msg
}

// poll asks with GetCertInitial (CertPoll) for the outcome of an earlier request the
// signer sent, and reads the CertRep it gets back.
func (p scepProfile) poll(t *testing.T, earlier request, signer device) enrollment {
	t.Helper()
	req := request{msg: p.certPoll(t, earlier, signer), ra: earlier.ra, key: earlier.key}
	return readCertRep(t, p.post(t, req.msg.Raw), req, signer)
}

// certPoll is a CertPoll for an earlier request: an IssuerAndSubject naming the CA and
// the requested subject, encrypted to the RA and sent under the earlier transaction ID
// (RFC 8894, section 3.3.3).
func (p scepProfile) certPoll(t *testing.T, earlier request, signer device) *scep.PKIMessage {
	t.Helper()
	payload, err := asn1.Marshal(struct {
		Issuer  asn1.RawValue
		Subject asn1.RawValue
	}{asn1.RawValue{FullBytes: p.ca.RawSubject}, asn1.RawValue{FullBytes: earlier.msg.CSR.RawSubject}})
	require.NoError(t, err)
	enveloped, err := pkcs7.Encrypt(payload, []*x509.Certificate{earlier.ra})
	require.NoError(t, err)
	signed, err := pkcs7.NewSignedData(enveloped)
	require.NoError(t, err)
	nonce := make([]byte, 16)
	_, err = rand.Read(nonce)
	require.NoError(t, err)
	require.NoError(t, signed.AddSigner(signer.cert, signer.key, pkcs7.SignerInfoConfig{
		ExtraSignedAttributes: []pkcs7.Attribute{
			{Type: oidTransactionID, Value: earlier.msg.TransactionID},
			{Type: oidMessageType, Value: scep.CertPoll},
			{Type: oidSenderNonce, Value: nonce},
		},
	}))
	raw, err := signed.Finish()
	require.NoError(t, err)
	return &scep.PKIMessage{Raw: raw, MessageType: scep.CertPoll, TransactionID: earlier.msg.TransactionID}
}

// post sends a PKIOperation as a POST body, which is how sscep and any client that
// sees POSTPKIOperation in GetCACaps sends one.
func (p scepProfile) post(t *testing.T, message []byte) []byte {
	t.Helper()
	if p.app.ID == uuid.Nil {
		res, err := p.api.PostScepOperationWithBodyWithResponse(t.Context(), p.profile.ID,
			&api.PostScepOperationParams{Operation: new("PKIOperation")}, "application/x-pki-message", bytes.NewReader(message))
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "PKIOperation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		return res.Body
	}
	res, err := p.api.PostScepApplicationOperationWithBodyWithResponse(t.Context(), p.app.ID, p.profile.ID,
		&api.PostScepApplicationOperationParams{Operation: new("PKIOperation")}, "application/x-pki-message", bytes.NewReader(message))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "PKIOperation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.Body
}

// enroll sends a PKCSReq over POST and reads the CertRep it gets back.
func (p scepProfile) enroll(t *testing.T, signer device, commonName, password string) (enrollment, *rsa.PrivateKey) {
	t.Helper()
	req := p.pkcsReq(t, signer, commonName, password)
	return readCertRep(t, p.post(t, req.msg.Raw), req, signer), req.key
}

// readCertRep checks a CertRep is signed by the RA over the content it carries, and
// reads its outcome, decrypting the issued certificate for the signer.
//
// The signature is checked over the signed attributes as sent, the way sscep checks
// it, rather than over their DER re-encoding: Infisical does not sort them, which
// TestScepCertRep_KnownIssues pins.
func readCertRep(t *testing.T, raw []byte, req request, signer device) enrollment {
	t.Helper()
	require.NoError(t, verifyAsSent(raw, req.ra), "the CertRep is not signed by the RA")
	p7, err := pkcs7.Parse(raw)
	require.NoError(t, err)
	var signedDigest []byte
	require.NoError(t, p7.UnmarshalSignedAttribute(oidMessageDigest, &signedDigest))
	contentDigest := sha256.Sum256(p7.Content)
	require.Equal(t, contentDigest[:], signedDigest, "the signed messageDigest does not match the CertRep content")

	var transactionID scep.TransactionID
	require.NoError(t, p7.UnmarshalSignedAttribute(oidTransactionID, &transactionID))
	require.Equal(t, req.msg.TransactionID, transactionID, "the CertRep answers another transaction")

	var msgType scep.MessageType
	require.NoError(t, p7.UnmarshalSignedAttribute(oidMessageType, &msgType))
	require.Equal(t, scep.CertRep, msgType)

	var out enrollment
	require.NoError(t, p7.UnmarshalSignedAttribute(oidPKIStatus, &out.status))
	if out.status == scep.FAILURE {
		require.NoError(t, p7.UnmarshalSignedAttribute(oidFailInfo, &out.failInfo))
	}
	if out.status != scep.SUCCESS {
		require.Empty(t, p7.Content, "a %s CertRep carries content", out.status)
		return out
	}

	envelope, err := pkcs7.Parse(p7.Content)
	require.NoError(t, err)
	degenerate, err := envelope.Decrypt(signer.cert, signer.key)
	require.NoError(t, err)
	certs, err := scep.CACerts(degenerate)
	require.NoError(t, err)
	require.NotEmpty(t, certs, "the CertRep carries no certificate")
	out.cert = certs[0]
	return out
}

var (
	oidMessageDigest = asn1.ObjectIdentifier{1, 2, 840, 113549, 1, 9, 4}
	oidTransactionID = asn1.ObjectIdentifier{2, 16, 840, 1, 113733, 1, 9, 7}
	oidMessageType   = asn1.ObjectIdentifier{2, 16, 840, 1, 113733, 1, 9, 2}
	oidPKIStatus     = asn1.ObjectIdentifier{2, 16, 840, 1, 113733, 1, 9, 3}
	oidFailInfo      = asn1.ObjectIdentifier{2, 16, 840, 1, 113733, 1, 9, 4}
	oidSenderNonce   = asn1.ObjectIdentifier{2, 16, 840, 1, 113733, 1, 9, 5}
)

// verifyAsSent checks the first signer's RSA signature over its signed attributes
// exactly as encoded in the message.
func verifyAsSent(raw []byte, signer *x509.Certificate) error {
	var ci struct {
		ContentType asn1.ObjectIdentifier
		Content     asn1.RawValue `asn1:"explicit,tag:0"`
	}
	if _, err := asn1.Unmarshal(raw, &ci); err != nil {
		return err
	}
	var sd struct {
		Version          int
		DigestAlgorithms asn1.RawValue
		ContentInfo      asn1.RawValue
		Certificates     asn1.RawValue `asn1:"optional,tag:0"`
		CRLs             asn1.RawValue `asn1:"optional,tag:1"`
		SignerInfos      []struct {
			Version            int
			SID                asn1.RawValue
			DigestAlgorithm    asn1.RawValue
			SignedAttrs        asn1.RawValue `asn1:"optional,tag:0"`
			SignatureAlgorithm asn1.RawValue
			Signature          []byte
		} `asn1:"set"`
	}
	if _, err := asn1.Unmarshal(ci.Content.Bytes, &sd); err != nil {
		return err
	}
	if len(sd.SignerInfos) == 0 {
		return errors.New("no signer")
	}
	si := sd.SignerInfos[0]
	signed := append([]byte{}, si.SignedAttrs.FullBytes...)
	signed[0] = 0x31
	pub, ok := signer.PublicKey.(*rsa.PublicKey)
	if !ok {
		return errors.New("the RA key is not RSA")
	}
	digest := sha256.Sum256(signed)
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], si.Signature)
}

// mustEnroll enrolls and fails unless a certificate was issued.
func (p scepProfile) mustEnroll(t *testing.T, commonName, password string) device {
	t.Helper()
	got, key := p.enroll(t, newDevice(t, commonName), commonName, password)
	require.Equalf(t, scep.SUCCESS, got.status, "enrollment failed: %s", got.failInfo)
	return device{key: key, cert: got.cert}
}

// challenge asks for a one-time challenge password as `as`.
func (p scepProfile) challenge(t *testing.T, as *harness.Principal) *api.GenerateScepApplicationDynamicChallengeResponse {
	t.Helper()
	res, err := as.API.GenerateScepApplicationDynamicChallengeWithResponse(t.Context(), p.app.ID, p.profile.ID)
	require.NoError(t, err)
	return res
}

// mustChallenge is a one-time challenge password the principal was given.
func (p scepProfile) mustChallenge(t *testing.T, as *harness.Principal) string {
	t.Helper()
	res := p.challenge(t, as)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "generating a challenge: %s", apierr.Body(res.Body))
	require.NotEmpty(t, res.Body)
	return string(res.Body)
}

// certificates maps the serial of each certificate the profile issued to its ID, as the
// tenant admin finds them through the profile's certificate requests.
// ListCertificateProfileCertificates would be the direct read, but it fails
// (TestCertificateProfile_KnownIssues).
func (p scepProfile) certificates(t *testing.T) map[string]uuid.UUID {
	t.Helper()
	out := map[string]uuid.UUID{}
	for _, r := range pki.ProfileRequests(t, p.project, p.profile).JSON200.CertificateRequests {
		if r.Certificate != nil {
			out[r.Certificate.SerialNumber] = uuid.MustParse(r.Certificate.Id)
		}
	}
	return out
}

// serial is a certificate's serial number as Infisical lists it.
func serial(cert *x509.Certificate) string {
	return hex.EncodeToString(cert.SerialNumber.Bytes())
}
