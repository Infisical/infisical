package aws_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// A fake is a plain http.Handler, so it is provable without Docker.
type rig struct {
	fakes *httptest.Server
	admin string
}

const keyPrefix = "awsfaketest"

func newRig(t *testing.T) *rig {
	t.Helper()
	srv := fakenet.New(aws.Services...)
	ca, err := fakenet.LoadOrCreateCA(filepath.Join(t.TempDir(), "ca.pem"))
	require.NoError(t, err)
	fakes := httptest.NewServer(srv)
	admin := httptest.NewServer(srv.Admin(ca))
	t.Cleanup(fakes.Close)
	t.Cleanup(admin.Close)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	require.NoError(t, fakenet.Listen(ctx, admin.URL, keyPrefix))
	return &rig{fakes: fakes, admin: admin.URL}
}

// account is a credential a test invented, signing with the secret the fake derives.
type account struct {
	r      *rig
	id     string
	secret string
	token  string
}

// accounts keeps ids distinct when several are made within one tick of a coarse clock.
var accounts atomic.Uint64

func (r *rig) account(t *testing.T) *account {
	t.Helper()
	id := fmt.Sprintf("%s%d%d", keyPrefix, time.Now().UnixNano(), accounts.Add(1))
	return &account{r: r, id: id, secret: aws.SecretAccessKey(id)}
}

func (a *account) as(id, secret string) *account { return &account{r: a.r, id: id, secret: secret} }

// send signs the way the SDK does: every header it sends, and the payload hash.
func (a *account) send(t *testing.T, host, svc, region string, headers map[string]string, body []byte) (int, []byte) {
	t.Helper()
	return a.sendAt(t, http.MethodPost, "/", host, svc, region, headers, body)
}

// sendAt is send for a REST service, which puts the operation in the method and path.
func (a *account) sendAt(t *testing.T, method, path, host, svc, region string, headers map[string]string, body []byte) (int, []byte) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, a.r.fakes.URL+path, bytes.NewReader(body))
	require.NoError(t, err)
	req.Host = host
	stamp := time.Now().UTC().Format("20060102T150405Z")
	req.Header.Set("X-Amz-Date", stamp)
	if a.token != "" {
		req.Header.Set("X-Amz-Security-Token", a.token)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	signed := []string{"content-type", "host", "x-amz-date"}
	if _, ok := headers["X-Amz-Target"]; ok {
		signed = append(signed, "x-amz-target")
	}
	var canon strings.Builder
	for _, h := range signed {
		v := req.Header.Get(h)
		if h == "host" {
			v = host
		}
		canon.WriteString(h + ":" + v + "\n")
	}
	payload := sha256.Sum256(body)
	canonical := strings.Join([]string{method, path, "", canon.String(), strings.Join(signed, ";"), hex.EncodeToString(payload[:])}, "\n")
	scope := stamp[:8] + "/" + region + "/" + svc + "/aws4_request"
	sum := sha256.Sum256([]byte(canonical))
	toSign := "AWS4-HMAC-SHA256\n" + stamp + "\n" + scope + "\n" + hex.EncodeToString(sum[:])
	key := mac([]byte("AWS4"+a.secret), stamp[:8])
	for _, part := range []string{region, svc, "aws4_request"} {
		key = mac(key, part)
	}
	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		a.id, scope, strings.Join(signed, ";"), hex.EncodeToString(mac(key, toSign))))

	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	out, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, out
}

func mac(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}

// json1 calls a JSON 1.1 action, as SSM and Secrets Manager are called.
func (a *account) json1(t *testing.T, host, svc, target string, in any) (int, map[string]any) {
	t.Helper()
	body, err := json.Marshal(in)
	require.NoError(t, err)
	status, raw := a.send(t, host, svc, aws.Region, map[string]string{
		"Content-Type": "application/x-amz-json-1.1",
		"X-Amz-Target": target,
	}, body)
	var out map[string]any
	require.NoErrorf(t, json.Unmarshal(raw, &out), "%s", raw)
	return status, out
}

