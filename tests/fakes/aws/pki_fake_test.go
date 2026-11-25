package aws_test

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/stretchr/testify/require"
	"github.com/youmark/pkcs8"
)

func (a *account) acm(t *testing.T, action string, in any) (int, map[string]any) {
	t.Helper()
	return a.json1(t, aws.ACM.Host(), "acm", "CertificateManager."+action, in)
}

func (a *account) pca(t *testing.T, action string, in any) (int, map[string]any) {
	t.Helper()
	return a.json1(t, aws.ACMPCA.Host(), "acm-pca", "ACMPrivateCA."+action, in)
}

func (a *account) elb(t *testing.T, form url.Values) (int, string) {
	t.Helper()
	form.Set("Version", "2015-12-01")
	return a.query(t, aws.ELB.Host(), "elasticloadbalancing", form)
}

func (a *account) route53(t *testing.T, method, path, body string) (int, string) {
	t.Helper()
	status, raw := a.sendAt(t, method, path, aws.Route53.Host(), "route53", "us-east-1",
		map[string]string{"Content-Type": "application/xml"}, []byte(body))
	return status, string(raw)
}

// selfSigned is a certificate and key from outside AWS, as Infisical imports them.
func selfSigned(t *testing.T, name string) (certPEM, keyPEM string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(time.Now().UnixNano()), Subject: pkix.Name{CommonName: name}, DNSNames: []string{name},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, key.Public(), key)
	require.NoError(t, err)
	kder, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})), string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: kder}))
}

