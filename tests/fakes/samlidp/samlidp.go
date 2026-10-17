// Package samlidp is a SAML identity provider that runs inside the test process.
//
// Infisical never calls the IdP: the browser carries the AuthnRequest out and the
// SAMLResponse back, and in a test the test is the browser. So this fake is not a
// fakenet service. It holds a key pair, reads the request Infisical redirected to it,
// and mints the response, with knobs to break exactly one property of it.
package samlidp

import (
	"bytes"
	"compress/flate"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"io"
	"math/big"
	"net/url"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"
)

const (
	nsProtocol  = "urn:oasis:names:tc:SAML:2.0:protocol"
	nsAssertion = "urn:oasis:names:tc:SAML:2.0:assertion"
	nsXSI       = "http://www.w3.org/2001/XMLSchema-instance"
	nsXS        = "http://www.w3.org/2001/XMLSchema"

	StatusSuccess   = "urn:oasis:names:tc:SAML:2.0:status:Success"
	StatusResponder = "urn:oasis:names:tc:SAML:2.0:status:Responder"

	// EntraEmailClaim is the attribute name Entra ID sends the mailbox under.
	EntraEmailClaim = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/email"
)

// Signing says which elements of a response carry a signature. The zero value signs
// both, which is what every provider accepts.
type Signing int

const (
	SignBoth Signing = iota
	SignAssertionOnly
	SignResponseOnly
	SignNone
)

// IdP is one identity provider: an entity id, an SSO URL and a signing key.
type IdP struct {
	EntityID   string
	EntryPoint string

	key  *rsa.PrivateKey
	cert []byte
}

func New(t *testing.T) *IdP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("samlidp: generating key: %v", err)
	}
	host := "idp-" + id.Short() + ".test"
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: host},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
	}
	cert, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("samlidp: creating certificate: %v", err)
	}
	return &IdP{
		EntityID:   "https://" + host + "/metadata",
		EntryPoint: "https://" + host + "/sso",
		key:        key,
		cert:       cert,
	}
}

// CertPEM is the signing certificate, in the form the SAML config takes.
func (i *IdP) CertPEM() string {
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: i.cert}))
}

func (i *IdP) GetKeyPair() (*rsa.PrivateKey, []byte, error) { return i.key, i.cert, nil }

// Request is what Infisical asked for when it redirected the browser here.
type Request struct {
	ID         string
	Issuer     string
	ACSURL     string
	RelayState string
}

// ParseRedirect reads the AuthnRequest out of an HTTP-Redirect binding Location.
func (i *IdP) ParseRedirect(t *testing.T, location string) Request {
	t.Helper()
	u, err := url.Parse(location)
	if err != nil {
		t.Fatalf("samlidp: parsing redirect %q: %v", location, err)
	}
	deflated, err := base64.StdEncoding.DecodeString(u.Query().Get("SAMLRequest"))
	if err != nil {
		t.Fatalf("samlidp: SAMLRequest is not base64: %v", err)
	}
	raw, err := io.ReadAll(flate.NewReader(bytes.NewReader(deflated)))
	if err != nil {
		t.Fatalf("samlidp: SAMLRequest does not inflate: %v", err)
	}
	doc := etree.NewDocument()
	if err := doc.ReadFromBytes(raw); err != nil {
		t.Fatalf("samlidp: SAMLRequest is not XML: %v", err)
	}
	root := doc.Root()
	req := Request{
		ID:         root.SelectAttrValue("ID", ""),
		ACSURL:     root.SelectAttrValue("AssertionConsumerServiceURL", ""),
		RelayState: u.Query().Get("RelayState"),
	}
	if issuer := root.FindElement("./Issuer"); issuer != nil {
		req.Issuer = issuer.Text()
	}
	return req
}

// Response is one SAMLResponse. Fields left empty are omitted from the XML, so a test
// drops an attribute by not setting it.
type Response struct {
	Destination  string
	Audience     string
	InResponseTo string
	RelayState   string

	NameID     string // defaults to Email
	Email      string
	FirstName  string
	LastName   string
	Attributes map[string][]string

	NotBefore    time.Time // defaults to a minute ago
	NotOnOrAfter time.Time // defaults to five minutes from now

	Signing  Signing
	SignedBy *IdP   // defaults to this IdP; another one stands in for a key Infisical does not trust
	Status   string // defaults to StatusSuccess; any other status carries no assertion

	// AlterSigned rewrites the XML after it is signed, to prove a signature covers it.
	AlterSigned func(xml string) string
}