func (a *account) ssm(t *testing.T, action string, in any) (int, map[string]any) {
	t.Helper()
	return a.json1(t, aws.SSM.Host(), "ssm", "AmazonSSM."+action, in)
}

func (a *account) secrets(t *testing.T, action string, in any) (int, map[string]any) {
	t.Helper()
	return a.json1(t, aws.SecretsManager.Host(), "secretsmanager", "secretsmanager."+action, in)
}

// query calls a Query action, as STS, IAM and CloudFormation are called.
func (a *account) query(t *testing.T, host, svc string, form url.Values) (int, string) {
	t.Helper()
	status, raw := a.send(t, host, svc, aws.Region,
		map[string]string{"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"}, []byte(form.Encode()))
	return status, string(raw)
}

func (a *account) iam(t *testing.T, action string, params ...string) (int, string) {
	t.Helper()
	form := url.Values{"Action": {action}, "Version": {"2010-05-08"}}
	for i := 0; i+1 < len(params); i += 2 {
		form.Set(params[i], params[i+1])
	}
	return a.query(t, aws.IAM.Host(), "iam", form)
}

func (a *account) callerIdentity(t *testing.T) (int, string) {
	t.Helper()
	return a.query(t, aws.STS.Host(), "sts", url.Values{"Action": {"GetCallerIdentity"}, "Version": {"2011-06-15"}})
}

func (a *account) kms(t *testing.T, action string, in any) (int, map[string]any) {
	t.Helper()
	return a.json1(t, aws.KMS.Host(), "kms", "TrentService."+action, in)
}

// assumeRole returns the session STS granted, or nil and the refusal's error code.
func (a *account) assumeRole(t *testing.T, roleArn, externalID string) (*account, string) {
	t.Helper()
	form := url.Values{"Action": {"AssumeRole"}, "Version": {"2011-06-15"}, "RoleArn": {roleArn}, "RoleSessionName": {"s"}}
	if externalID != "" {
		form.Set("ExternalId", externalID)
	}
	status, body := a.query(t, aws.STS.Host(), "sts", form)
	if status != http.StatusOK {
		return nil, errorCode(t, body)
	}
	var res struct {
		Result struct {
			Credentials struct {
				AccessKeyID     string `xml:"AccessKeyId"`
				SecretAccessKey string `xml:"SecretAccessKey"`
				SessionToken    string `xml:"SessionToken"`
			} `xml:"Credentials"`
		} `xml:"AssumeRoleResult"`
	}
	require.NoError(t, xml.Unmarshal([]byte(body), &res))
	c := res.Result.Credentials
	return &account{r: a.r, id: c.AccessKeyID, secret: c.SecretAccessKey, token: c.SessionToken}, ""
}

func (a *account) cp(t *testing.T) *aws.ControlPlane {
	t.Helper()
	fakenet.Track(t, a.r.admin, aws.STS.Host(), a.id)
	return aws.Open(t, a.r.admin, a.id)
}

func errorCode(t *testing.T, raw string) string {
	t.Helper()
	var out struct {
		Error struct {
			Code string `xml:"Code"`
		} `xml:"Error"`
	}
	require.NoErrorf(t, xml.Unmarshal([]byte(raw), &out), "%s", raw)
	return out.Error.Code
}

func TestAWSFake_Authentication(t *testing.T) {
	t.Run("should name the account when the request is signed with the derived secret", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)

		// Action
		status, body := a.callerIdentity(t)

		// Assert
		require.Equalf(t, http.StatusOK, status, "%s", body)
		require.Contains(t, body, "<Account>"+aws.AccountID(a.id)+"</Account>")
	})

	t.Run("should refuse with SignatureDoesNotMatch when the secret is wrong", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)

		// Action
		status, body := a.as(a.id, "not-the-secret").callerIdentity(t)

		// Assert
		require.Equal(t, http.StatusForbidden, status)
		require.Equal(t, "SignatureDoesNotMatch", errorCode(t, body))
	})

	t.Run("should refuse when the credential is scoped to another region", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)

		// Action
		status, raw := a.send(t, aws.STS.Host(), "sts", "eu-west-1",
			map[string]string{"Content-Type": "application/x-www-form-urlencoded"}, []byte("Action=GetCallerIdentity&Version=2011-06-15"))

		// Assert
		require.Equal(t, http.StatusForbidden, status)
		require.Contains(t, string(raw), "eu-west-1")
	})
}

