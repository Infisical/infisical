package externalca_test

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// latestOrder is the newest order the account holds for a common name.
func latestOrder(t *testing.T, dc *digicert.ControlPlane, commonName string) *digicert.Order {
	t.Helper()
	var latest *digicert.Order
	for _, o := range dc.State(t).Orders {
		if o.CommonName == commonName && (latest == nil || o.ID > latest.ID) {
			latest = o
		}
	}
	require.NotNilf(t, latest, "DigiCert holds no order for %s", commonName)
	return latest
}

// validatedDigiCert is a DigiCert CA whose account already validated a fresh domain,
// so its orders issue in the job, and a name under that domain.
func validatedDigiCert(t *testing.T, tn *harness.Tenant, proj *pki.Project) (orderIssuer, *digicert.ControlPlane, string) {
	t.Helper()
	ca, dc := pki.NewDigiCertCA(t, proj)
	domain := id.Short() + ".digicert.test"
	dc.Seed(t, digicert.WithValidatedDomain(domain))
	return newOrderIssuer(t, proj, ca), dc, "www." + domain
}

func TestDigiCertCA_Manage(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store an update to the CA's name, status and product without calling DigiCert", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		read, err := tn.Admin.API.GetDigicertCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())
		require.NoError(t, err)
		connID := decode(t, read.Body)["configuration"].(map[string]any)["appConnectionId"]
		calls := len(dc.Calls(t))
		name := "digicert-renamed-" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdateDigicertCertificateAuthorityV1WithBodyWithResponse(t.Context(), ca.ID.String(), "application/json",
			bytes.NewReader(jsonBody(t, map[string]any{"name": name, "status": "disabled", "configuration": map[string]any{
				"appConnectionId": connID, "organizationId": pki.DigiCertOrganization, "productNameId": "ssl_basic"}})))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the CA: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetDigicertCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())
		require.NoError(t, err)
		body := decode(t, got.Body)
		require.Equal(t, name, body["name"])
		require.Equal(t, "disabled", body["status"])
		require.Equal(t, "ssl_basic", body["configuration"].(map[string]any)["productNameId"])
		require.Len(t, dc.Calls(t), calls, "updating an SSL DigiCert CA should not call DigiCert")
	})

	t.Run("should delete the CA without calling DigiCert", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		calls := len(dc.Calls(t))

		// Action
		res, err := tn.Admin.API.DeleteDigicertCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the CA: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetDigicertCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, got.StatusCode())
		require.Len(t, dc.Calls(t), calls, "deleting a DigiCert CA should not call DigiCert")
	})
}

