package digicert_test

import (
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"strconv"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func body(t *testing.T, v any) string {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return string(raw)
}

func idOf(v any) string { return strconv.Itoa(int(v.(float64))) }

// issued places an ssl_plus order for a pre-validated name and returns its order and
// certificate ids.
func issued(t *testing.T, call func(method, path, body string) (int, map[string]any), name string, extra map[string]any) (string, string) {
	t.Helper()
	in := map[string]any{
		"certificate":    map[string]any{"common_name": name, "csr": issuer.TestCSR(t, name, name)},
		"organization":   map[string]any{"id": 7},
		"order_validity": map[string]any{"days": 30},
		"dcv_method":     "dns-txt-token",
	}
	for k, v := range extra {
		in[k] = v
	}
	status, out := call("POST", "/order/certificate/ssl_plus", body(t, in))
	require.Equal(t, http.StatusCreated, status, out)
	require.NotNil(t, out["certificate_id"], out)
	return idOf(out["id"]), idOf(out["certificate_id"])
}

func TestDigiCertFake_OrderChecks(t *testing.T) {
	t.Run("should put the order's names on the certificate, not the CSR's", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "chk-a")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))
		do := func(m, p, b string) (int, map[string]any) { return call(t, fakes, "chk-a", m, p, b) }

		// Action
		orderID, _ := issued(t, do, "www.ok.test", map[string]any{"certificate": map[string]any{
			"common_name": "www.ok.test", "dns_names": []string{"api.ok.test"}, "csr": issuer.TestCSR(t, "other.test", "other.test")}})

		// Assert
		order := dc.State(t).Orders[atoi(orderID)]
		require.Equal(t, []string{"api.ok.test"}, order.DNSNames)
		leaf := parse(t, order.Certificate)
		require.Equal(t, []string{"www.ok.test", "api.ok.test"}, leaf.DNSNames)
	})

	t.Run("should refuse an unknown product, an unknown dcv_method and a malformed DNS name", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "chk-b")
		dc.Seed(t, digicert.WithOrganization(7))
		base := func(product, dcv string, names []string) (int, map[string]any) {
			return call(t, fakes, "chk-b", "POST", "/order/certificate/"+product, body(t, map[string]any{
				"certificate":    map[string]any{"common_name": "a.test", "dns_names": names, "csr": issuer.TestCSR(t, "a.test", "a.test")},
				"organization":   map[string]any{"id": 7},
				"order_validity": map[string]any{"days": 30},
				"dcv_method":     dcv,
			}))
		}

		// Action
		_, product := base("ssl_nope", "dns-txt-token", nil)
		_, dcv := base("ssl_plus", "carrier-pigeon", nil)
		_, names := base("ssl_plus", "dns-txt-token", []string{"not a name"})

		// Assert
		require.Equal(t, "invalid_product", errCode(product))
		require.Equal(t, "invalid_dcv_method", errCode(dcv))
		require.Equal(t, "invalid_dns_name", errCode(names))
		require.Empty(t, dc.State(t).Orders)
	})

	t.Run("should answer an organization's validations", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "chk-c")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithOrganizationValidation(7, "cs", "active"))

		// Action
		status, out := call(t, fakes, "chk-c", "GET", "/organization/7/validation", "")

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, []any{map[string]any{"type": "cs", "status": "active"}}, out["validations"])
	})
}