// Respond builds and signs a response, returning the form the browser would post.
func (i *IdP) Respond(t *testing.T, r Response) url.Values {
	t.Helper()
	now := time.Now().UTC()
	if r.NotBefore.IsZero() {
		r.NotBefore = now.Add(-time.Minute)
	}
	if r.NotOnOrAfter.IsZero() {
		r.NotOnOrAfter = now.Add(5 * time.Minute)
	}
	if r.NameID == "" {
		r.NameID = r.Email
	}
	if r.Status == "" {
		r.Status = StatusSuccess
	}
	signer := i
	if r.SignedBy != nil {
		signer = r.SignedBy
	}

	response := etree.NewElement("samlp:Response")
	response.CreateAttr("xmlns:samlp", nsProtocol)
	response.CreateAttr("xmlns:saml", nsAssertion)
	response.CreateAttr("ID", "_"+id.Nonce())
	response.CreateAttr("Version", "2.0")
	response.CreateAttr("IssueInstant", instant(now))
	response.CreateAttr("Destination", r.Destination)
	if r.InResponseTo != "" {
		response.CreateAttr("InResponseTo", r.InResponseTo)
	}
	response.CreateElement("saml:Issuer").SetText(i.EntityID)
	response.CreateElement("samlp:Status").CreateElement("samlp:StatusCode").CreateAttr("Value", r.Status)

	if r.Status == StatusSuccess {
		assertion := i.assertion(r, now)
		if r.Signing == SignBoth || r.Signing == SignAssertionOnly {
			assertion = sign(t, signer, assertion)
		}
		response.AddChild(assertion)
	}
	if r.Signing == SignBoth || r.Signing == SignResponseOnly {
		response = sign(t, signer, response)
	}

	doc := etree.NewDocument()
	doc.SetRoot(response)
	xml, err := doc.WriteToString()
	if err != nil {
		t.Fatalf("samlidp: serialising response: %v", err)
	}
	if r.AlterSigned != nil {
		xml = r.AlterSigned(xml)
	}

	form := url.Values{"SAMLResponse": {base64.StdEncoding.EncodeToString([]byte(xml))}}
	if r.RelayState != "" {
		form.Set("RelayState", r.RelayState)
	}
	return form
}

func (i *IdP) assertion(r Response, now time.Time) *etree.Element {
	// Namespaces are declared on the assertion itself so it canonicalises the same
	// signed on its own as it does inside the response.
	a := etree.NewElement("saml:Assertion")
	a.CreateAttr("xmlns:saml", nsAssertion)
	a.CreateAttr("xmlns:xsi", nsXSI)
	a.CreateAttr("xmlns:xs", nsXS)
	a.CreateAttr("ID", "_"+id.Nonce())
	a.CreateAttr("Version", "2.0")
	a.CreateAttr("IssueInstant", instant(now))
	a.CreateElement("saml:Issuer").SetText(i.EntityID)

	subject := a.CreateElement("saml:Subject")
	nameID := subject.CreateElement("saml:NameID")
	nameID.CreateAttr("Format", "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress")
	nameID.SetText(r.NameID)
	confirmation := subject.CreateElement("saml:SubjectConfirmation")
	confirmation.CreateAttr("Method", "urn:oasis:names:tc:SAML:2.0:cm:bearer")
	data := confirmation.CreateElement("saml:SubjectConfirmationData")
	data.CreateAttr("NotOnOrAfter", instant(r.NotOnOrAfter))
	data.CreateAttr("Recipient", r.Destination)
	if r.InResponseTo != "" {
		data.CreateAttr("InResponseTo", r.InResponseTo)
	}

	conditions := a.CreateElement("saml:Conditions")
	conditions.CreateAttr("NotBefore", instant(r.NotBefore))
	conditions.CreateAttr("NotOnOrAfter", instant(r.NotOnOrAfter))
	conditions.CreateElement("saml:AudienceRestriction").CreateElement("saml:Audience").SetText(r.Audience)

	authn := a.CreateElement("saml:AuthnStatement")
	authn.CreateAttr("AuthnInstant", instant(now))
	authn.CreateAttr("SessionIndex", "_"+id.Short())
	authn.CreateElement("saml:AuthnContext").CreateElement("saml:AuthnContextClassRef").
		SetText("urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport")

	statement := a.CreateElement("saml:AttributeStatement")
	attribute := func(name string, values ...string) {
		el := statement.CreateElement("saml:Attribute")
		el.CreateAttr("Name", name)
		for _, v := range values {
			value := el.CreateElement("saml:AttributeValue")
			value.CreateAttr("xsi:type", "xs:string")
			value.SetText(v)
		}
	}
	for name, value := range map[string]string{"email": r.Email, "firstName": r.FirstName, "lastName": r.LastName} {
		if value != "" {
			attribute(name, value)
		}
	}
	for name, values := range r.Attributes {
		attribute(name, values...)
	}
	return a
}

// sign returns el with an enveloped signature placed right after its Issuer, where
// the SAML schema puts it.
func sign(t *testing.T, signer *IdP, el *etree.Element) *etree.Element {
	t.Helper()
	ctx := dsig.NewDefaultSigningContext(signer)
	ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
	if err := ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod); err != nil {
		t.Fatalf("samlidp: %v", err)
	}
	signature, err := ctx.ConstructSignature(el, true)
	if err != nil {
		t.Fatalf("samlidp: signing %s: %v", el.Tag, err)
	}
	el.InsertChildAt(el.SelectElement("Issuer").Index()+1, signature)
	return el
}

func instant(at time.Time) string { return at.UTC().Format("2006-01-02T15:04:05Z") }
