package godaddy_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

// issuedCertificate orders and issues a certificate for name and returns its id.
func issuedCertificate(t *testing.T, key, name string) (string, func(method, path, body string) (int, map[string]any), *godaddy.ControlPlane) {
	t.Helper()
	fakes, admin, gd := newAccount(t, key)
	do := func(method, path, body string) (int, map[string]any) {
		return call(t, fakes, key, godaddy.APISecret(key), method, path, body)
	}
	return issue(t, do, admin, gd, name), do, gd
}

func issue(t *testing.T, do func(string, string, string) (int, map[string]any), admin string, gd *godaddy.ControlPlane, name string) string {
	t.Helper()
	_, placed := do("POST", "/v1/certificates", certificateRequest(t, name))
	id := placed["certificateId"].(string)
	fakenet.SetTXT(t, admin, "_dnsauth."+name, gd.State(t).Certificates[id].DomainToken)
	_, got := do("GET", "/v1/certificates/"+id, "")
	require.Equal(t, "ISSUED", got["status"])
	return id
}

func renewBody(t *testing.T, name string) string {
	return `{"commonName":"` + name + `","csr":` + quote(issuer.TestCSR(t, name)) + `,"period":1}`
}

func TestGoDaddyFake_Lifecycle(t *testing.T) {
	t.Run("should renew a certificate inside its window under the same id with a new serial", func(t *testing.T) {
		// Setup
		fakes, admin, gd := newAccount(t, "life-a")
		do := func(method, path, body string) (int, map[string]any) {
			return call(t, fakes, "life-a", godaddy.APISecret("life-a"), method, path, body)
		}
		gd.Seed(t, godaddy.WithValidityDays(20))
		id := issue(t, do, admin, gd, "r.test")
		before := gd.State(t).Certificates[id].Serial

		// Action
		status, _ := do("POST", "/v1/certificates/"+id+"/renew", renewBody(t, "r.test"))

		// Assert
		require.Equal(t, http.StatusAccepted, status)
		_, got := do("GET", "/v1/certificates/"+id, "")
		require.Equal(t, "ISSUED", got["status"])
		after := gd.State(t).Certificates[id]
		require.NotEqual(t, before, after.Serial)
		require.Equal(t, 1, after.Renewals)
	})

	t.Run("should refuse a renewal before the window opens", func(t *testing.T) {
		// Setup
		id, do, gd := issuedCertificate(t, "life-b", "early.test")

		// Action
		status, out := do("POST", "/v1/certificates/"+id+"/renew", renewBody(t, "early.test"))

		// Assert
		require.Equal(t, http.StatusConflict, status)
		require.Equal(t, "RENEWAL_NOT_ALLOWED", out["code"])
		require.Zero(t, gd.State(t).Certificates[id].Renewals)
	})

	t.Run("should revoke an issued certificate once", func(t *testing.T) {
		// Setup
		id, do, gd := issuedCertificate(t, "life-c", "rev.test")

		// Action
		status, _ := do("POST", "/v1/certificates/"+id+"/revoke", `{"reason":"KEY_COMPROMISE"}`)

		// Assert
		require.Equal(t, http.StatusNoContent, status)
		got := gd.State(t).Certificates[id]
		require.Equal(t, "REVOKED", got.Status)
		require.Equal(t, "KEY_COMPROMISE", got.RevocationReason)
		status, _ = do("POST", "/v1/certificates/"+id+"/revoke", `{"reason":"KEY_COMPROMISE"}`)
		require.Equal(t, http.StatusConflict, status)
	})
}

func quote(s string) string {
	raw, _ := json.Marshal(s)
	return string(raw)
}
