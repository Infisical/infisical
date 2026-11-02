// Package aws fakes the parts of AWS that Infisical calls: STS, SSM Parameter Store,
// Secrets Manager, IAM access keys and CloudFormation stacks.
//
// One fake for the provider, served on each hostname the SDK resolves. Each host is its
// own fakenet scope, so a test reads Parameter Store state from the SSM host and access
// keys from the IAM host. What AWS shares across services, the credentials IAM issues,
// lives in a keyring every host reads, so a key IAM deleted is refused by STS too.
//
// Requests are authenticated the way AWS does it: the SigV4 signature is checked
// against the secret for the access key id. A connection's secret is derived from its
// access key id (SecretAccessKey), and a key IAM issued is checked against the secret
// IAM handed out, so a product that stored the wrong half of a key pair fails here.
package aws

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Region is the only region served. A sync configured for another one reaches a host
// with no fake and fails with a 501 naming it.
const Region = "us-east-1"

var (
	STS            = service{host: "sts." + Region + ".amazonaws.com", name: "sts", region: Region, newFake: newSTS}
	SSM            = service{host: "ssm." + Region + ".amazonaws.com", name: "ssm", region: Region, newFake: newParameterStore}
	SecretsManager = service{host: "secretsmanager." + Region + ".amazonaws.com", name: "secretsmanager", region: Region, newFake: newSecretsManager}
	CloudFormation = service{host: "cloudformation." + Region + ".amazonaws.com", name: "cloudformation", region: Region, newFake: newCloudFormation}

	// IAM is global, and signed for us-east-1.
	IAM = service{host: "iam.amazonaws.com", name: "iam", region: "us-east-1", newFake: newIAM}
)

// Services is every AWS host fakenet answers for.
var Services = []fakenet.Service{STS, SSM, SecretsManager, IAM, CloudFormation}

type service struct {
	host    string
	name    string
	region  string
	newFake func(service, fakenet.Emitter) fakenet.Fake
}

func (s service) Host() string { return s.host }

// Scope is the account the signing key belongs to: the access key id itself for a
// credential a test invented, and the account that created it for a key IAM issued.
func (service) Scope(r *http.Request) (string, bool) {
	cred, ok := parseAuthorization(r.Header.Get("Authorization"))
	if !ok {
		return "", false
	}
	return owner(cred.accessKeyID), true
}

func (s service) New(events fakenet.Emitter) fakenet.Fake { return s.newFake(s, events) }

// SecretAccessKey is the secret that goes with an access key id a test invented. Derived
// rather than registered, so a connection can be created before fakenet has heard of
// its credential, and a wrong secret is refused the way AWS refuses one.
func SecretAccessKey(accessKeyID string) string {
	sum := sha256.Sum256([]byte("infisical-fake-aws/" + accessKeyID))
	return hex.EncodeToString(sum[:])[:40]
}

// AccountID is the 12-digit account an access key id belongs to.
func AccountID(credential string) string {
	sum := sha256.Sum256([]byte("infisical-fake-aws-account/" + owner(credential)))
	out := make([]byte, 12)
	for i := range out {
		out[i] = '0' + sum[i]%10
	}
	return string(out)
}

// issued is an access key IAM handed out.
type issued struct {
	owner  string
	user   string
	secret string
	active bool
}

// keyring is AWS's credential store, shared by every host. A process-wide value because
// fakenet builds one fake per host and scope, and IAM and STS have to agree on which
// keys exist.
var keyring = struct {
	mu   sync.Mutex
	keys map[string]*issued
}{keys: map[string]*issued{}}

func issueKey(ownerKey, user string) (id, secret string) {
	id = "AKIA" + randomBase32(16)
	secret = randomBase64(40)
	keyring.mu.Lock()
	defer keyring.mu.Unlock()
	keyring.keys[id] = &issued{owner: ownerKey, user: user, secret: secret, active: true}
	return id, secret
}

func revokeKey(id string) {
	keyring.mu.Lock()
	defer keyring.mu.Unlock()
	if k, ok := keyring.keys[id]; ok {
		k.active = false
	}
}

func lookupKey(id string) (issued, bool) {
	keyring.mu.Lock()
	defer keyring.mu.Unlock()
	k, ok := keyring.keys[id]
	if !ok {
		return issued{}, false
	}
	return *k, true
}

