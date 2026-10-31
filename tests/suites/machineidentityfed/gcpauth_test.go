package machineidentityfed_test

import (
	"crypto/rsa"
	"encoding/pem"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// GCE identity tokens are verified against Google's global oauth2/v1/certs, which carry
// no credential fakenet could scope per test, so only the iam type is covered here.
func TestGcpAuth_IamLogin(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an allowed service account's signed JWT", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sa := fedNewServiceAccount(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpIam(t, tn, identityID, sa.email)

		// Action
		res := fedLoginGcp(t, tn, identityID, sa.sign(t, sa.kid, identityID.String()))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a service account outside the allowlist and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sa := fedNewServiceAccount(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpIam(t, tn, identityID, "someone-else@fed-proj.iam.gserviceaccount.com")

		// Action
		res := fedLoginGcp(t, tn, identityID, sa.sign(t, sa.kid, identityID.String()))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: GCP service account not allowed.", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a JWT minted for another audience and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sa := fedNewServiceAccount(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpIam(t, tn, identityID, sa.email)

		// Action
		res := fedLoginGcp(t, tn, identityID, sa.sign(t, sa.kid, uuid.NewString()))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid audience in GCP IAM Token", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a JWT signed by a key the service account does not publish and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sa := fedNewServiceAccount(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpIam(t, tn, identityID, sa.email)

		// Action
		res := fedLoginGcp(t, tn, identityID, sa.sign(t, "unpublished-"+id.Short(), identityID.String()))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "No matching signing key found for the GCP IAM token", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no GCP auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sa := fedNewServiceAccount(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginGcp(t, tn, identityID, sa.sign(t, sa.kid, identityID.String()))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "GCP auth method not found for identity, did you configure GCP auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

// fedServiceAccount is a GCP service account whose signing certificate the Google fake
// publishes, the way a workload's iam.signJwt key is published.
type fedServiceAccount struct {
	email string
	kid   string
	key   *rsa.PrivateKey
}

func fedNewServiceAccount(t *testing.T, tn *harness.Tenant) *fedServiceAccount {
	t.Helper()
	sa := &fedServiceAccount{email: id.Nonce() + "@fed-proj.iam.gserviceaccount.com", kid: id.Short() + id.Short(), key: fedRSAKey(t)}
	cert := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: fedSelfSignedCert(t, sa.key, sa.email)})
	oauth.Open(t, fixture.FakenetAdmin(t, tn), oauth.Google, sa.email).Seed(t, oauth.Grant{Certs: map[string]string{sa.kid: string(cert)}})
	return sa
}

func (sa *fedServiceAccount) sign(t *testing.T, kid, audience string) string {
	t.Helper()
	return fedSignJWT(t, sa.key, kid, fedClaims(sa.email, sa.email, audience, nil))
}

func fedAttachGcpIam(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, serviceAccounts string) {
	t.Helper()
	res, err := tn.Admin.API.AttachGcpAuthWithResponse(t.Context(), identityID.String(), api.AttachGcpAuthJSONRequestBody{
		Type: api.AttachGcpAuthJSONBodyType("iam"), AllowedServiceAccounts: new(serviceAccounts),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching GCP auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginGcp(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, jwt string) *api.LoginWithGcpAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithGcpAuthWithResponse(t.Context(), api.LoginWithGcpAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: jwt,
	})
	require.NoError(t, err)
	return res
}
