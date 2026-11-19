package machineidentity_test

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// fedNewIdentity creates an org identity with no auth method, so the method under test
// is the only way in.
func fedNewIdentity(t *testing.T, tn *harness.Tenant) uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
		Name: "fed-" + id.Short(), OrganizationId: tn.OrgID.String(), Role: new("member"),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating an identity returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Identity.Id
}

// fedPrincipal wraps a token a federated login issued, so project fixtures can grant it.
func fedPrincipal(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, token string) *harness.Principal {
	t.Helper()
	return &harness.Principal{
		Kind:  harness.MachineIdentity,
		ID:    identityID,
		Name:  "fed",
		Token: token,
		API:   tn.Client(t, token),
	}
}

func fedRequireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "body: %s", apierr.Body(body))
}

// fedRequireTokenWorks proves a token authenticates as an identity of this tenant.
func fedRequireTokenWorks(t *testing.T, tn *harness.Tenant, token string) {
	t.Helper()
	res, err := tn.Client(t, token).GetMachineIdentityDetailsWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "using the issued token returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Equal(t, tn.OrgID.String(), res.JSON200.IdentityDetails.Organization.Id)
}

// fedWaitTokenRefused polls until a token is refused, since revocation verdicts are
// cached per token.
func fedWaitTokenRefused(t *testing.T, tn *harness.Tenant, token string) (int, []byte) {
	t.Helper()
	client := tn.Client(t, token)
	var status int
	var body []byte
	wait.Until(t, "the token to be refused", func() bool {
		res, err := client.GetMachineIdentityDetailsWithResponse(t.Context())
		if err != nil {
			return false
		}
		status, body = res.StatusCode(), res.Body
		return status != http.StatusOK
	})
	return status, body
}

func fedIdentity(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) *api.GetMachineIdentityByIdResponse {
	t.Helper()
	res, err := tn.Admin.API.GetMachineIdentityByIdWithResponse(t.Context(), identityID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading identity %s returned %d: %s", identityID, res.StatusCode(), apierr.Body(res.Body))
	return res
}

// fedRequireNeverLoggedIn checks no login succeeded: a successful login records its
// method on the identity's org membership before the token is issued.
func fedRequireNeverLoggedIn(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) {
	t.Helper()
	got := fedIdentity(t, tn, identityID).JSON200.Identity.LastLoginAuthMethod
	require.Nilf(t, got, "the identity logged in with %v", got)
}

func fedAuthMethods(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) []string {
	t.Helper()
	return fedIdentity(t, tn, identityID).JSON200.Identity.Identity.AuthMethods
}

func fedRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return key
}

// fedSignJWT signs claims with RS256 under kid; an empty kid leaves the header without one.
func fedSignJWT(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	header := map[string]string{"alg": "RS256", "typ": "JWT"}
	if kid != "" {
		header["kid"] = kid
	}
	h, err := json.Marshal(header)
	require.NoError(t, err)
	p, err := json.Marshal(claims)
	require.NoError(t, err)
	unsigned := fedB64(h) + "." + fedB64(p)
	digest := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return unsigned + "." + fedB64(sig)
}

// fedClaims are the registered claims every test token carries, valid for five minutes.
func fedClaims(iss, sub, aud string, extra map[string]any) map[string]any {
	now := time.Now()
	claims := map[string]any{"iss": iss, "sub": sub, "aud": aud, "iat": now.Unix(), "nbf": now.Add(-time.Minute).Unix(), "exp": now.Add(5 * time.Minute).Unix()}
	for k, v := range extra {
		claims[k] = v
	}
	return claims
}

// fedSelfSignedCert returns a self-signed certificate over key, DER encoded.
func fedSelfSignedCert(t *testing.T, key *rsa.PrivateKey, cn string) []byte {
	t.Helper()
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return der
}

func fedB64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func fedTrustedIPs(cidrs ...string) *[]struct {
	IpAddress string `json:"ipAddress"`
} {
	out := make([]struct {
		IpAddress string `json:"ipAddress"`
	}, 0, len(cidrs))
	for _, c := range cidrs {
		out = append(out, struct {
			IpAddress string `json:"ipAddress"`
		}{IpAddress: c})
	}
	return &out
}

// fedJSON encodes a request body by hand, for union bodies the generated types cannot carry.
func fedJSON(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}