func TestDigiCertCA_CodeSigningValidation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	create := func(t *testing.T, tn *harness.Tenant, proj *pki.Project, conn *fixture.AppConnection, org int) *api.CreateDigicertCertificateAuthorityV1Response {
		t.Helper()
		res, err := tn.Admin.API.CreateDigicertCertificateAuthorityV1WithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(jsonBody(t, map[string]any{
			"projectId": proj.ID, "name": "digicert-cs-" + id.Short(), "status": "active",
			"configuration": map[string]any{"appConnectionId": conn.ID, "organizationId": org, "productNameId": "code_signing", "purpose": "code_signing"},
		})))
		require.NoError(t, err)
		return res
	}

	t.Run("should create and update a code-signing CA only for an organization with active code signing validation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.DigiCertAPIKeyAppConnection)
		dc := digicert.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		dc.Seed(t, digicert.WithOrganization(pki.DigiCertOrganization), digicert.WithOrganization(pki.DigiCertOrganization+1),
			digicert.WithOrganizationValidation(pki.DigiCertOrganization, "cs", "active"))

		// Action
		created := create(t, tn, proj, conn, pki.DigiCertOrganization)
		require.NotNilf(t, created.JSON200, "creating the CA returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		updated, err := tn.Admin.API.UpdateDigicertCertificateAuthorityV1WithBodyWithResponse(t.Context(), created.JSON200.Id.String(), "application/json",
			bytes.NewReader(jsonBody(t, map[string]any{"configuration": map[string]any{"appConnectionId": conn.ID,
				"organizationId": pki.DigiCertOrganization + 1, "productNameId": "code_signing", "purpose": "code_signing"}})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, updated.StatusCode())
		require.Equal(t, "This DigiCert organization has not completed code signing validation yet. Add a verified contact (first name, last name, email, job title, telephone) so DigiCert can start organization validation.", apierr.Message(updated.Body))
		got, err := tn.Admin.API.GetDigicertCertificateAuthorityV1WithResponse(t.Context(), created.JSON200.Id.String())
		require.NoError(t, err)
		require.EqualValues(t, pki.DigiCertOrganization, decode(t, got.Body)["configuration"].(map[string]any)["organizationId"])
	})

	t.Run("should refuse to create a code-signing CA for an organization without code signing validation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.DigiCertAPIKeyAppConnection)
		dc := digicert.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		dc.Seed(t, digicert.WithOrganization(pki.DigiCertOrganization), digicert.WithOrganizationValidation(pki.DigiCertOrganization, "ov", "active"))

		// Action
		res := create(t, tn, proj, conn, pki.DigiCertOrganization)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "This DigiCert organization has not completed code signing validation yet. Add a verified contact (first name, last name, email, job title, telephone) so DigiCert can start organization validation.", apierr.Message(res.Body))
		require.Equal(t, 1, dc.Received(t, http.MethodGet, "/services/v2/organization/"+itoa(pki.DigiCertOrganization)+"/validation"))
	})
}

func TestDigiCertCA_Requests(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should fail a cancelled pending order and issue nothing when validation is triggered later", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		o := newOrderIssuer(t, proj, ca)
		name := "www." + id.Short() + ".digicert.test"
		res := o.order(t, pki.ServerCertificate(name))
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation,
			o.Settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation).JSON200.Status)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_dnsauth."+name, latestOrder(t, dc, name).DCVRandomValue)

		// Action
		cancelled, err := o.Operator.API.CancelCertificateRequestWithResponse(t.Context(), orderRequestID(t, res))

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, cancelled.JSON200, "cancelling returned %d: %s", cancelled.StatusCode(), apierr.Body(cancelled.Body))
		require.True(t, cancelled.JSON200.Cancelled)
		trig, err := tn.Admin.API.TriggerCertificateRequestValidationWithResponse(t.Context(), orderRequestID(t, res))
		require.NoError(t, err)
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusFailed, got.JSON200.Status, "trigger answered %d: %s", trig.StatusCode(), apierr.Body(trig.Body))
		require.Nil(t, got.JSON200.CertificateId)
		dc.ExpectNoEvent[digicert.OrderIssued](t, nil)
	})

	t.Run("should end the request with DigiCert's message when DigiCert refuses the order", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		dc.Fail(t, http.MethodPost, "/services/v2/order/certificate/*", http.StatusBadRequest,
			fakenet.Body(`{"errors":[{"code":"invalid_csr","message":"The CSR is malformed."}]}`))
		o := newOrderIssuer(t, proj, ca)

		// Action
		got := o.Settled(t, o.order(t, pki.ServerCertificate("www."+id.Short()+".digicert.test")).JSON200.CertificateRequestId)

		// Assert
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusFailed, got.JSON200.Status)
		require.NotNil(t, got.JSON200.ErrorMessage)
		require.Equal(t, "Certificate issuance failed: DigiCert order placement for product ssl_plus failed: The CSR is malformed. (invalid_csr)", *got.JSON200.ErrorMessage)
		require.Empty(t, dc.State(t).Orders)
	})
}

