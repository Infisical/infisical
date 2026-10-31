package machineidentity_test

import (
	"crypto/rsa"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const fedAzureResource = "https://management.azure.com/"

func TestAzureAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an allowed service principal's managed identity token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		entra := fedNewEntraTenant(t, tn)
		principal := uuid.NewString()
		identityID := fedNewIdentity(t, tn)
		fedAttachAzure(t, tn, identityID, entra.tenantID, principal)

		// Action
		res := fedLoginAzure(t, tn, identityID, entra.sign(t, entra.kid, entra.tenantID, principal, fedAzureResource))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a service principal outside the allowlist and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		entra := fedNewEntraTenant(t, tn)
		principal := uuid.NewString()
		identityID := fedNewIdentity(t, tn)
		fedAttachAzure(t, tn, identityID, entra.tenantID, uuid.NewString())

		// Action
		res := fedLoginAzure(t, tn, identityID, entra.sign(t, entra.kid, entra.tenantID, principal, fedAzureResource))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Service principal '"+principal+"' not allowed", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a token whose tid names another tenant and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		entra := fedNewEntraTenant(t, tn)
		principal := uuid.NewString()
		identityID := fedNewIdentity(t, tn)
		fedAttachAzure(t, tn, identityID, entra.tenantID, principal)

		// Action
		res := fedLoginAzure(t, tn, identityID, entra.sign(t, entra.kid, uuid.NewString(), principal, fedAzureResource))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Tenant ID mismatch", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a token issued for another resource and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		entra := fedNewEntraTenant(t, tn)
		principal := uuid.NewString()
		identityID := fedNewIdentity(t, tn)
		fedAttachAzure(t, tn, identityID, entra.tenantID, principal)

		// Action
		res := fedLoginAzure(t, tn, identityID, entra.sign(t, entra.kid, entra.tenantID, principal, "https://vault.azure.net"))

		// Assert
		fedRequireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "jwt audience invalid")
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a token signed by a key the tenant does not publish and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		entra := fedNewEntraTenant(t, tn)
		principal := uuid.NewString()
		identityID := fedNewIdentity(t, tn)
		fedAttachAzure(t, tn, identityID, entra.tenantID, principal)

		// Action
		res := fedLoginAzure(t, tn, identityID, entra.sign(t, "unpublished-"+id.Short(), entra.tenantID, principal, fedAzureResource))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid signing key", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no Azure auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		entra := fedNewEntraTenant(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginAzure(t, tn, identityID, entra.sign(t, entra.kid, entra.tenantID, uuid.NewString(), fedAzureResource))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "Azure auth method not found for identity, did you configure Azure Auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

// fedEntraTenant is an Entra tenant whose signing certificate the Azure fake publishes.
type fedEntraTenant struct {
	tenantID string
	kid      string
	key      *rsa.PrivateKey
}

func fedNewEntraTenant(t *testing.T, tn *harness.Tenant) *fedEntraTenant {
	t.Helper()
	e := &fedEntraTenant{tenantID: id.Nonce(), kid: "k-" + id.Short(), key: fedRSAKey(t)}
	azure.Open(t, fixture.FakenetAdmin(t, tn), e.tenantID).Publish(t, e.kid,
		base64.StdEncoding.EncodeToString(fedSelfSignedCert(t, e.key, "login.microsoftonline.com")))
	return e
}

// sign mints a managed identity token issued by this tenant's STS, naming tid as the
// tenant and oid as the service principal.
func (e *fedEntraTenant) sign(t *testing.T, kid, tid, oid, resource string) string {
	t.Helper()
	return fedSignJWT(t, e.key, kid, fedClaims("https://sts.windows.net/"+e.tenantID+"/", oid, resource,
		map[string]any{"tid": tid, "oid": oid}))
}

func fedAttachAzure(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, tenantID, principals string) {
	t.Helper()
	res, err := tn.Admin.API.AttachAzureAuthWithResponse(t.Context(), identityID.String(), api.AttachAzureAuthJSONRequestBody{
		TenantId: tenantID, Resource: fedAzureResource, AllowedServicePrincipalIds: new(principals),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching Azure auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginAzure(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, jwt string) *api.LoginWithAzureAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithAzureAuthWithResponse(t.Context(), api.LoginWithAzureAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: jwt,
	})
	require.NoError(t, err)
	return res
}
