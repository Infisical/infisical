package azure_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newVaults(t *testing.T, clientID string) (*httptest.Server, *azure.VaultControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, azure.KeyVault)
	cp := azure.OpenKeyVault(t, adminURL, clientID)
	cp.Seed(t, azure.WithVault("kv1"))
	return fakes, cp
}

func vaultCall(t *testing.T, fakes *httptest.Server, clientID, method, path, body string) int {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = "kv1.vault.azure.net"
	req.Header.Set("Authorization", "Bearer azure-"+clientID)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	_ = res.Body.Close()
	return res.StatusCode
}

func importBody(t *testing.T, withKey bool) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "a.test"}, NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	pemBody := ""
	if withKey {
		kder, err := x509.MarshalPKCS8PrivateKey(key)
		require.NoError(t, err)
		pemBody = string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: kder}))
	}
	pemBody += string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	raw, err := json.Marshal(map[string]any{
		"value":  base64.StdEncoding.EncodeToString([]byte(pemBody)),
		"policy": map[string]any{"secret_props": map[string]any{"contentType": "application/x-pem-file"}},
	})
	require.NoError(t, err)
	return string(raw)
}

func TestKeyVaultFake_Certificates(t *testing.T) {
	t.Run("should add a version when a name is imported again", func(t *testing.T) {
		// Setup
		fakes, cp := newVaults(t, "client-a")
		vaultCall(t, fakes, "client-a", "POST", "/certificates/web/import?api-version=7.4", importBody(t, true))

		// Action
		code := vaultCall(t, fakes, "client-a", "POST", "/certificates/web/import?api-version=7.4", importBody(t, true))

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, 2, cp.State(t).Vaults["kv1"].Certificates["web"].Versions)
	})

	t.Run("should refuse a PEM without a private key", func(t *testing.T) {
		// Setup
		fakes, cp := newVaults(t, "client-b")

		// Action
		code := vaultCall(t, fakes, "client-b", "POST", "/certificates/web/import?api-version=7.4", importBody(t, false))

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Empty(t, cp.State(t).Vaults["kv1"].Certificates)
	})

	t.Run("should refuse to reuse a deleted name", func(t *testing.T) {
		// Setup
		fakes, cp := newVaults(t, "client-c")
		vaultCall(t, fakes, "client-c", "POST", "/certificates/web/import?api-version=7.4", importBody(t, true))
		vaultCall(t, fakes, "client-c", "DELETE", "/certificates/web?api-version=7.4", "")

		// Action
		code := vaultCall(t, fakes, "client-c", "POST", "/certificates/web/import?api-version=7.4", importBody(t, true))

		// Assert
		require.Equal(t, http.StatusConflict, code)
		require.Empty(t, cp.State(t).Vaults["kv1"].Certificates)
	})
}

func TestKeyVaultFake_List(t *testing.T) {
	t.Run("should return the remaining certificates through nextLink, even when the client asks for a larger page", func(t *testing.T) {
		// Setup
		fakes, _ := newVaults(t, "client-d")
		for _, name := range []string{"a", "b", "c"} {
			vaultCall(t, fakes, "client-d", "POST", "/certificates/"+name+"/import?api-version=7.4", importBody(t, true))
		}
		listPage := func(path string) (names []string, next *string) {
			req, err := http.NewRequestWithContext(t.Context(), "GET", fakes.URL+path, nil)
			require.NoError(t, err)
			req.Host = "kv1.vault.azure.net"
			req.Header.Set("Authorization", "Bearer azure-client-d")
			res, err := fakes.Client().Do(req)
			require.NoError(t, err)
			defer res.Body.Close()
			require.Equal(t, http.StatusOK, res.StatusCode)
			var page struct {
				Value    []struct{ ID string }
				NextLink *string
			}
			require.NoError(t, json.NewDecoder(res.Body).Decode(&page))
			for _, v := range page.Value {
				names = append(names, v.ID[strings.LastIndex(v.ID, "/")+1:])
			}
			return names, page.NextLink
		}
		first, next := listPage("/certificates?api-version=7.4&maxresults=25")
		require.NotNil(t, next)
		nextURL, err := url.Parse(*next)
		require.NoError(t, err)
		require.Equal(t, "kv1.vault.azure.net", nextURL.Host)

		// Action
		second, last := listPage(nextURL.RequestURI())

		// Assert
		require.Equal(t, []string{"a", "b"}, first)
		require.Equal(t, []string{"c"}, second)
		require.Nil(t, last)
	})
}