func TestDigiCertCA_Renew(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should place the renewal as a renewal of the certificate's order", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		o, dc, name := validatedDigiCert(t, tn, proj)
		certID, _ := o.issue(t, pki.ServerCertificate(name))
		first := latestOrder(t, dc, name)

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		renewal := latestOrder(t, dc, name)
		require.NotEqual(t, first.ID, renewal.ID)
		require.Equal(t, first.ID, renewal.RenewalOfOrderID)
		require.Equal(t, pki.ParseLeaf(t, renewal.Certificate).Raw, pki.ParseLeaf(t, *got.JSON200.Certificate).Raw)
	})

	t.Run("should place a fresh order when DigiCert says the order is not eligible for renewal", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		o, dc, name := validatedDigiCert(t, tn, proj)
		certID, _ := o.issue(t, pki.ServerCertificate(name))
		first := latestOrder(t, dc, name)
		dc.Seed(t, digicert.RenewalIneligible(first.ID))

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		fresh := latestOrder(t, dc, name)
		require.NotEqual(t, first.ID, fresh.ID)
		require.Zero(t, fresh.RenewalOfOrderID)
		require.Len(t, dc.State(t).Orders, 2)
	})

	t.Run("should reissue on the same order when asked to", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		o, dc, name := validatedDigiCert(t, tn, proj)
		certID, _ := o.issue(t, pki.ServerCertificate(name))
		first := latestOrder(t, dc, name)

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{"externalConfiguration": map[string]any{"reissue": true}}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		state := dc.State(t)
		require.Len(t, state.Orders, 1)
		order := state.Orders[first.ID]
		require.Equal(t, 1, order.Reissues)
		require.NotEqual(t, first.CertificateID, order.CertificateID)
		require.Equal(t, pki.ParseLeaf(t, order.Certificate).Raw, pki.ParseLeaf(t, *got.JSON200.Certificate).Raw)
	})

	t.Run("should tell DigiCert when a pending reissue is cancelled", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		domain := id.Short() + ".digicert.test"
		dc.Seed(t, digicert.WithValidatedDomain(domain))
		o := newOrderIssuer(t, proj, ca)
		certID, _ := o.issue(t, pki.ServerCertificate("www."+domain))
		dc.Seed(t, digicert.WithoutValidatedDomain(domain))
		reqID := o.renew(t, certID, map[string]any{"externalConfiguration": map[string]any{"reissue": true}})
		pending := o.Settled(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, pending.JSON200.Status, "error: %v", pending.JSON200.ErrorMessage)
		parsed, err := uuid.Parse(reqID)
		require.NoError(t, err)

		// Action
		cancelled, err := o.Operator.API.CancelCertificateRequestWithResponse(t.Context(), parsed)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, cancelled.JSON200, "cancelling returned %d: %s", cancelled.StatusCode(), apierr.Body(cancelled.Body))
		dc.ExpectEvent[digicert.OrderCanceled](t, func(e digicert.OrderCanceled) bool { return e.Status == "issued" })
		order := latestOrder(t, dc, "www."+domain)
		require.Equal(t, "issued", order.Status)
		require.Nil(t, order.PendingReissue)
	})
}

func TestDigiCertCA_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should revoke the certificate at DigiCert", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		o, dc, name := validatedDigiCert(t, tn, proj)
		certID, _ := o.issue(t, pki.ServerCertificate(name))
		order := latestOrder(t, dc, name)

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.NotNilf(t, res.JSON200, "revoking returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		dc.ExpectEvent[digicert.CertificateRevoked](t, func(e digicert.CertificateRevoked) bool { return e.CertificateID == order.CertificateID })
		require.Equal(t, "revoked", o.certificateStatus(t, certID))
	})

	t.Run("should revoke only the stored certificate when the order has since been reissued", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Infisical refuses to revoke a certificate that is no longer its order's current one only
			when the stored metadata lacks DigiCert's certificate id, which issuance and import always
			store, so that refusal is unreachable over HTTP. What is reachable: revoking the replaced
			certificate names it by its own id and leaves the order's new certificate valid.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		o, dc, name := validatedDigiCert(t, tn, proj)
		certID, _ := o.issue(t, pki.ServerCertificate(name))
		original := latestOrder(t, dc, name).CertificateID
		reissued := o.Settled(t, o.renew(t, certID, map[string]any{"externalConfiguration": map[string]any{"reissue": true}}))
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, reissued.JSON200.Status, "error: %v", reissued.JSON200.ErrorMessage)

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.NotNilf(t, res.JSON200, "revoking returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		state := dc.State(t)
		order := latestOrder(t, dc, name)
		require.Equal(t, "revoked", state.Certificates[original].Status)
		require.Equal(t, "issued", state.Certificates[order.CertificateID].Status)
		require.Equal(t, "issued", order.Status)
	})
}