func change(action, name, typ, value string) string {
	return `<?xml version="1.0" encoding="UTF-8"?><ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/"><ChangeBatch><Changes><Change><Action>` +
		action + `</Action><ResourceRecordSet><Name>` + name + `</Name><Type>` + typ + `</Type><TTL>30</TTL><ResourceRecords><ResourceRecord><Value>` +
		value + `</Value></ResourceRecord></ResourceRecords></ResourceRecordSet></Change></Changes></ChangeBatch></ChangeResourceRecordSetsRequest>`
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func TestAWSFake_CertificateManager(t *testing.T) {
	r := newRig(t)

	t.Run("should keep the ARN and replace the body when a certificate is reimported", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		cert, key := selfSigned(t, "one.test")
		status, out := a.acm(t, "ImportCertificate", map[string]any{"Certificate": b64(cert), "PrivateKey": b64(key),
			"Tags": []map[string]string{{"Key": "owner", "Value": "infisical"}}})
		require.Equal(t, http.StatusOK, status, out)
		arn := out["CertificateArn"].(string)
		require.Regexp(t, `^arn:aws:acm:us-east-1:\d{12}:certificate/[a-f0-9-]{36}$`, arn)

		// Action
		cert2, key2 := selfSigned(t, "one.test")
		status, out = a.acm(t, "ImportCertificate", map[string]any{"CertificateArn": arn, "Certificate": b64(cert2), "PrivateKey": b64(key2)})
		require.Equal(t, http.StatusOK, status, out)

		// Assert
		got := cp.Certificates(t)[arn]
		require.Equal(t, cert2, got.Certificate)
		require.Equal(t, 2, got.Imports)
		require.Equal(t, "infisical", got.Tags["owner"])
		cp.ACM.ExpectEvent[aws.CertificateImported](t, func(e aws.CertificateImported) bool { return e.ARN == arn && e.Reimported })
	})

	t.Run("should refuse a private key that does not match the certificate", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cert, _ := selfSigned(t, "two.test")
		_, other := selfSigned(t, "two.test")

		// Action
		status, out := a.acm(t, "ImportCertificate", map[string]any{"Certificate": b64(cert), "PrivateKey": b64(other)})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ValidationException", out["__type"])
	})

	t.Run("should list only issued certificates of the requested key types, a page at a time", func(t *testing.T) {
		// Setup
		a := r.account(t)
		for _, n := range []string{"a.test", "b.test", "c.test"} {
			cert, key := selfSigned(t, n)
			status, _ := a.acm(t, "ImportCertificate", map[string]any{"Certificate": b64(cert), "PrivateKey": b64(key)})
			require.Equal(t, http.StatusOK, status)
		}
		_, defaults := a.acm(t, "ListCertificates", map[string]any{})
		require.Empty(t, defaults["CertificateSummaryList"], "EC keys are left out unless asked for")

		// Action
		var seen []any
		token := ""
		for {
			in := map[string]any{"MaxItems": 2, "CertificateStatuses": []string{"ISSUED"}, "Includes": map[string]any{"keyTypes": []string{"EC_prime256v1"}}}
			if token != "" {
				in["NextToken"] = token
			}
			status, out := a.acm(t, "ListCertificates", in)
			require.Equal(t, http.StatusOK, status, out)
			seen = append(seen, out["CertificateSummaryList"].([]any)...)
			next, ok := out["NextToken"].(string)
			if !ok {
				break
			}
			token = next
		}

		// Assert
		require.Len(t, seen, 3)
	})

	t.Run("should issue a requested certificate at once and export its key under the passphrase once Route 53 serves its validation CNAME", func(t *testing.T) {
		// Setup
		a := r.account(t)
		status, out := a.acm(t, "RequestCertificate", map[string]any{"DomainName": "www.issued.test", "ValidationMethod": "DNS",
			"IdempotencyToken": "tok1", "Options": map[string]string{"Export": "ENABLED"}})
		require.Equal(t, http.StatusOK, status, out)
		arn := out["CertificateArn"].(string)

		_, again := a.acm(t, "RequestCertificate", map[string]any{"DomainName": "www.issued.test", "IdempotencyToken": "tok1"})
		require.Equal(t, arn, again["CertificateArn"])

		_, described := a.acm(t, "DescribeCertificate", map[string]any{"CertificateArn": arn})
		detail := described["Certificate"].(map[string]any)
		require.Equal(t, "ISSUED", detail["Status"])
		record := detail["DomainValidationOptions"].([]any)[0].(map[string]any)["ResourceRecord"].(map[string]any)
		require.Equal(t, "CNAME", record["Type"])
		require.True(t, strings.HasSuffix(record["Name"].(string), ".www.issued.test."))

		status, refused := a.acm(t, "ExportCertificate", map[string]any{"CertificateArn": arn, "Passphrase": b64("correct horse")})
		require.Equal(t, http.StatusBadRequest, status, "export should wait for the validation CNAME")
		require.Equal(t, "RequestInProgressException", refused["__type"])

		// Action
		a.cp(t).Seed(t, aws.SeedHostedZone("ZI", "issued.test"))
		status, raw := a.route53(t, http.MethodPost, "/2013-04-01/hostedzone/ZI/rrset", change("UPSERT", record["Name"].(string), "CNAME", record["Value"].(string)))
		require.Equal(t, http.StatusOK, status, raw)

		// Assert
		status, exported := a.acm(t, "ExportCertificate", map[string]any{"CertificateArn": arn, "Passphrase": b64("correct horse")})
		require.Equal(t, http.StatusOK, status, exported)
		leaf, err := x509ParsePEM(exported["Certificate"].(string))
		require.NoError(t, err)
		key := decryptPKCS8(t, exported["PrivateKey"].(string), "correct horse")
		require.True(t, leaf.PublicKey.(interface{ Equal(crypto.PublicKey) bool }).Equal(key.Public()))
		require.WithinDuration(t, time.Now().Add(aws.AmazonIssuedValidityDays*24*time.Hour), leaf.NotAfter, 5*time.Minute)

		a.cp(t).Seed(t, aws.SeedHostedZone("ZI", "issued.test"))
		status, refused = a.acm(t, "ExportCertificate", map[string]any{"CertificateArn": arn, "Passphrase": b64("correct horse")})
		require.Equal(t, http.StatusBadRequest, status, "export should stop once a reseed removes the validation CNAME")
		require.Equal(t, "RequestInProgressException", refused["__type"])
	})

	t.Run("should keep serving one account's validation CNAME when another account changes a TXT record under the same name", func(t *testing.T) {
		// Setup
		a, other := r.account(t), r.account(t)
		_, out := a.acm(t, "RequestCertificate", map[string]any{"DomainName": "www.shared.test", "ValidationMethod": "DNS",
			"Options": map[string]string{"Export": "ENABLED"}})
		arn := out["CertificateArn"].(string)
		_, described := a.acm(t, "DescribeCertificate", map[string]any{"CertificateArn": arn})
		record := described["Certificate"].(map[string]any)["DomainValidationOptions"].([]any)[0].(map[string]any)["ResourceRecord"].(map[string]any)

		a.cp(t).Seed(t, aws.SeedHostedZone("ZS", "shared.test"))
		status, raw := a.route53(t, http.MethodPost, "/2013-04-01/hostedzone/ZS/rrset", change("UPSERT", record["Name"].(string), "CNAME", record["Value"].(string)))
		require.Equal(t, http.StatusOK, status, raw)

		// Action
		other.cp(t).Seed(t, aws.SeedHostedZone("ZS", "shared.test"))
		status, raw = other.route53(t, http.MethodPost, "/2013-04-01/hostedzone/ZS/rrset", change("UPSERT", record["Name"].(string), "TXT", `"unrelated"`))
		require.Equal(t, http.StatusOK, status, raw)

		// Assert
		status, exported := a.acm(t, "ExportCertificate", map[string]any{"CertificateArn": arn, "Passphrase": b64("correct horse")})
		require.Equal(t, http.StatusOK, status, exported)
	})

	t.Run("should refuse to export an imported certificate", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cert, key := selfSigned(t, "imported.test")
		_, out := a.acm(t, "ImportCertificate", map[string]any{"Certificate": b64(cert), "PrivateKey": b64(key)})

		// Action
		status, exported := a.acm(t, "ExportCertificate", map[string]any{"CertificateArn": out["CertificateArn"], "Passphrase": b64("pass")})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ValidationException", exported["__type"])
	})

	t.Run("should answer AccessDenied for an action the policy denies", func(t *testing.T) {
		// Setup
		a := r.account(t)
		a.cp(t).Seed(t, aws.Deny(aws.ACM, "ImportCertificate"))
		cert, key := selfSigned(t, "denied.test")

		// Action
		status, out := a.acm(t, "ImportCertificate", map[string]any{"Certificate": b64(cert), "PrivateKey": b64(key)})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "AccessDeniedException", out["__type"])
	})

	t.Run("should delete a certificate and its tags with it", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedACMCertificate("seeded.test"))
		var arn string
		for k := range cp.Certificates(t) {
			arn = k
		}

		// Action
		status, _ := a.acm(t, "DeleteCertificate", map[string]any{"CertificateArn": arn})

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Empty(t, cp.Certificates(t))
		status, out := a.acm(t, "DescribeCertificate", map[string]any{"CertificateArn": arn})
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ResourceNotFoundException", out["__type"])
	})
}