func owner(accessKeyID string) string {
	if k, ok := lookupKey(accessKeyID); ok {
		return k.owner
	}
	return accessKeyID
}

// Policy is what the credential is not allowed to do, as "<service>:<Action>", such as
// "ssm:ListTagsForResource". AWS answers those with AccessDenied, which is how a
// destination refuses a call for a reason a retry cannot fix.
type Policy struct {
	Denied []string `json:"denied,omitempty"`
}

func (p *Policy) denies(svc, action string) bool {
	return slices.Contains(p.Denied, svc+":"+action)
}

func (p *Policy) merge(in Policy) {
	for _, d := range in.Denied {
		if !slices.Contains(p.Denied, d) {
			p.Denied = append(p.Denied, d)
		}
	}
}

// call is one authenticated request.
type call struct {
	svc         service
	accessKeyID string
	owner       string
	action      string
	body        []byte
	form        url.Values
}

func (c call) account() string { return AccountID(c.owner) }

// apiError is an AWS error, rendered in whichever protocol the service speaks.
type apiError struct {
	status  int
	code    string
	message string
}

func (e *apiError) Error() string { return e.code + ": " + e.message }

func errf(status int, code, format string, args ...any) *apiError {
	return &apiError{status: status, code: code, message: fmt.Sprintf(format, args...)}
}

// authenticate checks a request the way AWS does before any action runs: a signature
// over the canonical request, a credential scope naming this service and region, and a
// key that is still active.
func authenticate(svc service, r *http.Request, body []byte) (string, *apiError) {
	cred, ok := parseAuthorization(r.Header.Get("Authorization"))
	if !ok {
		return "", errf(http.StatusForbidden, "MissingAuthenticationToken", "Request is missing Authentication Token")
	}
	if cred.service != svc.name || cred.region != svc.region {
		return "", errf(http.StatusForbidden, "SignatureDoesNotMatch",
			"Credential should be scoped to a valid region and service, not '%s/%s'. Expected %s/%s.",
			cred.region, cred.service, svc.region, svc.name)
	}

	secret := SecretAccessKey(cred.accessKeyID)
	if k, issuedByIAM := lookupKey(cred.accessKeyID); issuedByIAM {
		if !k.active {
			return "", invalidToken(svc)
		}
		secret = k.secret
	}

	want, canonical := signature(r, body, cred, secret)
	if want != cred.signature {
		return "", errf(http.StatusForbidden, "SignatureDoesNotMatch",
			"The request signature we calculated does not match the signature you provided. "+
				"Check your AWS Secret Access Key and signing method. The Canonical String for this request should have been\n'%s'", canonical)
	}
	return cred.accessKeyID, nil
}

func invalidToken(svc service) *apiError {
	if svc.json() {
		return errf(http.StatusBadRequest, "UnrecognizedClientException", "The security token included in the request is invalid.")
	}
	return errf(http.StatusForbidden, "InvalidClientTokenId", "The security token included in the request is invalid.")
}

func (s service) json() bool { return s.name == "ssm" || s.name == "secretsmanager" }

func (s service) targetPrefix() string {
	switch s.name {
	case "ssm":
		return "AmazonSSM."
	case "secretsmanager":
		return "secretsmanager."
	}
	return ""
}

// handler is one fake's dispatch table and the lock over its state.
type handler struct {
	svc     service
	mu      *sync.Mutex
	policy  func() *Policy
	actions map[string]func(call) (any, *apiError)
}