func TestDigiCertCA_Import(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// importSetup gives a profile on a DigiCert CA whose account holds two orders issued
	// in CertCentral, outside Infisical, and returns them by common name.
	importSetup := func(t *testing.T) (*harness.Tenant, pki.Profile, map[string]*digicert.Order, string) {
		t.Helper()
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		domain := id.Short() + ".digicert.test"
		for _, n := range []string{"www." + domain, "api." + domain} {
			dc.Seed(t, digicert.WithIssuedOrder(digicert.IssuedOrder{Product: "ssl_plus", OrganizationID: pki.DigiCertOrganization, CommonName: n, CSR: csrPEM(t, n)}))
		}
		profile := pki.NewProfile(t, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)))
		orders := map[string]*digicert.Order{}
		for _, ord := range dc.State(t).Orders {
			orders[strings.SplitN(ord.CommonName, ".", 2)[0]] = ord
		}
		return tn, profile, orders, dc.State(t).Root
	}

	importInto := func(t *testing.T, tn *harness.Tenant, profile pki.Profile, certPEM, chainPEM string, orderID int) *api.ImportCertificateResponse {
		t.Helper()
		res, err := tn.Admin.API.ImportCertificateWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(jsonBody(t, map[string]any{
			"certificatePem": certPEM, "chainPem": chainPEM, "profileId": profile.ID,
			"externalMetadata": map[string]any{"type": "digicert", "orderId": orderID},
		})))
		require.NoError(t, err)
		return res
	}

	t.Run("should import a certificate with the DigiCert order it was issued on", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, profile, orders, root := importSetup(t)

		// Action
		res := importInto(t, tn, profile, orders["www"].Certificate, root, orders["www"].ID)

		// Assert
		require.NotNilf(t, res.JSON200, "importing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		external := pki.ReadCertificate(t, tn.Admin, res.JSON200.CertificateId).JSON200.Certificate.ExternalMetadata
		require.NotNil(t, external)
		meta, err := external.AsGetCertificate200JSONResponseBodyCertificateExternalMetadata1()
		require.NoError(t, err)
		require.EqualValues(t, orders["www"].ID, meta.OrderId)
		require.NotNil(t, meta.CertificateId)
		require.EqualValues(t, orders["www"].CertificateID, *meta.CertificateId)
	})

	t.Run("should refuse to import a certificate with a DigiCert order that issued a different one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, profile, orders, root := importSetup(t)

		// Action
		res := importInto(t, tn, profile, orders["www"].Certificate, root, orders["api"].ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "DigiCert order "+itoa(orders["api"].ID)+" was issued for a different certificate than the one being imported. Check the order number in DigiCert CertCentral.", apierr.Message(res.Body))
		again := importInto(t, tn, profile, orders["www"].Certificate, root, orders["www"].ID)
		require.Equalf(t, http.StatusOK, again.StatusCode(), "the refused import should have stored nothing: %s", apierr.Body(again.Body))
	})
}

func csrPEM(t *testing.T, name string) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkix.Name{CommonName: name}, DNSNames: []string{name}}, key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der}))
}

func itoa(n int) string { return strconv.Itoa(n) }