func x509ParsePEM(p string) (*x509.Certificate, error) {
	block, _ := pem.Decode([]byte(p))
	return x509.ParseCertificate(block.Bytes)
}

func decryptPKCS8(t *testing.T, p, passphrase string) crypto.Signer {
	t.Helper()
	block, _ := pem.Decode([]byte(p))
	require.Equal(t, "ENCRYPTED PRIVATE KEY", block.Type)
	key, err := pkcs8.ParsePKCS8PrivateKey(block.Bytes, []byte(passphrase))
	require.NoError(t, err)
	return key.(crypto.Signer)
}

func TestAWSFake_PrivateCA(t *testing.T) {
	r := newRig(t)

	t.Run("should sign a CSR with the CA's key under the passthrough subject", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		arn := aws.PrivateCAARN(a.id)
		cp.Seed(t, aws.SeedPrivateCA(arn, "ACTIVE"))

		_, described := a.pca(t, "DescribeCertificateAuthority", map[string]any{"CertificateAuthorityArn": arn})
		require.Equal(t, "ACTIVE", described["CertificateAuthority"].(map[string]any)["Status"])

		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		require.NoError(t, err)
		csrDER, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkix.Name{CommonName: "ignored"}}, key)
		require.NoError(t, err)
		csr := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: csrDER})

		// Action
		status, issued := a.pca(t, "IssueCertificate", map[string]any{
			"CertificateAuthorityArn": arn, "Csr": base64.StdEncoding.EncodeToString(csr), "SigningAlgorithm": "SHA256WITHRSA",
			"TemplateArn": "arn:aws:acm-pca:::template/BlankEndEntityCertificate_APICSRPassthrough/V1",
			"Validity":    map[string]any{"Type": "DAYS", "Value": 10},
			"ApiPassthrough": map[string]any{"Subject": map[string]string{"CommonName": "svc.pca.test"},
				"Extensions": map[string]any{"SubjectAlternativeNames": []map[string]string{{"DnsName": "svc.pca.test"}}}},
		})

		// Assert
		require.Equal(t, http.StatusOK, status, issued)

		status, got := a.pca(t, "GetCertificate", map[string]any{"CertificateAuthorityArn": arn, "CertificateArn": issued["CertificateArn"]})
		require.Equal(t, http.StatusOK, status, got)
		leaf, err := x509ParsePEM(got["Certificate"].(string))
		require.NoError(t, err)
		root, err := x509ParsePEM(got["CertificateChain"].(string))
		require.NoError(t, err)
		require.NoError(t, leaf.CheckSignatureFrom(root))
		require.Equal(t, "svc.pca.test", leaf.Subject.CommonName)
		require.Equal(t, []string{"svc.pca.test"}, leaf.DNSNames)
		cp.ACMPCA.ExpectEvent[aws.PrivateCertificateIssued](t, nil)
	})

	t.Run("should refuse to issue from a CA that is not active", func(t *testing.T) {
		// Setup
		a := r.account(t)
		arn := aws.PrivateCAARN(a.id)
		a.cp(t).Seed(t, aws.SeedPrivateCA(arn, "DISABLED"))

		// Action
		status, out := a.pca(t, "IssueCertificate", map[string]any{"CertificateAuthorityArn": arn, "Csr": b64("x"),
			"SigningAlgorithm": "SHA256WITHRSA", "Validity": map[string]any{"Type": "DAYS", "Value": 1}})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "InvalidStateException", out["__type"])
	})
}

