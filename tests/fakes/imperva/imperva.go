// Package imperva fakes the parts of Imperva Cloud WAF that Infisical calls: the
// websites of an account (api.imperva.com) and each website's custom certificates,
// uploaded through the provisioning API (my.imperva.com) and read back through the
// certificates API (api.imperva.com).
//
// Both hosts serve one account per API ID, so a certificate uploaded on one host is
// what the other reports. A request is refused unless its x-API-Key is the key that
// goes with its x-API-Id (APIKey).
package imperva

import (
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{ host string }

var (
	// Provisioning is the v2 provisioning API, which takes custom certificate uploads.
	Provisioning = service{host: "my.imperva.com"}
	// REST is the v3 API that lists websites and their certificates.
	REST = service{host: "api.imperva.com"}
)

func (s service) Host() string { return s.host }

// Scope is the API ID.
func (service) Scope(r *http.Request) (string, bool) {
	id := r.Header.Get("x-API-Id")
	return id, id != ""
}

// APIKey is the key that goes with an API ID a test invented.
func APIKey(apiID string) string {
	sum := sha256.Sum256([]byte("infisical-fake-imperva/" + apiID))
	return hex.EncodeToString(sum[:16])
}

// accounts is shared by both hosts: fakenet builds one fake per host and scope, and
// the two hosts have to agree on what a website holds. An account lives while either
// host's scope does.
var accounts = struct {
	mu sync.Mutex
	m  map[string]*accountState
}{m: map[string]*accountState{}}

type accountState struct {
	mu    sync.Mutex
	sites map[string]*Site
	refs  int // guarded by accounts.mu
}

func accountFor(apiID string) *accountState {
	accounts.mu.Lock()
	defer accounts.mu.Unlock()
	a, ok := accounts.m[apiID]
	if !ok {
		a = &accountState{sites: map[string]*Site{}}
		accounts.m[apiID] = a
	}
	a.refs++
	return a
}

// Release drops this host's hold on the account, and the account with the last one.
func (f *Account) Release() {
	accounts.mu.Lock()
	defer accounts.mu.Unlock()
	f.state.refs--
	if f.state.refs == 0 && accounts.m[f.apiID] == f.state {
		delete(accounts.m, f.apiID)
	}
}

func (s service) New(events fakenet.Emitter) fakenet.Fake {
	f := &Account{events: events, apiID: events.Scope(), state: accountFor(events.Scope())}
	f.mux = http.NewServeMux()
	if s.host == Provisioning.host {
		f.mux.HandleFunc("PUT /api/prov/v2/sites/{site}/customCertificate", f.upload)
		f.mux.HandleFunc("DELETE /api/prov/v2/sites/{site}/customCertificate", f.remove)
	} else {
		f.mux.HandleFunc("GET /sites-mgmt/v3/sites", f.listSites)
		f.mux.HandleFunc("GET /certificates-ui/v3/certificates", f.listCertificates)
	}
	return f
}

// Account is the test's view of one API ID's websites, the same from either host.
type Account struct {
	Sites map[string]*Site `json:"sites"`

	mux    *http.ServeMux
	events fakenet.Emitter
	apiID  string
	state  *accountState
}

// Site is a website and the custom certificate it holds for each key type.
type Site struct {
	Name    string   `json:"name"`
	Domains []string `json:"domains"`
	// Certificates maps a key type, RSA or ECC, to the custom certificate in that slot.
	Certificates map[string]*CustomCertificate `json:"certificates,omitempty"`
}

// CustomCertificate is an uploaded certificate, decoded from the base64 Imperva takes.
type CustomCertificate struct {
	Certificate string `json:"certificate"`
	PrivateKey  string `json:"privateKey"`
	// MismatchSite is set when the certificate covers some but not all of the site's
	// domains, which Imperva accepts but does not serve.
	MismatchSite bool `json:"mismatchSite"`
}

type CertificateDetail struct {
	Site     string `json:"site"`
	AuthType string `json:"authType"`
}

type CustomCertificateUploaded struct{ CertificateDetail }
type CustomCertificateDeleted struct{ CertificateDetail }

func (CustomCertificateUploaded) EventName() string { return "imperva.custom-certificate-uploaded" }
func (CustomCertificateDeleted) EventName() string  { return "imperva.custom-certificate-deleted" }

// WithSite is a seed fragment creating a website serving the given domains.
func WithSite(id, name string, domains ...string) any {
	return map[string]any{"sites": map[string]any{id: map[string]any{"name": name, "domains": domains}}}
}

func (f *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("x-API-Key") != APIKey(r.Header.Get("x-API-Id")) {
		apiError(w, http.StatusUnauthorized, "Unauthorized", "The API ID and API key do not match")
		return
	}
	f.mux.ServeHTTP(w, r)
}

func (f *Account) site(w http.ResponseWriter, id string) (*Site, bool) {
	s, ok := f.state.sites[id]
	if !ok {
		apiError(w, http.StatusNotFound, "Not Found", "Site "+id+" does not exist")
	}
	return s, ok
}

type uploadBody struct {
	Certificate string `json:"certificate"`
	PrivateKey  string `json:"private_key"`
	AuthType    string `json:"auth_type"`
}

func (f *Account) upload(w http.ResponseWriter, r *http.Request) {
	var in uploadBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apiError(w, http.StatusBadRequest, "Bad Request", "Invalid input")
		return
	}
	certPEM, certErr := base64.StdEncoding.DecodeString(in.Certificate)
	keyPEM, keyErr := base64.StdEncoding.DecodeString(in.PrivateKey)
	leaf, ok := firstCertificate(certPEM)
	if certErr != nil || keyErr != nil || !ok || !keyMatchesAuthType(leaf, in.AuthType) {
		apiError(w, http.StatusBadRequest, "Bad Request", "Invalid input")
		return
	}
	id := r.PathValue("site")
	f.state.mu.Lock()
	s, found := f.site(w, id)
	if !found {
		f.state.mu.Unlock()
		return
	}
	covered := 0
	for _, d := range s.Domains {
		if leaf.VerifyHostname(d) == nil {
			covered++
		}
	}
	if covered == 0 {
		f.state.mu.Unlock()
		apiError(w, http.StatusBadRequest, "Bad Request", "Invalid input")
		return
	}
	if s.Certificates == nil {
		s.Certificates = map[string]*CustomCertificate{}
	}
	s.Certificates[in.AuthType] = &CustomCertificate{Certificate: string(certPEM), PrivateKey: string(keyPEM), MismatchSite: covered < len(s.Domains)}
	f.state.mu.Unlock()
	f.events.Publish(CustomCertificateUploaded{CertificateDetail{Site: id, AuthType: in.AuthType}})
	writeJSON(w, http.StatusOK, map[string]any{"res": 0, "res_message": "OK"})
}

