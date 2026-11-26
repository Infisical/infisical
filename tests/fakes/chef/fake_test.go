package chef_test

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/chef"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

type client struct {
	t     *testing.T
	fakes *httptest.Server
	user  string
	key   *rsa.PrivateKey
}

func newUser(t *testing.T, user string) (*client, *chef.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, chef.Service)
	fakenet.Track(t, adminURL, chef.Service.Host(), user)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	cp := chef.Open(t, adminURL, user)
	cp.Seed(t, chef.WithUser("acme", string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))), chef.WithDataBag("certs"))
	return &client{t: t, fakes: fakes, user: user, key: key}, cp
}

// do signs a request with the version 1.3 headers, as Infisical's Chef client does.
func (c *client) do(method, path, body string, signer *rsa.PrivateKey) int {
	c.t.Helper()
	sum := sha256.Sum256([]byte(body))
	hash := base64.StdEncoding.EncodeToString(sum[:])
	ts := time.Now().UTC().Format("2006-01-02T15:04:05Z")
	canonical := strings.Join([]string{"Method:" + method, "Path:" + path, "X-Ops-Content-Hash:" + hash,
		"X-Ops-Sign:version=1.3", "X-Ops-Timestamp:" + ts, "X-Ops-UserId:" + c.user, "X-Ops-Server-API-Version:1"}, "\n")
	digest := sha256.Sum256([]byte(canonical))
	sig, err := rsa.SignPKCS1v15(rand.Reader, signer, crypto.SHA256, digest[:])
	require.NoError(c.t, err)
	req, err := http.NewRequestWithContext(c.t.Context(), method, c.fakes.URL+path, strings.NewReader(body))
	require.NoError(c.t, err)
	req.Host = chef.Service.Host()
	req.Header.Set("X-Ops-UserId", c.user)
	req.Header.Set("X-Ops-Sign", "version=1.3")
	req.Header.Set("X-Ops-Timestamp", ts)
	req.Header.Set("X-Ops-Content-Hash", hash)
	req.Header.Set("X-Ops-Server-API-Version", "1")
	encoded := base64.StdEncoding.EncodeToString(sig)
	for i := 0; i*60 < len(encoded); i++ {
		req.Header.Set("X-Ops-Authorization-"+strconv.Itoa(i+1), encoded[i*60:min((i+1)*60, len(encoded))])
	}
	res, err := c.fakes.Client().Do(req)
	require.NoError(c.t, err)
	_ = res.Body.Close()
	return res.StatusCode
}

func TestChefFake_DataBagItems(t *testing.T) {
	t.Run("should store a created item and replace it on update", func(t *testing.T) {
		// Setup
		c, cp := newUser(t, "user-a")
		c.do("POST", "/organizations/acme/data/certs", `{"id":"web","certificate":"one"}`, c.key)

		// Action
		code := c.do("PUT", "/organizations/acme/data/certs/web", `{"id":"web","certificate":"two"}`, c.key)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, "two", cp.State(t).DataBags["certs"]["web"]["certificate"])
	})

	t.Run("should refuse a request signed with another key", func(t *testing.T) {
		// Setup
		c, cp := newUser(t, "user-b")
		other, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)

		// Action
		code := c.do("POST", "/organizations/acme/data/certs", `{"id":"web"}`, other)

		// Assert
		require.Equal(t, http.StatusUnauthorized, code)
		require.Empty(t, cp.State(t).DataBags["certs"])
	})

	t.Run("should refuse an item in a data bag that does not exist", func(t *testing.T) {
		// Setup
		c, cp := newUser(t, "user-c")

		// Action
		code := c.do("POST", "/organizations/acme/data/missing", `{"id":"web"}`, c.key)

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.NotContains(t, cp.State(t).DataBags, "missing")
	})
}