func TestAWSFake_LoadBalancing(t *testing.T) {
	r := newRig(t)

	t.Run("should add a certificate to a listener's list and keep the default", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedListener("listener-1", "lb-1", 443, "arn:default"))

		// Action
		status, raw := a.elb(t, url.Values{"Action": {"AddListenerCertificates"}, "ListenerArn": {"listener-1"}, "Certificates.member.1.CertificateArn": {"arn:extra"}})

		// Assert
		require.Equal(t, http.StatusOK, status, raw)
		status, raw = a.elb(t, url.Values{"Action": {"DescribeListenerCertificates"}, "ListenerArn": {"listener-1"}})
		require.Equal(t, http.StatusOK, status, raw)
		require.Contains(t, raw, "<CertificateArn>arn:extra</CertificateArn><IsDefault>false</IsDefault>")
		require.Equal(t, "arn:default", cp.ELB.State(t).Listeners["listener-1"].DefaultCertificate)
		cp.ELB.ExpectEvent[aws.ListenerCertificateAdded](t, func(e aws.ListenerCertificateAdded) bool { return e.CertificateArn == "arn:extra" })
	})

	t.Run("should answer ListenerNotFound for a listener the account does not have", func(t *testing.T) {
		// Setup
		a := r.account(t)

		// Action
		status, raw := a.elb(t, url.Values{"Action": {"DescribeListenerCertificates"}, "ListenerArn": {"nope"}})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ListenerNotFound", errorCode(t, raw))
	})

	t.Run("should remove a certificate from a listener's list and keep the default", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedListener("listener-1", "lb-1", 443, "arn:default"))
		status, raw := a.elb(t, url.Values{"Action": {"AddListenerCertificates"}, "ListenerArn": {"listener-1"}, "Certificates.member.1.CertificateArn": {"arn:extra"}})
		require.Equal(t, http.StatusOK, status, raw)

		// Action
		status, raw = a.elb(t, url.Values{"Action": {"RemoveListenerCertificates"}, "ListenerArn": {"listener-1"}, "Certificates.member.1.CertificateArn": {"arn:extra"}})

		// Assert
		require.Equal(t, http.StatusOK, status, raw)
		listener := cp.ELB.State(t).Listeners["listener-1"]
		require.Empty(t, listener.Certificates)
		require.Equal(t, "arn:default", listener.DefaultCertificate)
		cp.ELB.ExpectEvent[aws.ListenerCertificateRemoved](t, func(e aws.ListenerCertificateRemoved) bool { return e.CertificateArn == "arn:extra" })
	})

	t.Run("should refuse to remove a listener's default certificate", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedListener("listener-1", "lb-1", 443, "arn:default"))

		// Action
		status, raw := a.elb(t, url.Values{"Action": {"RemoveListenerCertificates"}, "ListenerArn": {"listener-1"}, "Certificates.member.1.CertificateArn": {"arn:default"}})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "OperationNotPermitted", errorCode(t, raw))
		require.Equal(t, "arn:default", cp.ELB.State(t).Listeners["listener-1"].DefaultCertificate)
	})
}

