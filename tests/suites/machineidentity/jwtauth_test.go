package machineidentity_test

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"maps"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	jwtIssuer   = "https://issuer.test"
	jwtAudience = "infisical"
	jwtSubject  = "workload"
)

func TestJwtAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for a JWT signed by a configured key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		key := rsaKey(t)
		identityID := jwtIdentity(t, tn, key)

		// Action
		res := jwtLogin(t, tn, identityID, signRS256(t, key, workloadClaims(nil)))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		requireWorks(t, tn.Client(t, res.JSON200.AccessToken))
		require.Equal(t, "jwt-auth", *fedIdentity(t, tn, identityID).JSON200.Identity.LastLoginAuthMethod)
	})

	refusals := []struct {
		name    string
		status  int
		message string
		sign    func(t *testing.T, configured *rsa.PrivateKey) string
	}{
		{
			name: "should refuse a JWT signed by a key that is not configured", status: http.StatusUnauthorized,
			message: "JWT verification failed with all keys",
			sign: func(t *testing.T, _ *rsa.PrivateKey) string {
				return signRS256(t, rsaKey(t), workloadClaims(nil))
			},
		},
		{
			name: "should refuse a JWT from another issuer", status: http.StatusForbidden,
			message: "Access denied: issuer mismatch",
			sign: func(t *testing.T, key *rsa.PrivateKey) string {
				return signRS256(t, key, workloadClaims(map[string]any{"iss": "https://other-issuer.test"}))
			},
		},
		{
			name: "should refuse a JWT for another audience", status: http.StatusUnauthorized,
			message: "Access denied: token audience not allowed",
			sign: func(t *testing.T, key *rsa.PrivateKey) string {
				return signRS256(t, key, workloadClaims(map[string]any{"aud": "someone-else"}))
			},
		},
		{
			name: "should refuse a JWT for another subject", status: http.StatusForbidden,
			message: "Access denied: subject not allowed",
			sign: func(t *testing.T, key *rsa.PrivateKey) string {
				return signRS256(t, key, workloadClaims(map[string]any{"sub": "intruder"}))
			},
		},
		{
			name: "should refuse a JWT whose bound claim does not match", status: http.StatusUnauthorized,
			message: "Access denied: claim mismatch for field env",
			sign: func(t *testing.T, key *rsa.PrivateKey) string {
				return signRS256(t, key, workloadClaims(map[string]any{"env": "staging"}))
			},
		},
	}
	for _, tc := range refusals {
		t.Run(tc.name+" and issue no token", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			key := rsaKey(t)
			identityID := jwtIdentity(t, tn, key)

			// Action
			res := jwtLogin(t, tn, identityID, tc.sign(t, key))

			// Assert
			requireStatus(t, tc.status, res.StatusCode(), res.Body)
			require.Contains(t, string(res.Body), tc.message)
			require.Nil(t, res.JSON200)
			fedRequireNeverLoggedIn(t, tn, identityID)
		})
	}

	t.Run("should accept a JWT after its key is added and refuse it after the key is removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		original, added := rsaKey(t), rsaKey(t)
		identityID := jwtIdentity(t, tn, original)
		before := jwtLogin(t, tn, identityID, signRS256(t, added, workloadClaims(nil)))
		requireStatus(t, http.StatusUnauthorized, before.StatusCode(), before.Body)

		// Action
		updateJwtKeys(t, tn, identityID, original, added)
		withKey := jwtLogin(t, tn, identityID, signRS256(t, added, workloadClaims(nil)))
		updateJwtKeys(t, tn, identityID, original)
		withoutKey := jwtLogin(t, tn, identityID, signRS256(t, added, workloadClaims(nil)))

		// Assert
		requireStatus(t, http.StatusOK, withKey.StatusCode(), withKey.Body)
		requireStatus(t, http.StatusUnauthorized, withoutKey.StatusCode(), withoutKey.Body)
		require.Contains(t, string(withoutKey.Body), "JWT verification failed with all keys")
	})

	t.Run("should answer 404 to a login for an identity without the method configured", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t)

		// Action
		res := jwtLogin(t, tn, identity.ID, signRS256(t, rsaKey(t), workloadClaims(nil)))

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "JWT auth method not found for identity")
	})
}

func rsaKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return key
}

func publicKeyPEM(t *testing.T, key *rsa.PrivateKey) string {
	t.Helper()
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
}

// workloadClaims satisfies every binding jwtIdentity configures, with overrides applied.
func workloadClaims(overrides map[string]any) map[string]any {
	now := time.Now()
	c := map[string]any{
		"iss": jwtIssuer,
		"aud": jwtAudience,
		"sub": jwtSubject,
		"env": "prod",
		"iat": now.Unix(),
		"exp": now.Add(time.Minute).Unix(),
	}
	maps.Copy(c, overrides)
	return c
}

func signRS256(t *testing.T, key *rsa.PrivateKey, payload map[string]any) string {
	t.Helper()
	signing := encodeSegment(t, map[string]any{"alg": "RS256", "typ": "JWT"}) + "." + encodeSegment(t, payload)
	digest := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func jwtConfig(t *testing.T, keys ...*rsa.PrivateKey) map[string]any {
	t.Helper()
	pems := make([]string, 0, len(keys))
	for _, k := range keys {
		pems = append(pems, publicKeyPEM(t, k))
	}
	return map[string]any{
		"configurationType": "static",
		"publicKeys":        pems,
		"boundIssuer":       jwtIssuer,
		"boundAudiences":    jwtAudience,
		"boundSubject":      jwtSubject,
		"boundClaims":       map[string]string{"env": "prod"},
	}
}

// jwtIdentity creates an identity with JWT auth trusting key's static public key.
func jwtIdentity(t *testing.T, tn *harness.Tenant, key *rsa.PrivateKey) uuid.UUID {
	t.Helper()
	identityID := createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{})
	res, err := tn.Admin.API.AttachJwtAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json",
		jsonBody(t, jwtConfig(t, key)))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return identityID
}

func updateJwtKeys(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, keys ...*rsa.PrivateKey) {
	t.Helper()
	res, err := tn.Admin.API.UpdateJwtAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json",
		jsonBody(t, jwtConfig(t, keys...)))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}

func jwtLogin(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, token string) *api.LoginWithJwtAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithJwtAuthWithResponse(t.Context(), api.LoginWithJwtAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: token,
	})
	require.NoError(t, err)
	return res
}
