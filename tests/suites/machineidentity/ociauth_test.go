package machineidentity_test

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oci"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOciAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an allowed user of the configured tenancy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := fedNewOciUser(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOci(t, tn, identityID, user.tenancy, user.name)

		// Action
		res := fedLoginOci(t, tn, identityID, user.signed(t, user.ocid, oci.Service.Host()))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a user of another tenancy and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := fedNewOciUser(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOci(t, tn, identityID, "ocid1.tenancy.oc1..other"+id.Short(), user.name)

		// Action
		res := fedLoginOci(t, tn, identityID, user.signed(t, user.ocid, oci.Service.Host()))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: OCI account isn't part of tenancy.", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a username outside the allowlist and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := fedNewOciUser(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOci(t, tn, identityID, user.tenancy, "someone-else")

		// Action
		res := fedLoginOci(t, tn, identityID, user.signed(t, user.ocid, oci.Service.Host()))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: OCI account username not allowed.", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a request signed by another user than the one named and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := fedNewOciUser(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOci(t, tn, identityID, user.tenancy, user.name)
		signed := user.signed(t, user.ocid, oci.Service.Host())
		signed.UserOcid = "ocid1.user.oc1..victim" + id.Short()

		// Action
		res := fedLoginOci(t, tn, identityID, signed)

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: the OCI user that signed the request does not match the provided user OCID.", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a request signed for a host that is not OCI identity and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := fedNewOciUser(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOci(t, tn, identityID, user.tenancy, user.name)

		// Action
		res := fedLoginOci(t, tn, identityID, user.signed(t, user.ocid, "attacker.test"))

		// Assert
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid OCI host format. Expected format: identity.<region>.oraclecloud.com", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no OCI auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := fedNewOciUser(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginOci(t, tn, identityID, user.signed(t, user.ocid, oci.Service.Host()))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "OCI auth method not found for identity, did you configure OCI auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

// fedOciUser is an OCI user whose API key's public half the OCI fake holds.
type fedOciUser struct {
	tenancy string
	ocid    string
	name    string
	keyID   string
	key     *rsa.PrivateKey
}

func fedNewOciUser(t *testing.T, tn *harness.Tenant) *fedOciUser {
	t.Helper()
	nonce := id.Nonce()
	u := &fedOciUser{
		tenancy: "ocid1.tenancy.oc1.." + nonce,
		ocid:    "ocid1.user.oc1.." + nonce,
		name:    "workload-" + id.Short(),
		key:     fedRSAKey(t),
	}
	u.keyID = u.tenancy + "/" + u.ocid + "/aa:bb:cc"
	der, err := x509.MarshalPKIXPublicKey(&u.key.PublicKey)
	require.NoError(t, err)
	oci.Open(t, fixture.FakenetAdmin(t, tn), u.keyID, u.ocid, u.name, u.tenancy,
		string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})))
	return u
}

// signed is what a workload sends: the headers of a GetUser request it signed for host.
func (u *fedOciUser) signed(t *testing.T, userOcid, host string) api.LoginWithOciAuthJSONRequestBody {
	t.Helper()
	date := time.Now().UTC().Format(http.TimeFormat)
	auth, err := oci.Authorization(u.key, u.keyID, "/20160918/users/"+userOcid, host, date)
	require.NoError(t, err)
	body := api.LoginWithOciAuthJSONRequestBody{UserOcid: userOcid}
	body.Headers.Authorization = auth
	body.Headers.Host = host
	body.Headers.Date = &date
	return body
}

func fedAttachOci(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, tenancy, usernames string) {
	t.Helper()
	res, err := tn.Admin.API.AttachOciAuthWithResponse(t.Context(), identityID.String(), api.AttachOciAuthJSONRequestBody{
		TenancyOcid: tenancy, AllowedUsernames: new(usernames),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching OCI auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginOci(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, signed api.LoginWithOciAuthJSONRequestBody) *api.LoginWithOciAuthResponse {
	t.Helper()
	signed.IdentityId = identityID.String()
	res, err := tn.Anonymous(t).LoginWithOciAuthWithResponse(t.Context(), signed)
	require.NoError(t, err)
	return res
}
