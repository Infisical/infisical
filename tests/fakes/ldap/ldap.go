// Package ldap fakes an LDAP directory for machine identity LDAP auth and LDAP SSO.
//
// LDAP is not HTTP, so the directory is served by its own listener in fakenet on port
// 389, under every hostname. Each test gets a directory of its own under a base DN that
// carries its scope, dc=<scope>,dc=ldap,dc=test, and every bind and search is routed to
// the directory its DN names. The directory is seeded over fakenet's admin API like any
// other fake, under the Host below.
package ldap

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// Port is where fakenet serves LDAP.
const Port = 389

// Service exists so a directory can be opened and seeded through fakenet's admin API.
// Nothing reaches it over HTTP.
var Service = service{host: "ldap.ldap.test"}

type service struct{ host string }

func (s service) Host() string { return s.host }

// URL is what an LDAP configuration points at.
func (s service) URL() string { return "ldap://" + s.host + ":389" }

func (service) Scope(*http.Request) (string, bool) { return "", false }

func (service) New(_ fakenet.Emitter) fakenet.Fake { return &Directory{} }

// BaseDN is the base of the directory a scope owns.
func BaseDN(scope string) string { return "dc=" + scope + ",dc=ldap,dc=test" }

// ScopeOf finds the scope a DN belongs to: the dc component before dc=ldap,dc=test.
func ScopeOf(dn string) string {
	parts := strings.Split(strings.ToLower(strings.ReplaceAll(dn, " ", "")), ",")
	for i := 0; i+2 < len(parts); i++ {
		if parts[i+1] == "dc=ldap" && parts[i+2] == "dc=test" && strings.HasPrefix(parts[i], "dc=") {
			return strings.TrimPrefix(parts[i], "dc=")
		}
	}
	return ""
}

// Directory is one test's LDAP tree.
type Directory struct {
	BindDN       string  `json:"bindDN"`
	BindPassword string  `json:"bindPassword"`
	Entries      []Entry `json:"entries"`

	mu sync.Mutex
}

// Entry is a person or group. A person with a Password can bind.
type Entry struct {
	DN         string              `json:"dn"`
	Password   string              `json:"password,omitempty"`
	Attributes map[string][]string `json:"attributes"`
}

func (d *Directory) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, "LDAP is not served over HTTP", http.StatusNotImplemented)
}

func (d *Directory) Snapshot() ([]byte, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return json.Marshal(struct {
		BindDN  string  `json:"bindDN"`
		Entries []Entry `json:"entries"`
	}{d.BindDN, d.Entries})
}

func (d *Directory) Seed(raw []byte) error {
	var in struct {
		BindDN       string  `json:"bindDN"`
		BindPassword string  `json:"bindPassword"`
		Entries      []Entry `json:"entries"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if in.BindDN != "" {
		d.BindDN, d.BindPassword = in.BindDN, in.BindPassword
	}
	d.Entries = append(d.Entries, in.Entries...)
	return nil
}

// Authenticate reports whether dn and password bind.
func (d *Directory) Authenticate(dn, password string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if password == "" {
		return false
	}
	if strings.EqualFold(dn, d.BindDN) {
		return password == d.BindPassword
	}
	for _, e := range d.Entries {
		if strings.EqualFold(e.DN, dn) {
			return e.Password != "" && e.Password == password
		}
	}
	return false
}

// Search returns the entries under base that match an equality filter, (attr=value),
// optionally wrapped in (&...) with more equality terms. (objectClass=*) matches all.
func (d *Directory) Search(base, filter string) []Entry {
	terms := parseFilter(filter)
	d.mu.Lock()
	defer d.mu.Unlock()
	var out []Entry
	for _, e := range d.Entries {
		if !strings.HasSuffix(strings.ToLower(e.DN), strings.ToLower(base)) {
			continue
		}
		if matches(e, terms) {
			out = append(out, e)
		}
	}
	return out
}

type term struct{ attr, value string }

func parseFilter(f string) []term {
	f = strings.TrimSpace(f)
	if strings.HasPrefix(f, "(&") {
		f = strings.TrimSuffix(strings.TrimPrefix(f, "(&"), ")")
	}
	var out []term
	for _, part := range strings.Split(f, ")") {
		part = strings.TrimPrefix(strings.TrimSpace(part), "(")
		if part == "" {
			continue
		}
		attr, value, ok := strings.Cut(part, "=")
		if ok {
			out = append(out, term{strings.ToLower(attr), value})
		}
	}
	return out
}

func matches(e Entry, terms []term) bool {
	for _, t := range terms {
		if t.value == "*" {
			continue
		}
		found := false
		for k, vs := range e.Attributes {
			if strings.ToLower(k) != t.attr {
				continue
			}
			for _, v := range vs {
				if strings.EqualFold(v, t.value) {
					found = true
				}
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// ControlPlane is a test's view of its own directory.
type ControlPlane struct {
	*fakenet.Scope[Directory]
	Key          string
	BaseDN       string
	BindDN       string
	BindPassword string
}

// Open creates a directory with a bind account, under a base DN only this test uses.
func Open(tt *testing.T, adminURL string) *ControlPlane {
	tt.Helper()
	scope := id.Nonce()
	base := BaseDN(scope)
	cp := &ControlPlane{
		Scope:        fakenet.Open[Directory](tt, adminURL, Service.Host(), scope),
		Key:          scope,
		BaseDN:       base,
		BindDN:       "cn=admin," + base,
		BindPassword: "bind-" + id.Short(),
	}
	cp.Scope.Seed(tt, map[string]any{"bindDN": cp.BindDN, "bindPassword": cp.BindPassword})
	return cp
}

// AddUser adds a person who can bind, under ou=people.
func (cp *ControlPlane) AddUser(tt *testing.T, uid, password string, attrs map[string][]string) string {
	tt.Helper()
	dn := "uid=" + uid + ",ou=people," + cp.BaseDN
	all := map[string][]string{"uid": {uid}, "objectClass": {"inetOrgPerson"}, "cn": {uid}}
	for k, v := range attrs {
		all[k] = v
	}
	cp.Scope.Seed(tt, map[string]any{"entries": []Entry{{DN: dn, Password: password, Attributes: all}}})
	return dn
}