func (f *Account) remove(w http.ResponseWriter, r *http.Request) {
	id, authType := r.PathValue("site"), r.URL.Query().Get("auth_type")
	f.state.mu.Lock()
	s, found := f.site(w, id)
	if !found {
		f.state.mu.Unlock()
		return
	}
	_, held := s.Certificates[authType]
	delete(s.Certificates, authType)
	f.state.mu.Unlock()
	if !held {
		apiError(w, http.StatusNotFound, "Not Found", "The site has no "+authType+" custom certificate")
		return
	}
	f.events.Publish(CustomCertificateDeleted{CertificateDetail{Site: id, AuthType: authType}})
	writeJSON(w, http.StatusOK, map[string]any{"res": 0, "res_message": "OK"})
}

func (f *Account) listSites(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, size := 0, 10
	if raw := q.Get("page"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			apiError(w, http.StatusBadRequest, "Bad Request", "page must be a non-negative integer")
			return
		}
		page = n
	}
	if raw := q.Get("size"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 100 {
			apiError(w, http.StatusBadRequest, "Bad Request", "size must be between 1 and 100")
			return
		}
		size = n
	}
	f.state.mu.Lock()
	ids := slices.Sorted(maps.Keys(f.state.sites))
	start := len(ids)
	if page < len(ids) {
		start = min(page*size, len(ids))
	}
	end := min(start+size, len(ids))
	data := make([]map[string]any, 0, end-start)
	for _, id := range ids[start:end] {
		n, _ := strconv.Atoi(id)
		data = append(data, map[string]any{"id": n, "name": f.state.sites[id].Name, "siteStatus": "fully_configured"})
	}
	f.state.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"data": data, "meta": map[string]int{
		"page": page, "size": size, "totalElements": len(ids), "totalPages": (len(ids) + size - 1) / size,
	}})
}

func (f *Account) listCertificates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f.state.mu.Lock()
	s, found := f.site(w, q.Get("extSiteId"))
	if !found {
		f.state.mu.Unlock()
		return
	}
	data := []map[string]any{}
	if q.Get("certType") == "" || q.Get("certType") == "CUSTOM_CERT" {
		for authType, c := range s.Certificates {
			data = append(data, map[string]any{"authType": authType, "certType": "CUSTOM_CERT",
				"customCertificateDetails": map[string]any{"hasMismatchSite": c.MismatchSite}})
		}
	}
	f.state.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func firstCertificate(bundle []byte) (*x509.Certificate, bool) {
	block, _ := pem.Decode(bundle)
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, false
	}
	c, err := x509.ParseCertificate(block.Bytes)
	return c, err == nil
}

// keyMatchesAuthType applies Imperva's key rules: RSA under 4096 bits, or ECDSA P-256.
func keyMatchesAuthType(c *x509.Certificate, authType string) bool {
	switch k := c.PublicKey.(type) {
	case *rsa.PublicKey:
		return authType == "RSA" && k.N.BitLen() < 4096
	case *ecdsa.PublicKey:
		return authType == "ECC" && k.Curve.Params().Name == "P-256"
	}
	return false
}

func apiError(w http.ResponseWriter, status int, title, detail string) {
	writeJSON(w, status, map[string]any{"errors": []map[string]any{{"status": status, "title": title, "detail": detail}}})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (f *Account) Snapshot() ([]byte, error) {
	f.state.mu.Lock()
	defer f.state.mu.Unlock()
	return json.Marshal(Account{Sites: f.state.sites})
}

func (f *Account) Seed(raw []byte) error {
	var in Account
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	f.state.mu.Lock()
	defer f.state.mu.Unlock()
	for id, s := range in.Sites {
		f.state.sites[id] = s
	}
	return nil
}
