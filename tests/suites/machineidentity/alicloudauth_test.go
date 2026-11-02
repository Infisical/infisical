package machineidentity_test

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/alicloud"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const fedAliCloudAccount = "1234567890123456"

func TestAliCloudAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an access key whose caller ARN is allowed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid, arn := fedNewAliCloudKey(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachAliCloud(t, tn, identityID, arn)

		// Action
		res := fedLoginAliCloud(t, tn, identityID, akid)

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a caller ARN outside the allowlist and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid, _ := fedNewAliCloudKey(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachAliCloud(t, tn, identityID, "acs:ram::"+fedAliCloudAccount+":user/someone-else")

		// Action
		res := fedLoginAliCloud(t, tn, identityID, akid)

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: Alibaba Cloud account ARN not allowed.", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no Alibaba Cloud auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid, _ := fedNewAliCloudKey(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginAliCloud(t, tn, identityID, akid)

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "Alibaba Cloud auth method not found for identity, did you configure Alibaba Cloud auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

// fedNewAliCloudKey registers an access key with STS and returns it with its caller ARN.
func fedNewAliCloudKey(t *testing.T, tn *harness.Tenant) (akid, arn string) {
	t.Helper()
	akid = id.Nonce()
	arn = "acs:ram::" + fedAliCloudAccount + ":user/" + akid
	alicloud.Open(t, fixture.FakenetAdmin(t, tn), akid, fedAliCloudAccount, arn)
	return akid, arn
}

func fedAttachAliCloud(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, arns string) {
	t.Helper()
	res, err := tn.Admin.API.AttachAlicloudAuthWithResponse(t.Context(), identityID.String(),
		api.AttachAlicloudAuthJSONRequestBody{AllowedArns: arns})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching Alibaba Cloud auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// fedLoginAliCloud sends the signed GetCallerIdentity parameters a workload would.
func fedLoginAliCloud(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, akid string) *api.LoginWithAlicloudAuthResponse {
	t.Helper()
	params := url.Values{
		"Action":           {"GetCallerIdentity"},
		"Format":           {"JSON"},
		"Version":          {"2015-04-01"},
		"AccessKeyId":      {akid},
		"SignatureMethod":  {"HMAC-SHA1"},
		"Timestamp":        {time.Now().UTC().Format("2006-01-02T15:04:05Z")},
		"SignatureVersion": {"1.0"},
		"SignatureNonce":   {id.Nonce()},
	}
	body := map[string]any{"identityId": identityID.String(), "Signature": alicloud.Sign(http.MethodGet, params, alicloud.SecretFor(akid))}
	for k := range params {
		body[k] = params.Get(k)
	}
	res, err := tn.Anonymous(t).LoginWithAlicloudAuthWithBodyWithResponse(t.Context(), "application/json", fedJSON(t, body))
	require.NoError(t, err)
	return res
}
