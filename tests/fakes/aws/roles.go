package aws

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"
)

// Role is an IAM role and the trust policy that says who may assume it.
//
// Owner is the access key id of the account that holds the role: the role's ARN names
// that account, and the keys STS issues for it belong to it.
type Role struct {
	RoleName                 string    `json:"roleName"`
	Arn                      string    `json:"arn"`
	Owner                    string    `json:"owner"`
	AssumeRolePolicyDocument string    `json:"assumeRolePolicyDocument"`
	CreateDate               time.Time `json:"createDate"`
}

// RoleArn is the ARN of a role in the account an access key id addresses.
func RoleArn(accountKey, name string) string {
	return "arn:aws:iam::" + AccountID(accountKey) + ":role/" + name
}

// TrustPolicy lets one account assume a role, and only with the given external ID
// when it is not empty, as a customer's trust policy for a third party does.
func TrustPolicy(trustedAccountID, externalID string) string {
	stmt := map[string]any{
		"Effect":    "Allow",
		"Principal": map[string]any{"AWS": "arn:aws:iam::" + trustedAccountID + ":root"},
		"Action":    "sts:AssumeRole",
	}
	if externalID != "" {
		stmt["Condition"] = map[string]any{"StringEquals": map[string]any{"sts:ExternalId": externalID}}
	}
	doc, _ := json.Marshal(map[string]any{"Version": "2012-10-17", "Statement": []any{stmt}})
	return string(doc)
}

// roles is every account's roles by ARN. Process-wide for the same reason as the
// keyring: STS is scoped by the caller, and the role it is asked for lives in another
// account.
var roles = struct {
	mu    sync.Mutex
	byArn map[string]Role
}{byArn: map[string]Role{}}

func registerRole(r Role) {
	roles.mu.Lock()
	defer roles.mu.Unlock()
	roles.byArn[r.Arn] = r
}

func lookupRole(arn string) (Role, bool) {
	roles.mu.Lock()
	defer roles.mu.Unlock()
	r, ok := roles.byArn[arn]
	return r, ok
}

// stringList is a policy value that may be one string or a list of them.
type stringList []string

func (s *stringList) UnmarshalJSON(b []byte) error {
	var one string
	if err := json.Unmarshal(b, &one); err == nil {
		*s = []string{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(b, &many); err != nil {
		return fmt.Errorf("policy value is neither a string nor a list: %s", b)
	}
	*s = many
	return nil
}

type trustStatement struct {
	Effect    string
	Principal struct{ AWS stringList }
	Action    stringList
	Condition map[string]map[string]stringList
}

// statementList is a policy's Statement, which may be one statement or a list of them.
type statementList []trustStatement

func (s *statementList) UnmarshalJSON(b []byte) error {
	var one trustStatement
	if err := json.Unmarshal(b, &one); err == nil {
		*s = []trustStatement{one}
		return nil
	}
	var many []trustStatement
	if err := json.Unmarshal(b, &many); err != nil {
		return fmt.Errorf("policy Statement is neither a statement nor a list: %s", b)
	}
	*s = many
	return nil
}

// trusts evaluates the trust policy for an AssumeRole from an account carrying an
// external ID. Only the parts a third-party trust policy uses are understood: Allow
// statements with an AWS account principal and a StringEquals on sts:ExternalId.
// Anything else fails closed. On AWS an explicit Deny overrides every Allow, and denies
// are not evaluated here, so a policy holding any statement but an Allow refuses everyone.
func (r Role) trusts(callerAccount, externalID string) bool {
	var doc struct{ Statement statementList }
	if err := json.Unmarshal([]byte(r.AssumeRolePolicyDocument), &doc); err != nil {
		return false
	}
	allowed := false
	for _, s := range doc.Statement {
		if s.Effect != "Allow" {
			return false
		}
		if allowed || !slices.Contains(s.Action, "sts:AssumeRole") {
			continue
		}
		if !slices.ContainsFunc(s.Principal.AWS, func(p string) bool {
			return p == callerAccount || p == "arn:aws:iam::"+callerAccount+":root"
		}) {
			continue
		}
		allowed = conditionsHold(s.Condition, externalID)
	}
	return allowed
}

func conditionsHold(cond map[string]map[string]stringList, externalID string) bool {
	for op, keys := range cond {
		if op != "StringEquals" {
			return false
		}
		for key, values := range keys {
			if !strings.EqualFold(key, "sts:ExternalId") || !slices.Contains(values, externalID) {
				return false
			}
		}
	}
	return true
}
