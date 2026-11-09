package aws

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// STSAccount answers who a credential is. It holds no state of its own beyond the
// policy: whether a key is valid is the keyring's to say.
type STSAccount struct {
	Policy

	mu sync.Mutex
	h  handler
}

func newSTS(svc service, _ fakenet.Emitter) fakenet.Fake {
	a := &STSAccount{}
	a.h = handler{svc: svc, mu: &a.mu, policy: func() *Policy { return &a.Policy }, actions: map[string]func(call) (any, *apiError){
		"GetCallerIdentity": a.getCallerIdentity,
		"AssumeRole":        a.assumeRole,
	}}
	return a
}

func (a *STSAccount) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.h.serve(w, r) }

func (a *STSAccount) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(a.Policy)
}

func (a *STSAccount) Seed(raw []byte) error {
	var in Policy
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.merge(in)
	return nil
}

// getCallerIdentity names the IAM user a key IAM issued belongs to, and a user called
// infisical for a credential a test invented.
func (a *STSAccount) getCallerIdentity(c call) (any, *apiError) {
	user := "infisical"
	if k, ok := lookupKey(c.accessKeyID); ok && k.user != "" {
		user = k.user
	}
	return struct {
		Arn     string `xml:"Arn" json:"Arn"`
		UserID  string `xml:"UserId" json:"UserId"`
		Account string `xml:"Account" json:"Account"`
	}{"arn:aws:iam::" + c.account() + ":user/" + user, "AIDA" + randomBase32(16), c.account()}, nil
}

// assumeRole hands back credentials for the role the caller names. It does not check a
// trust policy or the External ID: a test about those has nothing to say here, so the
// role is assumable by whoever signs a valid request. The credentials belong to the
// caller's account, as an issued key does, so STS accepts them afterwards.
func (a *STSAccount) assumeRole(c call) (any, *apiError) {
	roleArn := c.form.Get("RoleArn")
	role, ok := strings.CutPrefix(roleArn[strings.LastIndex(roleArn, ":")+1:], "role/")
	if !strings.HasPrefix(roleArn, "arn:") || !ok || role == "" {
		return nil, errf(http.StatusBadRequest, "ValidationError", "%q is not a valid role ARN.", roleArn)
	}
	id, secret := issueKey(c.owner, "assumed-"+role[strings.LastIndex(role, "/")+1:])
	return assumeRoleResult{
		Credentials: sessionCredentials{
			AccessKeyID:     id,
			SecretAccessKey: secret,
			SessionToken:    randomBase64(120),
			Expiration:      now().Add(15 * time.Minute).Format(time.RFC3339),
		},
		AssumedRoleUser: assumedRoleUser{
			AssumedRoleID: "AROA" + randomBase32(16) + ":" + c.form.Get("RoleSessionName"),
			Arn:           roleArn,
		},
	}, nil
}

type assumeRoleResult struct {
	Credentials     sessionCredentials `xml:"Credentials"`
	AssumedRoleUser assumedRoleUser    `xml:"AssumedRoleUser"`
}

type sessionCredentials struct {
	AccessKeyID     string `xml:"AccessKeyId"`
	SecretAccessKey string `xml:"SecretAccessKey"`
	SessionToken    string `xml:"SessionToken"`
	Expiration      string `xml:"Expiration"`
}

type assumedRoleUser struct {
	AssumedRoleID string `xml:"AssumedRoleId"`
	Arn           string `xml:"Arn"`
}