func TestAWSFake_ParameterStore(t *testing.T) {
	t.Run("should page one level of a path and leave deeper parameters out", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		for i := range 25 {
			status, out := a.ssm(t, "PutParameter", map[string]any{
				"Name": fmt.Sprintf("/app/K%02d", i), "Value": "v", "Type": "SecureString", "Overwrite": true})
			require.Equalf(t, http.StatusOK, status, "%v", out)
		}
		a.ssm(t, "PutParameter", map[string]any{"Name": "/app/sub/DEEP", "Value": "v", "Type": "String"})

		// Action
		var names []string
		pages := 0
		token := ""
		for {
			in := map[string]any{"Path": "/app/", "Recursive": false, "WithDecryption": true, "MaxResults": 10}
			if token != "" {
				in["NextToken"] = token
			}
			status, out := a.ssm(t, "GetParametersByPath", in)
			require.Equalf(t, http.StatusOK, status, "%v", out)
			pages++
			for _, p := range out["Parameters"].([]any) {
				names = append(names, p.(map[string]any)["Name"].(string))
			}
			next, ok := out["NextToken"].(string)
			if !ok {
				break
			}
			token = next
		}

		// Assert
		require.Equal(t, 3, pages)
		require.Len(t, names, 25)
		require.NotContains(t, names, "/app/sub/DEEP")
	})

	t.Run("should store a root-level name without its leading slash", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		cp := a.cp(t)

		// Action
		status, out := a.ssm(t, "PutParameter", map[string]any{"Name": "/ROOT", "Value": "v", "Type": "SecureString"})

		// Assert
		require.Equalf(t, http.StatusOK, status, "%v", out)
		require.Contains(t, cp.Parameters(t), "ROOT")
		cp.SSM.ExpectEvent[aws.ParameterPut](t, func(e aws.ParameterPut) bool { return e.Name == "ROOT" })
	})

	t.Run("should refuse an empty value and an overwrite that was not asked for", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		a.ssm(t, "PutParameter", map[string]any{"Name": "/app/K", "Value": "first", "Type": "SecureString"})

		// Action
		emptyStatus, empty := a.ssm(t, "PutParameter", map[string]any{"Name": "/app/E", "Value": "", "Type": "SecureString"})
		againStatus, again := a.ssm(t, "PutParameter", map[string]any{"Name": "/app/K", "Value": "second", "Type": "SecureString"})

		// Assert
		require.Equal(t, http.StatusBadRequest, emptyStatus)
		require.Equal(t, "ValidationException", empty["__type"])
		require.Equal(t, http.StatusBadRequest, againStatus)
		require.Equal(t, "ParameterAlreadyExists", again["__type"])
	})

	t.Run("should refuse an action the policy denies with AccessDeniedException", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedParameter("/app/K", "v"), aws.Deny(aws.SSM, "ListTagsForResource"))

		// Action
		status, out := a.ssm(t, "ListTagsForResource", map[string]any{"ResourceType": "Parameter", "ResourceId": "/app/K"})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "AccessDeniedException", out["__type"])
	})
}

