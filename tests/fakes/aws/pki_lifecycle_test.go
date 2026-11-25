package aws_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/stretchr/testify/require"
)

func (a *account) requestExportable(t *testing.T, name string) string {
	t.Helper()
	status, out := a.acm(t, "RequestCertificate", map[string]any{"DomainName": name, "ValidationMethod": "DNS",
		"Options": map[string]string{"Export": "ENABLED"}})
	require.Equal(t, http.StatusOK, status, out)
	return out["CertificateArn"].(string)
}

func (a *account) issuePrivate(t *testing.T, arn, template string, csrTmpl *x509.CertificateRequest) *x509.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.CreateCertificateRequest(rand.Reader, csrTmpl, key)
	require.NoError(t, err)
	csr := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})
	status, issued := a.pca(t, "IssueCertificate", map[string]any{
		"CertificateAuthorityArn": arn, "Csr": base64.StdEncoding.EncodeToString(csr), "SigningAlgorithm": "SHA256WITHRSA",
		"TemplateArn": template, "Validity": map[string]any{"Type": "DAYS", "Value": 10},
	})
	require.Equal(t, http.StatusOK, status, issued)
	_, got := a.pca(t, "GetCertificate", map[string]any{"CertificateAuthorityArn": arn, "CertificateArn": issued["CertificateArn"]})
	leaf, err := x509ParsePEM(got["Certificate"].(string))
	require.NoError(t, err)
	return leaf
}

const passthroughTemplate = "arn:aws:acm-pca:::template/BlankEndEntityCertificate_APICSRPassthrough/V1"

func TestAWSFake_CertificateManagerLifecycle(t *testing.T) {
	r := newRig(t)

	t.Run("should renew an exportable certificate in place with a new serial", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		arn := a.requestExportable(t, "www.renew.test")
		_, before := a.acm(t, "DescribeCertificate", map[string]any{"CertificateArn": arn})

		// Action
		status, out := a.acm(t, "RenewCertificate", map[string]any{"CertificateArn": arn})

		// Assert
		require.Equal(t, http.StatusOK, status, out)
		_, after := a.acm(t, "DescribeCertificate", map[string]any{"CertificateArn": arn})
		detail := after["Certificate"].(map[string]any)
		require.NotEqual(t, before["Certificate"].(map[string]any)["Serial"], detail["Serial"])
		require.Equal(t, "SUCCESS", detail["RenewalSummary"].(map[string]any)["RenewalStatus"])
		require.Equal(t, 1, cp.ACM.State(t).Certificates[arn].Renewals)
		cp.ACM.ExpectEvent[aws.ACMCertificateRenewed](t, func(e aws.ACMCertificateRenewed) bool { return e.ARN == arn })
	})

	t.Run("should revoke an exportable certificate once and refuse a second revocation", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		arn := a.requestExportable(t, "www.revoke.test")

		// Action
		status, out := a.acm(t, "RevokeCertificate", map[string]any{"CertificateArn": arn, "RevocationReason": "KEY_COMPROMISE"})

		// Assert
		require.Equal(t, http.StatusOK, status, out)
		got := cp.ACM.State(t).Certificates[arn]
		require.Equal(t, "REVOKED", got.Status)
		require.Equal(t, "KEY_COMPROMISE", got.RevocationReason)
		status, again := a.acm(t, "RevokeCertificate", map[string]any{"CertificateArn": arn, "RevocationReason": "KEY_COMPROMISE"})
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ResourceInUseException", again["__type"])
	})

	t.Run("should refuse a revocation reason ACM does not define", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		arn := a.requestExportable(t, "www.reason.test")

		// Action
		status, out := a.acm(t, "RevokeCertificate", map[string]any{"CertificateArn": arn, "RevocationReason": "BECAUSE"})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ValidationException", out["__type"])
		require.Equal(t, "ISSUED", cp.ACM.State(t).Certificates[arn].Status)
	})
}

func TestAWSFake_PrivateCALifecycle(t *testing.T) {
	r := newRig(t)

	t.Run("should revoke a certificate by its serial and refuse it the second time", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		arn := aws.PrivateCAARN(a.id)
		cp.Seed(t, aws.SeedPrivateCA(arn, "ACTIVE"))
		leaf := a.issuePrivate(t, arn, passthroughTemplate, &x509.CertificateRequest{Subject: pkix.Name{CommonName: "r.pca.test"}})

		// Action
		status, out := a.pca(t, "RevokeCertificate", map[string]any{"CertificateAuthorityArn": arn,
			"CertificateSerial": leaf.SerialNumber.Text(16), "RevocationReason": "KEY_COMPROMISE"})

		// Assert
		require.Equal(t, http.StatusOK, status, out)
		cp.ACMPCA.ExpectEvent[aws.PrivateCertificateRevoked](t, func(e aws.PrivateCertificateRevoked) bool {
			return e.Serial == leaf.SerialNumber.Text(16) && e.Reason == "KEY_COMPROMISE"
		})
		status, again := a.pca(t, "RevokeCertificate", map[string]any{"CertificateAuthorityArn": arn,
			"CertificateSerial": leaf.SerialNumber.Text(16), "RevocationReason": "KEY_COMPROMISE"})
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "RequestAlreadyProcessedException", again["__type"])
	})

	t.Run("should copy the extended key usages a CSR requests under a passthrough template", func(t *testing.T) {
		// Setup
		a := r.account(t)
		cp := a.cp(t)
		arn := aws.PrivateCAARN(a.id)
		cp.Seed(t, aws.SeedPrivateCA(arn, "ACTIVE"))
		ekuExt, err := marshalEKU()
		require.NoError(t, err)

		// Action
		leaf := a.issuePrivate(t, arn, passthroughTemplate, &x509.CertificateRequest{Subject: pkix.Name{CommonName: "signer.pca.test"},
			ExtraExtensions: []pkix.Extension{ekuExt}})

		// Assert
		require.Equal(t, []x509.ExtKeyUsage{x509.ExtKeyUsageCodeSigning}, leaf.ExtKeyUsage)
	})
}

func marshalEKU() (pkix.Extension, error) {
	value, err := asn1.Marshal([]asn1.ObjectIdentifier{{1, 3, 6, 1, 5, 5, 7, 3, 3}})
	return pkix.Extension{Id: asn1.ObjectIdentifier{2, 5, 29, 37}, Value: value}, err
}