func TestDigiCertFake_Lifecycle(t *testing.T) {
	t.Run("should link a renewal to its order and refuse one the order is not eligible for", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "life-a")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))
		do := func(m, p, b string) (int, map[string]any) { return call(t, fakes, "life-a", m, p, b) }
		first, _ := issued(t, do, "www.ok.test", nil)

		// Action
		renewal, _ := issued(t, do, "www.ok.test", map[string]any{"renewal_of_order_id": atoi(first)})
		dc.Seed(t, digicert.RenewalIneligible(atoi(renewal)))
		status, refused := do("POST", "/order/certificate/ssl_plus", body(t, map[string]any{
			"certificate":  map[string]any{"common_name": "www.ok.test", "csr": issuer.TestCSR(t, "www.ok.test", "www.ok.test")},
			"organization": map[string]any{"id": 7}, "order_validity": map[string]any{"days": 30},
			"dcv_method": "dns-txt-token", "renewal_of_order_id": atoi(renewal)}))

		// Assert
		require.Equal(t, atoi(first), dc.State(t).Orders[atoi(renewal)].RenewalOfOrderID)
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "order_not_eligible_for_renewal", errCode(refused))
	})

	t.Run("should hold a reissue for a name whose validation lapsed until it is canceled", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "life-b")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))
		do := func(m, p, b string) (int, map[string]any) { return call(t, fakes, "life-b", m, p, b) }
		orderID, certID := issued(t, do, "www.ok.test", nil)
		dc.Seed(t, digicert.WithoutValidatedDomain("ok.test"))
		status, out := do("POST", "/order/certificate/"+orderID+"/reissue", body(t, map[string]any{
			"certificate": map[string]any{"common_name": "www.ok.test", "csr": issuer.TestCSR(t, "www.ok.test", "www.ok.test")}}))
		require.Equal(t, http.StatusCreated, status, out)
		require.Nil(t, out["certificate_id"])
		_, pending := do("GET", "/order/certificate/"+orderID, "")
		require.Equal(t, "reissue_pending", pending["status"])

		// Action
		status, _ = do("PUT", "/order/certificate/"+orderID+"/status", `{"status":"canceled","note":"no"}`)

		// Assert
		require.Equal(t, http.StatusNoContent, status)
		_, after := do("GET", "/order/certificate/"+orderID, "")
		require.Equal(t, "issued", after["status"])
		require.Equal(t, certID, idOf(after["certificate"].(map[string]any)["id"]))
		dc.ExpectEvent[digicert.OrderCanceled](t, func(e digicert.OrderCanceled) bool { return e.Status == "issued" })
	})

	t.Run("should reissue at once under a validated domain, keeping the earlier certificate downloadable", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "life-c")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))
		do := func(m, p, b string) (int, map[string]any) { return call(t, fakes, "life-c", m, p, b) }
		orderID, certID := issued(t, do, "www.ok.test", nil)

		// Action
		status, out := do("POST", "/order/certificate/"+orderID+"/reissue", body(t, map[string]any{
			"certificate": map[string]any{"common_name": "www.ok.test", "csr": issuer.TestCSR(t, "www.ok.test", "www.ok.test")}}))

		// Assert
		require.Equal(t, http.StatusCreated, status, out)
		require.NotEqual(t, certID, idOf(out["certificate_id"]))
		state := dc.State(t)
		require.Equal(t, 1, state.Orders[atoi(orderID)].Reissues)
		require.Contains(t, state.Certificates, atoi(certID))
	})

	t.Run("should revoke a certificate once and list its order in the status-changes feed", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "life-d")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))
		do := func(m, p, b string) (int, map[string]any) { return call(t, fakes, "life-d", m, p, b) }
		orderID, certID := issued(t, do, "www.ok.test", nil)

		// Action
		status, _ := do("PUT", "/certificate/"+certID+"/revoke", `{"comments":"bye"}`)

		// Assert
		require.Equal(t, http.StatusNoContent, status)
		status, again := do("PUT", "/certificate/"+certID+"/revoke", `{"comments":"bye"}`)
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "already_revoked", errCode(again))
		_, feed := do("GET", "/order/certificate/status-changes?seconds=60", "")
		require.Contains(t, feed["orders"], map[string]any{"order_id": float64(atoi(orderID)), "certificate_id": float64(atoi(certID)), "status": "revoked"})
	})

	t.Run("should show an order revoked in CertCentral in the status-changes feed", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "life-f")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))
		do := func(m, p, b string) (int, map[string]any) { return call(t, fakes, "life-f", m, p, b) }
		orderID, _ := issued(t, do, "www.ok.test", nil)
		mark := dc.Mark(t)

		// Action
		dc.Seed(t, digicert.RevokeOrder(atoi(orderID)))

		// Assert
		dc.ExpectEvent[digicert.CertificateRevoked](t, nil, fakenet.Since(mark))
		_, feed := do("GET", "/order/certificate/status-changes?seconds=60", "")
		require.Len(t, feed["orders"], 1)
		require.Equal(t, "revoked", feed["orders"].([]any)[0].(map[string]any)["status"])
	})
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func errCode(out map[string]any) string {
	errs, _ := out["errors"].([]any)
	if len(errs) == 0 {
		return ""
	}
	return errs[0].(map[string]any)["code"].(string)
}

func parse(t *testing.T, p string) *x509.Certificate {
	t.Helper()
	block, _ := pem.Decode([]byte(p))
	require.NotNil(t, block)
	c, err := x509.ParseCertificate(block.Bytes)
	require.NoError(t, err)
	return c
}

func TestDigiCertFake_SeededOrders(t *testing.T) {
	t.Run("should hold an order issued in CertCentral for a seeded CSR", func(t *testing.T) {
		// Setup
		_, _, dc := newAccount(t, "seed-a")

		// Action
		dc.Seed(t, digicert.WithIssuedOrder(digicert.IssuedOrder{Product: "ssl_plus", OrganizationID: 7, CommonName: "s.test",
			CSR: issuer.TestCSR(t, "s.test", "s.test")}))

		// Assert
		var got *digicert.Order
		for _, o := range dc.State(t).Orders {
			got = o
		}
		require.NotNil(t, got)
		require.Equal(t, "issued", got.Status)
		require.Equal(t, "s.test", parse(t, got.Certificate).Subject.CommonName)
	})
}