func TestAWSFake_SecretsManager(t *testing.T) {
	t.Run("should refuse a second create of one name and keep the first value", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		cp := a.cp(t)
		a.secrets(t, "CreateSecret", map[string]any{"Name": "app/db", "SecretString": "first"})

		// Action
		status, out := a.secrets(t, "CreateSecret", map[string]any{"Name": "app/db", "SecretString": "second"})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ResourceExistsException", out["__type"])
		require.Equal(t, "first", cp.Secrets(t)["app/db"].SecretString)
	})

	t.Run("should return values in a batch and name the ids it cannot find", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		a.secrets(t, "CreateSecret", map[string]any{"Name": "A", "SecretString": "1"})

		// Action
		status, out := a.secrets(t, "BatchGetSecretValue", map[string]any{"SecretIdList": []string{"A", "MISSING"}})

		// Assert
		require.Equalf(t, http.StatusOK, status, "%v", out)
		require.Len(t, out["SecretValues"], 1)
		require.Equal(t, "MISSING", out["Errors"].([]any)[0].(map[string]any)["SecretId"])
	})

	t.Run("should forget a secret at once when it is force deleted", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		cp := a.cp(t)
		a.secrets(t, "CreateSecret", map[string]any{"Name": "GONE", "SecretString": "1"})

		// Action
		a.secrets(t, "DeleteSecret", map[string]any{"SecretId": "GONE", "ForceDeleteWithoutRecovery": true})

		// Assert
		status, out := a.secrets(t, "DescribeSecret", map[string]any{"SecretId": "GONE"})
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "ResourceNotFoundException", out["__type"])
		cp.SecretsManager.ExpectEvent[aws.SecretDeleted](t, func(e aws.SecretDeleted) bool { return e.Name == "GONE" })
	})
}

func TestAWSFake_IAM(t *testing.T) {
	t.Run("should refuse a third access key with LimitExceeded", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		a.iam(t, "CreateUser", "UserName", "app")
		a.iam(t, "CreateAccessKey", "UserName", "app")
		a.iam(t, "CreateAccessKey", "UserName", "app")

		// Action
		status, body := a.iam(t, "CreateAccessKey", "UserName", "app")

		// Assert
		require.Equal(t, http.StatusConflict, status)
		require.Equal(t, "LimitExceeded", errorCode(t, body))
	})

	t.Run("should accept an issued key at STS until it is deleted", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		cp := a.cp(t)
		a.iam(t, "CreateUser", "UserName", "app")
		_, created := a.iam(t, "CreateAccessKey", "UserName", "app")
		var res struct {
			Result struct {
				AccessKey struct {
					AccessKeyID     string `xml:"AccessKeyId"`
					SecretAccessKey string `xml:"SecretAccessKey"`
				} `xml:"AccessKey"`
			} `xml:"CreateAccessKeyResult"`
		}
		require.NoError(t, xml.Unmarshal([]byte(created), &res))
		key := a.as(res.Result.AccessKey.AccessKeyID, res.Result.AccessKey.SecretAccessKey)
		liveStatus, live := key.callerIdentity(t)

		// Action
		a.iam(t, "DeleteAccessKey", "UserName", "app", "AccessKeyId", key.id)

		// Assert
		require.Equalf(t, http.StatusOK, liveStatus, "%s", live)
		require.Contains(t, live, "user/app", "an issued key names the user it belongs to")
		status, body := key.callerIdentity(t)
		require.Equal(t, http.StatusForbidden, status)
		require.Equal(t, "InvalidClientTokenId", errorCode(t, body))
		require.Empty(t, cp.User(t, "app").AccessKeys)
		require.Equal(t, 2, cp.STS.Received(t, "POST", "/"), "an issued key's calls belong to the account that created it")
	})

	t.Run("should refuse deleting a user that still holds keys", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		cp := a.cp(t)
		cp.Seed(t, aws.SeedUser("app", "AKIASEEDEDKEY0000001"))

		// Action
		status, body := a.iam(t, "DeleteUser", "UserName", "app")

		// Assert
		require.Equal(t, http.StatusConflict, status)
		require.Equal(t, "DeleteConflict", errorCode(t, body))
		require.NotNil(t, cp.User(t, "app"))
	})
}

