package machineidentity_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAwsAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an allowed account and a principal ARN matching a glob", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid := fedAccessKeyID()
		account := aws.AccountID(akid)
		identityID := fedNewIdentity(t, tn)
		fedAttachAws(t, tn, identityID, account, "arn:aws:iam::"+account+":user/*")

		// Action
		res := fedLoginAws(t, tn, identityID, fedSignedCallerIdentity(t, akid, "sts.amazonaws.com"))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse an account outside the allowlist and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid := fedAccessKeyID()
		identityID := fedNewIdentity(t, tn)
		fedAttachAws(t, tn, identityID, fedOtherAccount(aws.AccountID(akid)), "")

		// Action
		res := fedLoginAws(t, tn, identityID, fedSignedCallerIdentity(t, akid, "sts.amazonaws.com"))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: AWS account ID not allowed.", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a principal ARN outside the allowlist and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid := fedAccessKeyID()
		account := aws.AccountID(akid)
		identityID := fedNewIdentity(t, tn)
		fedAttachAws(t, tn, identityID, account, "arn:aws:iam::"+account+":role/*")

		// Action
		res := fedLoginAws(t, tn, identityID, fedSignedCallerIdentity(t, akid, "sts.amazonaws.com"))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: AWS principal ARN not allowed. [principal-arn=arn:aws:iam::"+account+":user/infisical]",
			apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refuse a request signed for a host that is not STS and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		akid := fedAccessKeyID()
		identityID := fedNewIdentity(t, tn)
		fedAttachAws(t, tn, identityID, aws.AccountID(akid), "")

		// Action
		res := fedLoginAws(t, tn, identityID, fedSignedCallerIdentity(t, akid, "sts.attacker.test"))

		// Assert
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Signed STS request has an invalid host header", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no AWS auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginAws(t, tn, identityID, fedSignedCallerIdentity(t, fedAccessKeyID(), "sts.amazonaws.com"))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "AWS auth method not found for identity, did you configure AWS auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

// fedAccessKeyID invents a credential the AWS fake derives a secret and an account for.
func fedAccessKeyID() string { return "AKIA" + strings.ToUpper(id.Nonce()) }

// fedOtherAccount is a 12-digit account that is not account.
func fedOtherAccount(account string) string {
	if account == "111111111111" {
		return "222222222222"
	}
	return "111111111111"
}

func fedAttachAws(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, accounts, arns string) {
	t.Helper()
	body := api.AttachAwsAuthJSONRequestBody{}
	if accounts != "" {
		body.AllowedAccountIds = new(accounts)
	}
	if arns != "" {
		body.AllowedPrincipalArns = new(arns)
	}
	res, err := tn.Admin.API.AttachAwsAuthWithResponse(t.Context(), identityID.String(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching AWS auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// fedSignedCallerIdentity is what a workload's SDK sends: an sts:GetCallerIdentity
// request SigV4-signed for us-east-1, as base64 JSON headers and a base64 body.
func fedSignedCallerIdentity(t *testing.T, akid, host string) api.LoginWithAwsAuthJSONRequestBody {
	t.Helper()
	const body = "Action=GetCallerIdentity&Version=2011-06-15"
	const contentType = "application/x-www-form-urlencoded"
	now := time.Now().UTC()
	amzDate, day := now.Format("20060102T150405Z"), now.Format("20060102")

	payload := sha256.Sum256([]byte(body))
	canonical := strings.Join([]string{
		http.MethodPost, "/", "",
		"content-type:" + contentType + "\nhost:" + host + "\nx-amz-date:" + amzDate + "\n",
		"content-type;host;x-amz-date",
		hex.EncodeToString(payload[:]),
	}, "\n")
	scope := day + "/us-east-1/sts/aws4_request"
	canonicalHash := sha256.Sum256([]byte(canonical))
	toSign := strings.Join([]string{"AWS4-HMAC-SHA256", amzDate, scope, hex.EncodeToString(canonicalHash[:])}, "\n")
	key := fedHMAC([]byte("AWS4"+aws.SecretAccessKey(akid)), day)
	key = fedHMAC(key, "us-east-1")
	key = fedHMAC(key, "sts")
	key = fedHMAC(key, "aws4_request")
	signature := hex.EncodeToString(fedHMAC(key, toSign))

	headers, err := json.Marshal(map[string]string{
		"Host":         host,
		"Content-Type": contentType,
		"X-Amz-Date":   amzDate,
		"Accept":       "application/json",
		"Authorization": "AWS4-HMAC-SHA256 Credential=" + akid + "/" + scope +
			", SignedHeaders=content-type;host;x-amz-date, Signature=" + signature,
	})
	require.NoError(t, err)
	return api.LoginWithAwsAuthJSONRequestBody{
		IamHttpRequestMethod: new(http.MethodPost),
		IamRequestBody:       base64.StdEncoding.EncodeToString([]byte(body)),
		IamRequestHeaders:    base64.StdEncoding.EncodeToString(headers),
	}
}

func fedLoginAws(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, signed api.LoginWithAwsAuthJSONRequestBody) *api.LoginWithAwsAuthResponse {
	t.Helper()
	signed.IdentityId = identityID.String()
	res, err := tn.Anonymous(t).LoginWithAwsAuthWithResponse(t.Context(), signed)
	require.NoError(t, err)
	return res
}

func fedHMAC(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}