func TestAWSFake_Route53(t *testing.T) {
	r := newRig(t)

	t.Run("should hold a TXT record upserted in the zone until it is deleted", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedHostedZone("Z1", "zone.test"))

		status, raw := a.route53(t, http.MethodGet, "/2013-04-01/hostedzone/Z1", "")
		require.Equal(t, http.StatusOK, status, raw)
		require.Contains(t, raw, "<Name>zone.test.</Name>")

		// Action
		status, raw = a.route53(t, http.MethodPost, "/2013-04-01/hostedzone/Z1/rrset", change("UPSERT", "_acme-challenge.www.zone.test", "TXT", `"token"`))

		// Assert
		require.Equal(t, http.StatusOK, status, raw)
		require.Contains(t, raw, "<Status>INSYNC</Status>")
		require.Equal(t, []*aws.RecordSet{{Name: "_acme-challenge.www.zone.test.", Type: "TXT", TTL: 30, Values: []string{`"token"`}}}, cp.Route53.State(t).Zones["Z1"].Records)

		status, raw = a.route53(t, http.MethodPost, "/2013-04-01/hostedzone/Z1/rrset", change("DELETE", "_acme-challenge.www.zone.test", "TXT", `"token"`))
		require.Equal(t, http.StatusOK, status, raw)
		require.Empty(t, cp.Route53.State(t).Zones["Z1"].Records)
		cp.Route53.ExpectEvent[aws.RecordChanged](t, func(e aws.RecordChanged) bool { return e.Action == "DELETE" })
	})

	t.Run("should refuse an unquoted TXT value and a name outside the zone", func(t *testing.T) {
		// Setup
		a := r.account(t)
		a.cp(t).Seed(t, aws.SeedHostedZone("Z2", "zone2.test"))

		// Action
		status, raw := a.route53(t, http.MethodPost, "/2013-04-01/hostedzone/Z2/rrset", change("UPSERT", "x.zone2.test", "TXT", "bare"))

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "InvalidChangeBatch", errorCode(t, raw))
		status, raw = a.route53(t, http.MethodPost, "/2013-04-01/hostedzone/Z2/rrset", change("UPSERT", "x.other.test", "CNAME", "y.test"))
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "InvalidChangeBatch", errorCode(t, raw))
	})

	t.Run("should answer NoSuchHostedZone for a zone the account does not have", func(t *testing.T) {
		// Setup
		a := r.account(t)

		// Action
		status, raw := a.route53(t, http.MethodGet, "/2013-04-01/hostedzone/ZNONE", "")

		// Assert
		require.Equal(t, http.StatusNotFound, status)
		require.Equal(t, "NoSuchHostedZone", errorCode(t, raw))
	})
}