// serve authenticates, resolves the action, applies the policy and renders the answer
// in the service's protocol: JSON 1.1 with X-Amz-Target for SSM and Secrets Manager,
// Query in and XML out for the rest.
func (h handler) serve(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		h.fail(w, errf(http.StatusBadRequest, "SerializationException", "reading the body: %v", err))
		return
	}
	akid, aErr := authenticate(h.svc, r, body)
	if aErr != nil {
		h.fail(w, aErr)
		return
	}

	c := call{svc: h.svc, accessKeyID: akid, owner: owner(akid), body: body}
	if h.svc.json() {
		target, found := strings.CutPrefix(r.Header.Get("X-Amz-Target"), h.svc.targetPrefix())
		if !found {
			h.fail(w, errf(http.StatusBadRequest, "UnknownOperationException", "unknown target %q", r.Header.Get("X-Amz-Target")))
			return
		}
		c.action = target
	} else {
		form, pErr := url.ParseQuery(string(body))
		if pErr != nil {
			h.fail(w, errf(http.StatusBadRequest, "MalformedQueryString", "%v", pErr))
			return
		}
		c.form = form
		c.action = form.Get("Action")
	}

	fn, ok := h.actions[c.action]
	if !ok {
		h.fail(w, errf(http.StatusBadRequest, "InvalidAction", "The action %s is not valid for this endpoint.", c.action))
		return
	}

	h.mu.Lock()
	var out any
	if h.policy().denies(h.svc.name, c.action) {
		aErr = errf(http.StatusBadRequest, "AccessDeniedException",
			"User: arn:aws:iam::%s:user/infisical is not authorized to perform: %s:%s because no identity-based policy allows the %s:%s action",
			c.account(), h.svc.name, c.action, h.svc.name, c.action)
		if !h.svc.json() {
			aErr.status, aErr.code = http.StatusForbidden, "AccessDenied"
		}
	} else {
		out, aErr = fn(c)
	}
	h.mu.Unlock()

	if aErr != nil {
		h.fail(w, aErr)
		return
	}
	if h.svc.json() {
		writeJSON(w, http.StatusOK, out)
		return
	}
	writeQueryResult(w, h.svc, c.action, out)
}

func (h handler) fail(w http.ResponseWriter, e *apiError) {
	w.Header().Set("x-amzn-RequestId", requestID())
	if h.svc.json() {
		w.Header().Set("x-amzn-ErrorType", e.code)
		w.Header().Set("Content-Type", "application/x-amz-json-1.1")
		w.WriteHeader(e.status)
		_ = json.NewEncoder(w).Encode(map[string]string{"__type": e.code, "message": e.message})
		return
	}
	kind := "Sender"
	if e.status >= 500 {
		kind = "Receiver"
	}
	w.Header().Set("Content-Type", "text/xml")
	w.WriteHeader(e.status)
	_ = xml.NewEncoder(w).Encode(struct {
		XMLName xml.Name `xml:"ErrorResponse"`
		Xmlns   string   `xml:"xmlns,attr"`
		Error   struct {
			Type    string `xml:"Type"`
			Code    string `xml:"Code"`
			Message string `xml:"Message"`
		} `xml:"Error"`
		RequestID string `xml:"RequestId"`
	}{
		Xmlns: namespace(h.svc),
		Error: struct {
			Type    string `xml:"Type"`
			Code    string `xml:"Code"`
			Message string `xml:"Message"`
		}{kind, e.code, e.message},
		RequestID: requestID(),
	})
}

func namespace(s service) string {
	switch s.name {
	case "sts":
		return "https://sts.amazonaws.com/doc/2011-06-15/"
	case "iam":
		return "https://iam.amazonaws.com/doc/2010-05-08/"
	case "cloudformation":
		return "http://cloudformation.amazonaws.com/doc/2010-05-15/"
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/x-amz-json-1.1")
	w.Header().Set("x-amzn-RequestId", requestID())
	w.WriteHeader(status)
	if body == nil {
		body = struct{}{}
	}
	_ = json.NewEncoder(w).Encode(body)
}

// writeQueryResult wraps a result the way the Query protocol does:
// <ActionResponse><ActionResult>...</ActionResult><ResponseMetadata/></ActionResponse>.
func writeQueryResult(w http.ResponseWriter, svc service, action string, result any) {
	var inner bytes.Buffer
	if result != nil {
		enc := xml.NewEncoder(&inner)
		if err := enc.EncodeElement(result, xml.StartElement{Name: xml.Name{Local: action + "Result"}}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	w.Header().Set("Content-Type", "text/xml")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(w, `<%sResponse xmlns="%s">%s<ResponseMetadata><RequestId>%s</RequestId></ResponseMetadata></%sResponse>`,
		action, namespace(svc), inner.String(), requestID(), action)
}

func decodeJSON(c call, into any) *apiError {
	if len(c.body) == 0 {
		return nil
	}
	if err := json.Unmarshal(c.body, into); err != nil {
		return errf(http.StatusBadRequest, "SerializationException", "%v", err)
	}
	return nil
}

func epoch(t time.Time) float64 { return float64(t.UnixMilli()) / 1000 }

func requestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

func randomBase32(n int) string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

func randomBase64(n int) string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// now is second precision, as AWS reports creation dates.
func now() time.Time { return time.Now().UTC().Truncate(time.Second) }
