// Package alicloud fakes Alibaba Cloud STS GetCallerIdentity, which Infisical calls with
// the signed parameters a workload sends for machine identity Alibaba Cloud auth.
//
// The access key id is the scope, and its secret is derived from it the way the AWS fake
// does, so a test signs with SecretFor and a wrong signature is refused here, as STS
// refuses one.
package alicloud

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

var Service = service{host: "sts.aliyuncs.com"}

type service struct{ host string }

func (s service) Host() string { return s.host }

func (service) Scope(r *http.Request) (string, bool) {
	akid := r.URL.Query().Get("AccessKeyId")
	return akid, akid != ""
}

func (service) New(_ fakenet.Emitter) fakenet.Fake {
	return &Account{}
}

// SecretFor is the access key secret that goes with an access key id a test invented.
func SecretFor(accessKeyID string) string {
	sum := sha256.Sum256([]byte("infisical-fake-alicloud/" + accessKeyID))
	return hex.EncodeToString(sum[:])[:30]
}

// Account says who an access key belongs to.
type Account struct {
	// Arn is the caller's ARN, acs:ram::<account>:user/<name>.
	Arn       string `json:"arn"`
	AccountID string `json:"accountId"`

	mu sync.Mutex
}

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("Action") != "GetCallerIdentity" {
		writeErr(w, http.StatusBadRequest, "InvalidAction.NotFound", "Specified api is not found")
		return
	}
	if !Verify(r.Method, q, SecretFor(q.Get("AccessKeyId"))) {
		writeErr(w, http.StatusBadRequest, "SignatureDoesNotMatch", "Specified signature is not matched with our calculation.")
		return
	}
	a.mu.Lock()
	arn, account := a.Arn, a.AccountID
	a.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"RequestId": "req-" + q.Get("SignatureNonce"), "AccountId": account, "Arn": arn,
		"UserId": "uid-" + q.Get("AccessKeyId"), "IdentityType": "RAMUser", "PrincipalId": "pid-" + q.Get("AccessKeyId"),
	})
}

// Sign computes the RPC signature (version 1.0, HMAC-SHA1) over params.
func Sign(method string, params url.Values, secret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k != "Signature" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, percentEncode(k)+"="+percentEncode(params.Get(k)))
	}
	toSign := method + "&" + percentEncode("/") + "&" + percentEncode(strings.Join(parts, "&"))
	mac := hmac.New(sha1.New, []byte(secret+"&"))
	mac.Write([]byte(toSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func Verify(method string, params url.Values, secret string) bool {
	return hmac.Equal([]byte(Sign(method, params, secret)), []byte(params.Get("Signature")))
}

func percentEncode(s string) string {
	e := url.QueryEscape(s)
	e = strings.ReplaceAll(e, "+", "%20")
	e = strings.ReplaceAll(e, "*", "%2A")
	return strings.ReplaceAll(e, "%7E", "~")
}

func writeErr(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"Code": code, "Message": message})
}

func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Arn       string `json:"arn"`
		AccountID string `json:"accountId"`
	}{a.Arn, a.AccountID})
}

func (a *Account) Seed(raw []byte) error {
	var in struct {
		Arn       string `json:"arn"`
		AccountID string `json:"accountId"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if in.Arn != "" {
		a.Arn = in.Arn
	}
	if in.AccountID != "" {
		a.AccountID = in.AccountID
	}
	return nil
}

// ControlPlane is a test's view of one access key.
type ControlPlane struct {
	*fakenet.Scope[Account]
	AccessKeyID string
}

// Open registers who an access key belongs to.
func Open(tt *testing.T, adminURL, accessKeyID, accountID, arn string) *ControlPlane {
	tt.Helper()
	cp := &ControlPlane{Scope: fakenet.Open[Account](tt, adminURL, Service.Host(), accessKeyID), AccessKeyID: accessKeyID}
	cp.Seed(tt, map[string]string{"arn": arn, "accountId": accountID})
	return cp
}