func TestAWSFake_AssumeRole(t *testing.T) {
	// trustedRole seeds a KMS key and a role in customer's account that trusts caller's
	// account with the given external ID.
	trustedRole := func(t *testing.T, customer, caller *account, externalID string) (roleArn, keyID string) {
		t.Helper()
		keyID = uuid.NewString()
		customer.cp(t).Seed(t,
			aws.SeedRole(customer.id, "infisical-kms", aws.TrustPolicy(aws.AccountID(caller.id), externalID)),
			aws.SeedKey(keyID))
		return aws.RoleArn(customer.id, "infisical-kms"), keyID
	}

	t.Run("should grant a session that acts in the role's account when the external ID matches", func(t *testing.T) {
		// Setup
		r := newRig(t)
		customer, caller := r.account(t), r.account(t)
		roleArn, keyID := trustedRole(t, customer, caller, "org-1")
		callerCP := caller.cp(t)

		// Action
		session, refused := caller.assumeRole(t, roleArn, "org-1")

		// Assert
		require.Empty(t, refused)
		status, out := session.kms(t, "DescribeKey", map[string]any{"KeyId": keyID})
		require.Equalf(t, http.StatusOK, status, "%v", out)
		callerCP.STS.ExpectEvent[aws.RoleAssumed](t, func(e aws.RoleAssumed) bool {
			return e.RoleArn == roleArn && e.ExternalID == "org-1"
		})
	})

	t.Run("should refuse with AccessDenied and grant nothing when the external ID differs or is missing", func(t *testing.T) {
		// Setup
		r := newRig(t)
		customer, caller := r.account(t), r.account(t)
		roleArn, _ := trustedRole(t, customer, caller, "org-1")
		callerCP := caller.cp(t)

		// Action
		_, wrong := caller.assumeRole(t, roleArn, "org-2")
		_, missing := caller.assumeRole(t, roleArn, "")

		// Assert
		require.Equal(t, "AccessDenied", wrong)
		require.Equal(t, "AccessDenied", missing)
		callerCP.STS.ExpectNoEvent[aws.RoleAssumed](t, nil)
	})

	t.Run("should refuse an account the trust policy does not name even with the right external ID", func(t *testing.T) {
		// Setup
		r := newRig(t)
		customer, caller, stranger := r.account(t), r.account(t), r.account(t)
		roleArn, _ := trustedRole(t, customer, caller, "org-1")

		// Action
		_, refused := stranger.assumeRole(t, roleArn, "org-1")

		// Assert
		require.Equal(t, "AccessDenied", refused)
	})

	t.Run("should refuse a session key presented without its session token", func(t *testing.T) {
		// Setup
		r := newRig(t)
		customer, caller := r.account(t), r.account(t)
		roleArn, keyID := trustedRole(t, customer, caller, "org-1")
		session, _ := caller.assumeRole(t, roleArn, "org-1")

		// Action
		status, out := session.as(session.id, session.secret).kms(t, "DescribeKey", map[string]any{"KeyId": keyID})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "UnrecognizedClientException", out["__type"])
	})

	// trustStatement is one statement of a trust policy letting caller's account assume a
	// role with the given external ID.
	trustStatement := func(effect string, caller *account, externalID string) map[string]any {
		return map[string]any{
			"Effect":    effect,
			"Principal": map[string]any{"AWS": "arn:aws:iam::" + aws.AccountID(caller.id) + ":root"},
			"Action":    "sts:AssumeRole",
			"Condition": map[string]any{"StringEquals": map[string]any{"sts:ExternalId": externalID}},
		}
	}
	roleWithPolicy := func(t *testing.T, customer *account, statement any) string {
		t.Helper()
		doc, err := json.Marshal(map[string]any{"Version": "2012-10-17", "Statement": statement})
		require.NoError(t, err)
		customer.cp(t).Seed(t, aws.SeedRole(customer.id, "infisical-kms", string(doc)))
		return aws.RoleArn(customer.id, "infisical-kms")
	}

	t.Run("should grant a session when the trust policy's Statement is a single object", func(t *testing.T) {
		// Setup
		r := newRig(t)
		customer, caller := r.account(t), r.account(t)
		roleArn := roleWithPolicy(t, customer, trustStatement("Allow", caller, "org-1"))

		// Action
		_, refused := caller.assumeRole(t, roleArn, "org-1")

		// Assert
		require.Empty(t, refused)
	})

	t.Run("should refuse with AccessDenied when a Deny accompanies a matching Allow", func(t *testing.T) {
		// Setup
		r := newRig(t)
		customer, caller := r.account(t), r.account(t)
		roleArn := roleWithPolicy(t, customer, []any{
			trustStatement("Allow", caller, "org-1"),
			trustStatement("Deny", caller, "org-1"),
		})
		callerCP := caller.cp(t)

		// Action
		_, refused := caller.assumeRole(t, roleArn, "org-1")

		// Assert
		require.Equal(t, "AccessDenied", refused)
		callerCP.STS.ExpectNoEvent[aws.RoleAssumed](t, nil)
	})
}

