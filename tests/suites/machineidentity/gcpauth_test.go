package machineidentity_test

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

func TestGcpAuth_GceLogin(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an instance in an allowed project and zone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpGce(t, tn, identityID, "fed-proj", "us-central1-a")

		// Action
		res := fedLoginGcp(t, tn, identityID, fedGceToken(t, identityID.String(), "fed-proj", "us-central1-a"))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	refusals := []struct {
		name, project, zone, message string
	}{
		{"should refuse an instance in a project outside the allowlist and issue no token", "other-proj", "us-central1-a", "Access denied: GCP project not allowed."},
		{"should refuse an instance in a zone outside the allowlist and issue no token", "fed-proj", "europe-west1-b", "Access denied: GCP zone not allowed."},
	}
	for _, c := range refusals {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			identityID := fedNewIdentity(t, tn)
			fedAttachGcpGce(t, tn, identityID, "fed-proj", "us-central1-a")

			// Action
			res := fedLoginGcp(t, tn, identityID, fedGceToken(t, identityID.String(), c.project, c.zone))

			// Assert
			fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
			require.Equal(t, c.message, apierr.Message(res.Body))
			fedRequireNeverLoggedIn(t, tn, identityID)
		})
	}

	t.Run("should refuse an ID token Google did not sign and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpGce(t, tn, identityID, "fed-proj", "us-central1-a")
		forged := fedSignJWT(t, fedRSAKey(t), oauth.GoogleSignOnKeyID, fedGceClaims(identityID.String(), "fed-proj", "us-central1-a"))

		// Action
		res := fedLoginGcp(t, tn, identityID, forged)

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid GCP ID token", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse an ID token minted for another audience and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := fedNewIdentity(t, tn)
		fedAttachGcpGce(t, tn, identityID, "fed-proj", "us-central1-a")

		// Action
		res := fedLoginGcp(t, tn, identityID, fedGceToken(t, uuid.NewString(), "fed-proj", "us-central1-a"))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid GCP ID token", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func fedAttachGcpGce(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, project, zone string) {
	t.Helper()
	res, err := tn.Admin.API.AttachGcpAuthWithResponse(t.Context(), identityID.String(), api.AttachGcpAuthJSONRequestBody{
		Type: api.AttachGcpAuthJSONBodyType("gce"), AllowedProjects: new(project), AllowedZones: new(zone),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching GCP auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// fedGceClaims are what a GCE instance's metadata server puts in an ID token requested
// with format=full.
func fedGceClaims(audience, project, zone string) map[string]any {
	email := "vm-" + id.Short() + "@" + project + ".iam.gserviceaccount.com"
	return fedClaims("https://accounts.google.com", email, audience, map[string]any{
		"email": email,
		"google": map[string]any{"compute_engine": map[string]any{
			"project_id": project, "zone": zone, "instance_id": id.Short(), "instance_name": "vm",
		}},
	})
}

// fedGceToken is an ID token signed with the key the Google fake publishes as a
// federated sign-on certificate.
func fedGceToken(t *testing.T, audience, project, zone string) string {
	t.Helper()
	return fedSignJWT(t, oauth.GoogleSignOnKey(), oauth.GoogleSignOnKeyID, fedGceClaims(audience, project, zone))
}
