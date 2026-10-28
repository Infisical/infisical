package honeytokens_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	stackName          = "infisical-honey-tokens"
	accessKeyIDKey     = "AWS_ACCESS_KEY_ID"
	secretAccessKeyKey = "AWS_SECRET_ACCESS_KEY"
)

type env struct {
	tn         *harness.Tenant
	proj       *fixture.Project
	cp         *aws.ControlPlane
	signingKey string
}

type setupConfig struct {
	stackStatus string
}

type setupOption func(*setupConfig)

// stackIn seeds the CloudFormation stack in a status other than CREATE_COMPLETE, or
// leaves it out when the status is empty.
func stackIn(status string) setupOption { return func(c *setupConfig) { c.stackStatus = status } }

// setup returns a project and an organization whose AWS honey token configuration is
// saved against an AWS connection, with the stack deployed unless told otherwise.
func setup(t *testing.T, opts ...setupOption) env {
	t.Helper()
	cfg := setupConfig{stackStatus: "CREATE_COMPLETE"}
	for _, o := range opts {
		o(&cfg)
	}
	tn := harness.From(t).NewTenant(t)
	conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
	e := env{
		tn:         tn,
		proj:       fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager")),
		cp:         aws.Open(t, conn.FakenetAdmin(t), conn.Nonce()),
		signingKey: randomHex(t, 32),
	}
	if cfg.stackStatus != "" {
		e.cp.Seed(t, aws.SeedStack(stackName, cfg.stackStatus))
	}

	raw, err := json.Marshal(map[string]any{
		"connectionId": conn.ID,
		"config":       map[string]any{"webhookSigningKey": e.signingKey, "stackName": stackName, "awsRegion": aws.Region},
	})
	require.NoError(t, err)
	res, err := tn.Admin.API.UpsertAwsHoneyTokenConfigWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err, "saving the honey token configuration")
	require.Equalf(t, http.StatusOK, res.StatusCode(), "saving the honey token configuration: %s", apierr.Body(res.Body))
	return e
}

func randomHex(t *testing.T, n int) string {
	t.Helper()
	b := make([]byte, n)
	_, err := rand.Read(b)
	require.NoError(t, err)
	return hex.EncodeToString(b)
}

func (e env) create(t *testing.T) *api.CreateHoneyTokenResponse {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"projectId":      e.proj.ID,
		"type":           "aws",
		"name":           "ht-" + id.Short(),
		"environment":    "dev",
		"secretPath":     "/",
		"secretsMapping": map[string]string{"accessKeyId": accessKeyIDKey, "secretAccessKey": secretAccessKeyKey},
	})
	require.NoError(t, err)
	res, err := e.tn.Admin.API.CreateHoneyTokenWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err, "creating a honey token")
	return res
}

func (e env) newHoneyToken(t *testing.T) uuid.UUID {
	t.Helper()
	res := e.create(t)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating a honey token: %s", apierr.Body(res.Body))
	return res.JSON200.HoneyToken.Id
}

// planted is the value one mapped secret holds.
func (e env) planted(t *testing.T, key string) string {
	t.Helper()
	for _, s := range secretmanager.ListSecrets(t, e.proj, "dev") {
		if s.Key == key {
			return s.Value
		}
	}
	require.Failf(t, "mapped secret missing", "the mapped secret %s is missing", key)
	return ""
}

func (e env) secretKeys(t *testing.T) []string {
	t.Helper()
	keys := []string{}
	for _, s := range secretmanager.ListSecrets(t, e.proj, "dev") {
		keys = append(keys, s.Key)
	}
	return keys
}

// honeyUsers is the IAM users the account holds that a honey token created.
func (e env) honeyUsers(t *testing.T) map[string]*aws.User {
	t.Helper()
	out := map[string]*aws.User{}
	for name, u := range e.cp.IAM.State(t).Users {
		if strings.HasPrefix(name, "inf_ht_") {
			out[name] = u
		}
	}
	return out
}

// trigger posts the alert the deployed stack sends when someone uses the key, signed
// with the given key the way the stack signs it.
func (e env) trigger(t *testing.T, accessKeyID, signingKey string) *api.TriggerAwsHoneyTokenResponse {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"type": "aws",
		"event": map[string]any{
			"accessKeyId": accessKeyID,
			"eventName":   "GetCallerIdentity",
			"eventTime":   time.Now().UTC().Format(time.RFC3339),
			"awsRegion":   aws.Region,
			"sourceIp":    "203.0.113.7",
		},
	})
	require.NoError(t, err)
	stamp := fmt.Sprint(time.Now().Unix())
	m := hmac.New(sha256.New, []byte(signingKey))
	m.Write([]byte(stamp + "." + string(body)))
	signature := "t=" + stamp + ",v1=" + hex.EncodeToString(m.Sum(nil))

	withBody := func(_ context.Context, req *http.Request) error {
		req.Body = io.NopCloser(bytes.NewReader(body))
		req.ContentLength = int64(len(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Infisical-Signature", signature)
		return nil
	}
	res, err := e.tn.Anonymous(t).TriggerAwsHoneyTokenWithResponse(t.Context(), withBody)
	require.NoError(t, err, "triggering a honey token")
	return res
}

func (e env) status(t *testing.T, tokenID uuid.UUID) string {
	t.Helper()
	res, err := e.tn.Admin.API.GetHoneyTokenWithResponse(t.Context(), tokenID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading a honey token: %s", apierr.Body(res.Body))
	var out struct {
		HoneyToken struct {
			Status string `json:"status"`
		} `json:"honeyToken"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.HoneyToken.Status
}

func (e env) eventCount(t *testing.T, tokenID uuid.UUID) int {
	t.Helper()
	res, err := e.tn.Admin.API.ListHoneyTokenEventsWithResponse(t.Context(), tokenID, nil)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing honey token events: %s", apierr.Body(res.Body))
	var out struct {
		TotalCount int `json:"totalCount"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.TotalCount
}

func (e env) revoke(t *testing.T, tokenID uuid.UUID) *api.RevokeHoneyTokenResponse {
	t.Helper()
	res, err := e.tn.Admin.API.RevokeHoneyTokenWithResponse(t.Context(), tokenID)
	require.NoError(t, err, "revoking a honey token")
	return res
}