func TestAWSFake_KMS(t *testing.T) {
	t.Run("should decrypt what it encrypted only in the account that holds the key", func(t *testing.T) {
		// Setup
		r := newRig(t)
		owner, other := r.account(t), r.account(t)
		keyID := uuid.NewString()
		owner.cp(t).Seed(t, aws.SeedKey(keyID))
		status, enc := owner.kms(t, "Encrypt", map[string]any{"KeyId": keyID, "Plaintext": []byte("data key")})
		require.Equalf(t, http.StatusOK, status, "%v", enc)

		// Action
		okStatus, dec := owner.kms(t, "Decrypt", map[string]any{"KeyId": keyID, "CiphertextBlob": enc["CiphertextBlob"]})
		otherStatus, refused := other.kms(t, "Decrypt", map[string]any{"CiphertextBlob": enc["CiphertextBlob"]})

		// Assert
		require.Equalf(t, http.StatusOK, okStatus, "%v", dec)
		plaintext, err := base64.StdEncoding.DecodeString(dec["Plaintext"].(string))
		require.NoError(t, err)
		require.Equal(t, "data key", string(plaintext))
		require.Equal(t, http.StatusBadRequest, otherStatus)
		require.Equal(t, "InvalidCiphertextException", refused["__type"])
	})

	t.Run("should refuse an encryption context it cannot bind to the ciphertext", func(t *testing.T) {
		// Setup
		r := newRig(t)
		a := r.account(t)
		keyID := uuid.NewString()
		a.cp(t).Seed(t, aws.SeedKey(keyID))
		status, enc := a.kms(t, "Encrypt", map[string]any{"KeyId": keyID, "Plaintext": []byte("data key")})
		require.Equalf(t, http.StatusOK, status, "%v", enc)
		ctx := map[string]string{"org": "A"}

		// Action
		encStatus, encOut := a.kms(t, "Encrypt", map[string]any{"KeyId": keyID, "Plaintext": []byte("data key"), "EncryptionContext": ctx})
		decStatus, decOut := a.kms(t, "Decrypt", map[string]any{"CiphertextBlob": enc["CiphertextBlob"], "EncryptionContext": ctx})

		// Assert
		require.Equal(t, http.StatusBadRequest, encStatus)
		require.Equal(t, "UnsupportedOperationException", encOut["__type"])
		require.Equal(t, http.StatusBadRequest, decStatus)
		require.Equal(t, "UnsupportedOperationException", decOut["__type"])
	})

	t.Run("should refuse a key the account does not hold with NotFoundException", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)

		// Action
		status, out := a.kms(t, "DescribeKey", map[string]any{"KeyId": uuid.NewString()})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "NotFoundException", out["__type"])
	})
}

func TestAWSFake_CloudFormation(t *testing.T) {
	t.Run("should report a seeded stack's status and refuse an unknown one", func(t *testing.T) {
		// Setup
		a := newRig(t).account(t)
		a.cp(t).Seed(t, aws.SeedStack("honey", "CREATE_COMPLETE"))
		describe := func(name string) (int, string) {
			return a.query(t, aws.CloudFormation.Host(), "cloudformation",
				url.Values{"Action": {"DescribeStacks"}, "Version": {"2010-05-15"}, "StackName": {name}})
		}

		// Action
		status, body := describe("honey")
		missingStatus, missing := describe("nope")

		// Assert
		require.Equalf(t, http.StatusOK, status, "%s", body)
		require.Contains(t, body, "<StackStatus>CREATE_COMPLETE</StackStatus>")
		require.Equal(t, http.StatusBadRequest, missingStatus)
		require.Equal(t, "ValidationError", errorCode(t, missing))
	})
}
