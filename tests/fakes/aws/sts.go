package aws

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// STSAccount answers who a credential is and hands out role sessions. It holds no state
// of its own beyond the policy: whether a key is valid is the keyring's to say, and
// whether a role may be assumed is the role's trust policy's.
type STSAccount struct {
	Policy

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

func newSTS(svc service, events fakenet.Emitter) fakenet.Fake {
	a := &STSAccount{events: events}
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

// getCallerIdentity names the IAM user a key IAM issued belongs to, the role session of
// a key STS issued, and a user called infisical for a credential a test invented.
func (a *STSAccount) getCallerIdentity(c call) (any, *apiError) {
	arn := "arn:aws:iam::" + c.account() + ":user/infisical"
	if k, ok := lookupKey(c.accessKeyID); ok && k.user != "" {
		arn = "arn:aws:iam::" + c.account() + ":user/" + k.user
		if strings.HasPrefix(k.user, "assumed-role/") {
			arn = "arn:aws:sts::" + c.account() + ":" + k.user
		}
	}
	return struct {
		Arn     string `xml:"Arn" json:"Arn"`
		UserID  string `xml:"UserId" json:"UserId"`
		Account string `xml:"Account" json:"Account"`
	}{arn, "AIDA" + randomBase32(16), c.account()}, nil
}

type xmlCredentials struct {
	AccessKeyID     string `xml:"AccessKeyId"`
	SecretAccessKey string `xml:"SecretAccessKey"`
	SessionToken    string `xml:"SessionToken"`
	Expiration      string `xml:"Expiration"`
}

type xmlAssumedRoleUser struct {
	AssumedRoleID string `xml:"AssumedRoleId"`
	Arn           string `xml:"Arn"`
}

// assumeRole issues a session for a role whose trust policy lets the caller's account
// in with the external ID it sent. A missing role and a policy that refuses the caller
// get the same AccessDenied, as on AWS, so a caller cannot probe which roles exist.
func (a *STSAccount) assumeRole(c call) (any, *apiError) {
	arn, session, externalID := c.form.Get("RoleArn"), c.form.Get("RoleSessionName"), c.form.Get("ExternalId")
	if arn == "" || session == "" {
		return nil, errf(http.StatusBadRequest, "ValidationError", "RoleArn and RoleSessionName are required")
	}
	duration := 3600
	if v := c.form.Get("DurationSeconds"); v != "" {
		d, err := strconv.Atoi(v)
		if err != nil || d < 900 || d > 43200 {
			return nil, errf(http.StatusBadRequest, "ValidationError",
				"1 validation error detected: Value '%s' at 'durationSeconds' failed to satisfy constraint: Member must have value between 900 and 43200", v)
		}
		duration = d
	}

	role, ok := lookupRole(arn)
	if !ok || !role.trusts(c.account(), externalID) {
		return nil, errf(http.StatusForbidden, "AccessDenied",
			"User: arn:aws:iam::%s:user/infisical is not authorized to perform: sts:AssumeRole on resource: %s", c.account(), arn)
	}

	user := "assumed-role/" + role.RoleName + "/" + session
	expires := now().Add(time.Duration(duration) * time.Second)
	id, secret, token := issueSessionKey(role.Owner, user, expires)
	a.events.Publish(RoleAssumed{RoleArn: arn, ExternalID: externalID})
	return struct {
		Credentials     xmlCredentials     `xml:"Credentials"`
		AssumedRoleUser xmlAssumedRoleUser `xml:"AssumedRoleUser"`
	}{
		xmlCredentials{id, secret, token, iso(expires)},
		xmlAssumedRoleUser{"AROA" + randomBase32(16) + ":" + session, "arn:aws:sts::" + AccountID(role.Owner) + ":" + user},
	}, nil
}
