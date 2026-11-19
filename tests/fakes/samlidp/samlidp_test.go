package samlidp

import (
	"bytes"
	"compress/flate"
	"crypto/x509"
	"encoding/base64"
	"net/url"
	"strings"
	"testing"

	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"
	"github.com/stretchr/testify/require"
)

func TestIdP_ParseRedirect(t *testing.T) {
	t.Parallel()

	t.Run("should read the request id, issuer and ACS URL when given a redirect", func(t *testing.T) {
		t.Parallel()

		// Setup
		idp := New(t)
		location := redirectTo(t, idp.EntryPoint, `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_req1" AssertionConsumerServiceURL="http://app:4000/api/v1/sso/saml2/cfg"><saml:Issuer>sp-entity</saml:Issuer></samlp:AuthnRequest>`, `{"spInitiated":true}`)

		// Action
		req := idp.ParseRedirect(t, location)

		// Assert
		require.Equal(t, Request{ID: "_req1", Issuer: "sp-entity", ACSURL: "http://app:4000/api/v1/sso/saml2/cfg", RelayState: `{"spInitiated":true}`}, req)
	})
}

func TestIdP_Respond(t *testing.T) {
	t.Parallel()

	base := Response{Destination: "http://app/acs", Audience: "http://app", Email: "alice@acme.test", FirstName: "Alice", LastName: "Doe"}

	t.Run("should sign the response and the assertion when signing both", func(t *testing.T) {
		t.Parallel()

		// Setup
		idp := New(t)

		// Action
		root := decode(t, idp.Respond(t, base))

		// Assert
		require.NoError(t, verify(idp, root))
		require.NoError(t, verify(idp, root.SelectElement("Assertion")))
		require.Equal(t, "Issuer", root.ChildElements()[0].Tag)
		require.Equal(t, "Signature", root.ChildElements()[1].Tag)
	})

	t.Run("should leave the response unsigned when signing only the assertion", func(t *testing.T) {
		t.Parallel()

		// Setup
		idp := New(t)
		r := base
		r.Signing = SignAssertionOnly

		// Action
		root := decode(t, idp.Respond(t, r))

		// Assert
		require.Nil(t, root.SelectElement("Signature"))
		require.NoError(t, verify(idp, root.SelectElement("Assertion")))
	})

	t.Run("should fail verification when the assertion is altered after signing", func(t *testing.T) {
		t.Parallel()

		// Setup
		idp := New(t)
		r := base
		r.AlterSigned = func(xml string) string { return strings.ReplaceAll(xml, "alice@acme.test", "mallory@acme.test") }

		// Action
		root := decode(t, idp.Respond(t, r))

		// Assert
		require.Error(t, verify(idp, root.SelectElement("Assertion")))
	})

	t.Run("should fail verification when another IdP signed it", func(t *testing.T) {
		t.Parallel()

		// Setup
		idp, other := New(t), New(t)
		r := base
		r.SignedBy = other

		// Action
		root := decode(t, idp.Respond(t, r))

		// Assert
		require.Error(t, verify(idp, root))
		require.NoError(t, verify(other, root))
	})

	t.Run("should carry no assertion when the status is not success", func(t *testing.T) {
		t.Parallel()

		// Setup
		idp := New(t)
		r := base
		r.Status = StatusResponder

		// Action
		root := decode(t, idp.Respond(t, r))

		// Assert
		require.Nil(t, root.SelectElement("Assertion"))
	})
}

func redirectTo(t *testing.T, entryPoint, request, relayState string) string {
	t.Helper()
	var buf bytes.Buffer
	w, err := flate.NewWriter(&buf, flate.DefaultCompression)
	require.NoError(t, err)
	_, err = w.Write([]byte(request))
	require.NoError(t, err)
	require.NoError(t, w.Close())
	return entryPoint + "?" + url.Values{
		"SAMLRequest": {base64.StdEncoding.EncodeToString(buf.Bytes())},
		"RelayState":  {relayState},
	}.Encode()
}

func decode(t *testing.T, form url.Values) *etree.Element {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(form.Get("SAMLResponse"))
	require.NoError(t, err)
	doc := etree.NewDocument()
	require.NoError(t, doc.ReadFromBytes(raw))
	return doc.Root()
}

func verify(idp *IdP, el *etree.Element) error {
	cert, err := x509.ParseCertificate(idp.cert)
	if err != nil {
		return err
	}
	_, err = dsig.NewDefaultValidationContext(&dsig.MemoryX509CertificateStore{Roots: []*x509.Certificate{cert}}).Validate(el.Copy())
	return err
}
