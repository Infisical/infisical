package aws

import (
	"encoding/json"
	"net/http"
	"sync"

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
		Arn     string `xml:"Arn"`
		UserID  string `xml:"UserId"`
		Account string `xml:"Account"`
	}{"arn:aws:iam::" + c.account() + ":user/" + user, "AIDA" + randomBase32(16), c.account()}, nil
}
