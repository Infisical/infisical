package oauth

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"maps"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// GCP's service account impersonation and Certificate Manager, on Google's real hosts.
//
// The instance signs a JWT with its own service account key and redeems it on
// www.googleapis.com (Google's token endpoint, which the client library hardcodes and
// Infisical cannot point elsewhere). IAM Credentials then mints a token for the account
// a GCP App Connection names, and Certificate Manager answers that token. Both hosts are
// scoped by the impersonated account's email, so parallel connections never share state.
var (
	GCPIAMCredentials     = gcpService{host: "iamcredentials.googleapis.com", newFake: newGCPIAM}
	GCPCertificateManager = gcpService{host: "certificatemanager.googleapis.com", newFake: newGCPCertificateManager}
)

const gcpTokenURL = "https://www.googleapis.com/oauth2/v4/token"

type gcpService struct {
	host    string
	newFake func(fakenet.Emitter) fakenet.Fake
}

func (s gcpService) Host() string { return s.host }

func (s gcpService) Scope(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return "", false
	}
	if s.host == GCPIAMCredentials.host {
		email, ok := impersonationTarget(r.URL.Path)
		return email, ok && gcpTokens.instance(token)
	}
	return gcpTokens.account(token)
}

func (s gcpService) New(events fakenet.Emitter) fakenet.Fake { return s.newFake(events) }

// gcpTokens are the access tokens Google issued. A process-wide value because the
// token endpoint, IAM Credentials and Certificate Manager are separate fakes that have
// to agree on which tokens exist, as aws's keyring does for access keys.
var gcpTokens = &tokenStore{issued: map[string]issuedToken{}}

// gcpTokenLifetime is how long Google's access tokens last.
const gcpTokenLifetime = time.Hour

type tokenStore struct {
	sync.Mutex
	issued map[string]issuedToken
}

type issuedToken struct {
	account string // the impersonated account, "" for the instance's own
	expires time.Time
}

// issue mints a token and drops the expired ones, so the store stays bounded by the
// tokens issued within one lifetime.
func (t *tokenStore) issue(account string) (string, time.Time) {
	token := "ya29." + id.Hex(16)
	now := time.Now()
	expires := now.Add(gcpTokenLifetime)
	t.Lock()
	defer t.Unlock()
	maps.DeleteFunc(t.issued, func(_ string, it issuedToken) bool { return !now.Before(it.expires) })
	t.issued[token] = issuedToken{account: account, expires: expires}
	return token, expires
}

func (t *tokenStore) lookup(token string) (issuedToken, bool) {
	t.Lock()
	defer t.Unlock()
	it, ok := t.issued[token]
	return it, ok && time.Now().Before(it.expires)
}

func (t *tokenStore) instance(token string) bool {
	it, ok := t.lookup(token)
	return ok && it.account == ""
}

func (t *tokenStore) account(token string) (string, bool) {
	it, ok := t.lookup(token)
	return it.account, ok && it.account != ""
}

func isJWTBearerGrant(r *http.Request) bool {
	return r.PostForm.Get("grant_type") == "urn:ietf:params:oauth:grant-type:jwt-bearer"
}

// googleToken answers Google's token endpoint: a service account's signed JWT for the
// instance key, and an authorization code for everything else.
func (g *Grant) googleToken(w http.ResponseWriter, r *http.Request) {
	if !isJWTBearerGrant(r) {
		g.token(GoogleClientID, GoogleClientSecret)(w, r)
		return
	}
	if err := verifyInstanceAssertion(r.PostForm.Get("assertion")); err != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant", "error_description": err})
		return
	}
	token, _ := gcpTokens.issue("")
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": token,
		"token_type":   "Bearer",
		"expires_in":   int(gcpTokenLifetime.Seconds()) - 1,
	})
}

// verifyInstanceAssertion checks the JWT the way Google does: RS256 over the instance
// key, issued by its service account, for the token endpoint, and not expired.
func verifyInstanceAssertion(assertion string) string {
	parts := strings.Split(assertion, ".")
	if len(parts) != 3 {
		return "Invalid JWT: Token must be a short-lived token and in a reasonable timeframe"
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "Invalid JWT Signature."
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(gcpInstancePublicKey(), crypto.SHA256, sum[:], sig) != nil {
		return "Invalid JWT Signature."
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "Invalid JWT: payload is not base64url"
	}
	var claims struct {
		Iss string `json:"iss"`
		Aud string `json:"aud"`
		Exp int64  `json:"exp"`
	}
	if json.Unmarshal(raw, &claims) != nil {
		return "Invalid JWT: payload is not JSON"
	}
	if claims.Iss != GCPInstanceServiceAccountEmail {
		return "Invalid JWT: issuer is not a known service account"
	}
	if claims.Aud != gcpTokenURL {
		return "Invalid JWT: audience is not the token endpoint"
	}
	if time.Unix(claims.Exp, 0).Before(time.Now()) {
		return "Invalid JWT: Token must be a short-lived token and in a reasonable timeframe"
	}
	return ""
}

// impersonationTarget reads the account out of
// /v1/projects/-/serviceAccounts/<email>:generateAccessToken.
func impersonationTarget(path string) (string, bool) {
	rest, ok := strings.CutPrefix(path, "/v1/projects/-/serviceAccounts/")
	if !ok {
		return "", false
	}
	email, ok := strings.CutSuffix(rest, ":generateAccessToken")
	return email, ok && strings.HasSuffix(email, ".iam.gserviceaccount.com")
}

// Impersonation is the account IAM Credentials impersonates, and how often it did.
type Impersonation struct {
	Issued int `json:"issued"`

	mu     sync.Mutex
	events fakenet.Emitter
}

// AccessTokenGenerated is published when IAM Credentials mints a token for the account.
type AccessTokenGenerated struct {
	ServiceAccount string `json:"serviceAccount"`
}

func (AccessTokenGenerated) EventName() string { return "gcp.access-token-generated" }

func newGCPIAM(events fakenet.Emitter) fakenet.Fake { return &Impersonation{events: events} }

func (i *Impersonation) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	email, ok := impersonationTarget(r.URL.Path)
	if r.Method != http.MethodPost || !ok {
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "The requested URL was not found on this server.")
		return
	}
	i.mu.Lock()
	i.Issued++
	i.mu.Unlock()
	i.events.Publish(AccessTokenGenerated{ServiceAccount: email})
	token, expires := gcpTokens.issue(email)
	writeJSON(w, http.StatusOK, map[string]any{
		"accessToken": token,
		"expireTime":  expires.UTC().Format(time.RFC3339),
	})
}

func (i *Impersonation) Snapshot() ([]byte, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	return json.Marshal(struct {
		Issued int `json:"issued"`
	}{i.Issued})
}

func (i *Impersonation) Seed([]byte) error { return nil }

// CertificateManager is the Certificate Manager certificates one service account can
// reach, by full resource name (projects/<p>/locations/<l>/certificates/<id>).
type CertificateManager struct {
	Certificates map[string]*GCPCertificate `json:"certificates"`

	// Operations are long-running operations by name, done after their first poll the
	// way a create finishes a moment after it is accepted.
	Operations map[string]*GCPOperation `json:"operations"`

	// CertificateMaps are certificate maps by full resource name
	// (projects/<p>/locations/global/certificateMaps/<id>), seeded by the test.
	CertificateMaps map[string]*GCPCertificateMap `json:"certificateMaps"`

	// CertificateMapEntries are entries by full resource name
	// (<certificate map>/certificateMapEntries/<id>).
	CertificateMapEntries map[string]*GCPCertificateMapEntry `json:"certificateMapEntries"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// GCPCertificate is a self-managed certificate as Certificate Manager stores it.
type GCPCertificate struct {
	Name           string            `json:"name"`
	Description    string            `json:"description,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	Scope          string            `json:"scope,omitempty"`
	PemCertificate string            `json:"pemCertificate"`
	PemPrivateKey  string            `json:"pemPrivateKey,omitempty"`
	SanDnsnames    []string          `json:"sanDnsnames,omitempty"`
	ExpireTime     string            `json:"expireTime,omitempty"`
	CreateTime     string            `json:"createTime,omitempty"`
	UpdateTime     string            `json:"updateTime,omitempty"`
}

// GCPCertificateMap is a certificate map a load balancer's target proxy serves from.
type GCPCertificateMap struct {
	Name       string `json:"name"`
	CreateTime string `json:"createTime,omitempty"`
}

// GCPCertificateMapEntry points a hostname, or the map's primary matcher, at up to
// four certificates by full resource name.
type GCPCertificateMapEntry struct {
	Name         string            `json:"name"`
	Description  string            `json:"description,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
	Certificates []string          `json:"certificates,omitempty"`
	Hostname     string            `json:"hostname,omitempty"`
	Matcher      string            `json:"matcher,omitempty"`
	State        string            `json:"state,omitempty"`
	CreateTime   string            `json:"createTime,omitempty"`
	UpdateTime   string            `json:"updateTime,omitempty"`
}

// SeedGCPCertificateMap is a seed fragment creating an empty global certificate map.
func SeedGCPCertificateMap(project, mapID string) any {
	name := "projects/" + project + "/locations/global/certificateMaps/" + mapID
	return map[string]any{"certificateMaps": map[string]any{name: map[string]any{"name": name}}}
}

// GCPOperation is a long-running operation a write started.
type GCPOperation struct {
	Name     string `json:"name"`
	Done     bool   `json:"done"`
	Response any    `json:"response,omitempty"`
}

// GCPCertificateDetail names a certificate by its full resource name.
type GCPCertificateDetail struct {
	Name string `json:"name"`
}

type GCPCertificateCreated struct{ GCPCertificateDetail }
type GCPCertificateUpdated struct{ GCPCertificateDetail }
type GCPCertificateDeleted struct{ GCPCertificateDetail }

func (GCPCertificateCreated) EventName() string { return "gcp.certificate-created" }
func (GCPCertificateUpdated) EventName() string { return "gcp.certificate-updated" }
func (GCPCertificateDeleted) EventName() string { return "gcp.certificate-deleted" }

// GCPCertificateMapEntryDetail names a certificate map entry and the certificates it
// points at after the change.
type GCPCertificateMapEntryDetail struct {
	Name         string   `json:"name"`
	Certificates []string `json:"certificates,omitempty"`
}

type GCPCertificateMapEntryCreated struct{ GCPCertificateMapEntryDetail }
type GCPCertificateMapEntryUpdated struct{ GCPCertificateMapEntryDetail }
type GCPCertificateMapEntryDeleted struct{ GCPCertificateMapEntryDetail }

func (GCPCertificateMapEntryCreated) EventName() string { return "gcp.certificate-map-entry-created" }
func (GCPCertificateMapEntryUpdated) EventName() string { return "gcp.certificate-map-entry-updated" }
func (GCPCertificateMapEntryDeleted) EventName() string { return "gcp.certificate-map-entry-deleted" }

const gcpPageSize = 100

func newGCPCertificateManager(events fakenet.Emitter) fakenet.Fake {
	c := &CertificateManager{
		Certificates: map[string]*GCPCertificate{}, Operations: map[string]*GCPOperation{},
		CertificateMaps: map[string]*GCPCertificateMap{}, CertificateMapEntries: map[string]*GCPCertificateMapEntry{},
		events: events,
	}
	c.mux = http.NewServeMux()
	c.mux.HandleFunc("GET /v1/projects/{project}/locations/{location}/certificates", c.list)
	c.mux.HandleFunc("POST /v1/projects/{project}/locations/{location}/certificates", c.create)
	c.mux.HandleFunc("GET /v1/projects/{project}/locations/{location}/certificates/{id}", c.get)
	c.mux.HandleFunc("PATCH /v1/projects/{project}/locations/{location}/certificates/{id}", c.patch)
	c.mux.HandleFunc("DELETE /v1/projects/{project}/locations/{location}/certificates/{id}", c.delete)
	c.mux.HandleFunc("GET /v1/projects/{project}/locations/{location}/operations/{op}", c.operation)
	c.mux.HandleFunc("GET /v1/projects/{project}/locations/{location}/certificateMaps/{map}", c.getMap)
	c.mux.HandleFunc("POST /v1/projects/{project}/locations/{location}/certificateMaps/{map}/certificateMapEntries", c.createEntry)
	c.mux.HandleFunc("GET /v1/projects/{project}/locations/{location}/certificateMaps/{map}/certificateMapEntries/{entry}", c.getEntry)
	c.mux.HandleFunc("PATCH /v1/projects/{project}/locations/{location}/certificateMaps/{map}/certificateMapEntries/{entry}", c.patchEntry)
	c.mux.HandleFunc("DELETE /v1/projects/{project}/locations/{location}/certificateMaps/{map}/certificateMapEntries/{entry}", c.deleteEntry)
	return c
}

func (c *CertificateManager) ServeHTTP(w http.ResponseWriter, r *http.Request) { c.mux.ServeHTTP(w, r) }

func locationOf(r *http.Request) string {
	return "projects/" + r.PathValue("project") + "/locations/" + r.PathValue("location")
}

func (c *CertificateManager) list(w http.ResponseWriter, r *http.Request) {
	prefix := locationOf(r) + "/certificates/"
	start := 0
	if raw := r.URL.Query().Get("pageToken"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "The page token is invalid.")
			return
		}
		start = n
	}
	c.mu.Lock()
	var names []string
	for name := range c.Certificates {
		if strings.HasPrefix(name, prefix) {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	size := gcpPageSize
	if n, err := strconv.Atoi(r.URL.Query().Get("pageSize")); err == nil && n > 0 && n < size {
		size = n
	}
	start = min(start, len(names))
	end := min(start+size, len(names))
	page := make([]GCPCertificate, 0, end-start)
	for _, name := range names[start:end] {
		page = append(page, c.Certificates[name].public())
	}
	c.mu.Unlock()
	out := map[string]any{"certificates": page}
	if end < len(names) {
		out["nextPageToken"] = strconv.Itoa(end)
	}
	writeJSON(w, http.StatusOK, out)
}

type certificateBody struct {
	Description string            `json:"description"`
	Labels      map[string]string `json:"labels"`
	Scope       string            `json:"scope"`
	SelfManaged *struct {
		PemCertificate string `json:"pemCertificate"`
		PemPrivateKey  string `json:"pemPrivateKey"`
	} `json:"selfManaged"`
}

func (c *CertificateManager) create(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("certificateId")
	if id == "" {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "certificate_id is required")
		return
	}
	var in certificateBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SelfManaged == nil {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "self_managed certificate data is required")
		return
	}
	sans, expires, msg := parseSelfManaged(in.SelfManaged.PemCertificate, in.SelfManaged.PemPrivateKey)
	if msg != "" {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", msg)
		return
	}
	name := locationOf(r) + "/certificates/" + id
	now := time.Now().UTC().Format(time.RFC3339)
	c.mu.Lock()
	if _, exists := c.Certificates[name]; exists {
		c.mu.Unlock()
		gcpError(w, http.StatusConflict, "ALREADY_EXISTS", "Resource '"+name+"' already exists")
		return
	}
	scope := in.Scope
	if scope == "" {
		scope = "DEFAULT"
	}
	cert := &GCPCertificate{
		Name: name, Description: in.Description, Labels: in.Labels, Scope: scope,
		PemCertificate: in.SelfManaged.PemCertificate, PemPrivateKey: in.SelfManaged.PemPrivateKey,
		SanDnsnames: sans, ExpireTime: expires, CreateTime: now, UpdateTime: now,
	}
	c.Certificates[name] = cert
	op := c.startOperation(locationOf(r), cert.public())
	c.mu.Unlock()
	c.events.Publish(GCPCertificateCreated{GCPCertificateDetail{Name: name}})
	writeJSON(w, http.StatusOK, op)
}

func (c *CertificateManager) get(w http.ResponseWriter, r *http.Request) {
	name := locationOf(r) + "/certificates/" + r.PathValue("id")
	c.mu.Lock()
	cert, ok := c.Certificates[name]
	var out GCPCertificate
	if ok {
		out = cert.public()
	}
	c.mu.Unlock()
	if !ok {
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (c *CertificateManager) patch(w http.ResponseWriter, r *http.Request) {
	name := locationOf(r) + "/certificates/" + r.PathValue("id")
	var in certificateBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Invalid JSON payload received.")
		return
	}
	mask := strings.Split(r.URL.Query().Get("updateMask"), ",")
	c.mu.Lock()
	cert, ok := c.Certificates[name]
	if !ok {
		c.mu.Unlock()
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	for _, field := range mask {
		switch strings.TrimSpace(field) {
		case "self_managed":
			if in.SelfManaged == nil {
				c.mu.Unlock()
				gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "self_managed certificate data is required")
				return
			}
			sans, expires, msg := parseSelfManaged(in.SelfManaged.PemCertificate, in.SelfManaged.PemPrivateKey)
			if msg != "" {
				c.mu.Unlock()
				gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", msg)
				return
			}
			cert.PemCertificate, cert.PemPrivateKey, cert.SanDnsnames, cert.ExpireTime = in.SelfManaged.PemCertificate, in.SelfManaged.PemPrivateKey, sans, expires
		case "labels":
			cert.Labels = in.Labels
		case "description":
			cert.Description = in.Description
		}
	}
	cert.UpdateTime = time.Now().UTC().Format(time.RFC3339)
	op := c.startOperation(locationOf(r), cert.public())
	c.mu.Unlock()
	c.events.Publish(GCPCertificateUpdated{GCPCertificateDetail{Name: name}})
	writeJSON(w, http.StatusOK, op)
}

func (c *CertificateManager) delete(w http.ResponseWriter, r *http.Request) {
	name := locationOf(r) + "/certificates/" + r.PathValue("id")
	c.mu.Lock()
	if _, ok := c.Certificates[name]; !ok {
		c.mu.Unlock()
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	if entry := c.entryUsing(name); entry != "" {
		c.mu.Unlock()
		gcpError(w, http.StatusBadRequest, "FAILED_PRECONDITION", "Certificate '"+name+"' is in use by certificate map entry '"+entry+"'")
		return
	}
	delete(c.Certificates, name)
	op := c.startOperation(locationOf(r), nil)
	c.mu.Unlock()
	c.events.Publish(GCPCertificateDeleted{GCPCertificateDetail{Name: name}})
	writeJSON(w, http.StatusOK, op)
}

func (c *CertificateManager) operation(w http.ResponseWriter, r *http.Request) {
	name := locationOf(r) + "/operations/" + r.PathValue("op")
	c.mu.Lock()
	op, ok := c.Operations[name]
	var out GCPOperation
	if ok {
		op.Done = true
		out = *op
	}
	c.mu.Unlock()
	if !ok {
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Operation '"+name+"' was not found")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// entryUsing is the name of an entry that points at the certificate, or "". The
// caller holds c.mu.
func (c *CertificateManager) entryUsing(certificate string) string {
	for name, entry := range c.CertificateMapEntries {
		if slices.Contains(entry.Certificates, certificate) {
			return name
		}
	}
	return ""
}

func mapOf(r *http.Request) string {
	return locationOf(r) + "/certificateMaps/" + r.PathValue("map")
}

func (c *CertificateManager) getMap(w http.ResponseWriter, r *http.Request) {
	name := mapOf(r)
	c.mu.Lock()
	m, ok := c.CertificateMaps[name]
	var out GCPCertificateMap
	if ok {
		out = *m
	}
	c.mu.Unlock()
	if !ok {
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type certificateMapEntryBody struct {
	Description  string            `json:"description"`
	Labels       map[string]string `json:"labels"`
	Certificates []string          `json:"certificates"`
	Hostname     string            `json:"hostname"`
	Matcher      string            `json:"matcher"`
}

// missingCertificate is the first certificate an entry names that does not exist, or
// "". The caller holds c.mu.
func (c *CertificateManager) missingCertificate(names []string) string {
	for _, name := range names {
		if _, ok := c.Certificates[name]; !ok {
			return name
		}
	}
	return ""
}

func (c *CertificateManager) createEntry(w http.ResponseWriter, r *http.Request) {
	entryID := r.URL.Query().Get("certificateMapEntryId")
	if entryID == "" {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "certificate_map_entry_id is required")
		return
	}
	var in certificateMapEntryBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Invalid JSON payload received.")
		return
	}
	if (in.Hostname == "") == (in.Matcher == "") {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "exactly one of hostname or matcher must be set")
		return
	}
	mapName := mapOf(r)
	name := mapName + "/certificateMapEntries/" + entryID
	now := time.Now().UTC().Format(time.RFC3339)
	c.mu.Lock()
	if _, ok := c.CertificateMaps[mapName]; !ok {
		c.mu.Unlock()
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+mapName+"' was not found")
		return
	}
	if _, exists := c.CertificateMapEntries[name]; exists {
		c.mu.Unlock()
		gcpError(w, http.StatusConflict, "ALREADY_EXISTS", "Resource '"+name+"' already exists")
		return
	}
	if missing := c.missingCertificate(in.Certificates); missing != "" {
		c.mu.Unlock()
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Certificate '"+missing+"' does not exist")
		return
	}
	entry := &GCPCertificateMapEntry{
		Name: name, Description: in.Description, Labels: in.Labels, Certificates: in.Certificates,
		Hostname: in.Hostname, Matcher: in.Matcher, State: "ACTIVE", CreateTime: now, UpdateTime: now,
	}
	c.CertificateMapEntries[name] = entry
	op := c.startOperation(locationOf(r), *entry)
	c.mu.Unlock()
	c.events.Publish(GCPCertificateMapEntryCreated{GCPCertificateMapEntryDetail{Name: name, Certificates: in.Certificates}})
	writeJSON(w, http.StatusOK, op)
}

func (c *CertificateManager) getEntry(w http.ResponseWriter, r *http.Request) {
	name := mapOf(r) + "/certificateMapEntries/" + r.PathValue("entry")
	c.mu.Lock()
	entry, ok := c.CertificateMapEntries[name]
	var out GCPCertificateMapEntry
	if ok {
		out = *entry
	}
	c.mu.Unlock()
	if !ok {
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (c *CertificateManager) patchEntry(w http.ResponseWriter, r *http.Request) {
	name := mapOf(r) + "/certificateMapEntries/" + r.PathValue("entry")
	var in certificateMapEntryBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Invalid JSON payload received.")
		return
	}
	mask := strings.Split(r.URL.Query().Get("updateMask"), ",")
	c.mu.Lock()
	entry, ok := c.CertificateMapEntries[name]
	if !ok {
		c.mu.Unlock()
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	for _, field := range mask {
		switch strings.TrimSpace(field) {
		case "certificates":
			if missing := c.missingCertificate(in.Certificates); missing != "" {
				c.mu.Unlock()
				gcpError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Certificate '"+missing+"' does not exist")
				return
			}
			entry.Certificates = in.Certificates
		case "labels":
			entry.Labels = in.Labels
		case "description":
			entry.Description = in.Description
		}
	}
	entry.UpdateTime = time.Now().UTC().Format(time.RFC3339)
	op := c.startOperation(locationOf(r), *entry)
	certs := slices.Clone(entry.Certificates)
	c.mu.Unlock()
	c.events.Publish(GCPCertificateMapEntryUpdated{GCPCertificateMapEntryDetail{Name: name, Certificates: certs}})
	writeJSON(w, http.StatusOK, op)
}

func (c *CertificateManager) deleteEntry(w http.ResponseWriter, r *http.Request) {
	name := mapOf(r) + "/certificateMapEntries/" + r.PathValue("entry")
	c.mu.Lock()
	if _, ok := c.CertificateMapEntries[name]; !ok {
		c.mu.Unlock()
		gcpError(w, http.StatusNotFound, "NOT_FOUND", "Resource '"+name+"' was not found")
		return
	}
	delete(c.CertificateMapEntries, name)
	op := c.startOperation(locationOf(r), nil)
	c.mu.Unlock()
	c.events.Publish(GCPCertificateMapEntryDeleted{GCPCertificateMapEntryDetail{Name: name}})
	writeJSON(w, http.StatusOK, op)
}

// startOperation records a long-running operation that is not done yet; it completes
// when it is first polled, so a caller that never waits for it never sees it finish.
func (c *CertificateManager) startOperation(location string, response any) GCPOperation {
	op := &GCPOperation{Name: location + "/operations/operation-" + id.Hex(8), Response: response}
	c.Operations[op.Name] = op
	return *op
}

// public is the certificate as the API returns it, without the private key.
func (c *GCPCertificate) public() GCPCertificate {
	out := *c
	out.PemPrivateKey = ""
	return out
}

func parseSelfManaged(certPEM, keyPEM string) ([]string, string, string) {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, "", "The certificate is not a valid PEM-encoded X.509 certificate"
	}
	leaf, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, "", "The certificate is not a valid PEM-encoded X.509 certificate"
	}
	k, _ := pem.Decode([]byte(keyPEM))
	if k == nil {
		return nil, "", "The private key is not a valid PEM-encoded private key"
	}
	var key any
	switch k.Type {
	case "PRIVATE KEY":
		key, err = x509.ParsePKCS8PrivateKey(k.Bytes)
	case "RSA PRIVATE KEY":
		key, err = x509.ParsePKCS1PrivateKey(k.Bytes)
	case "EC PRIVATE KEY":
		key, err = x509.ParseECPrivateKey(k.Bytes)
	default:
		return nil, "", "The private key is not a valid PEM-encoded private key"
	}
	if err != nil {
		return nil, "", "The private key is not a valid PEM-encoded private key"
	}
	signer, ok := key.(crypto.Signer)
	pub, ok2 := leaf.PublicKey.(interface{ Equal(crypto.PublicKey) bool })
	if !ok || !ok2 || !pub.Equal(signer.Public()) {
		return nil, "", "The private key does not match the certificate"
	}
	return leaf.DNSNames, leaf.NotAfter.UTC().Format(time.RFC3339), ""
}

func gcpError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": status, "message": message, "status": code}})
}

func (c *CertificateManager) Snapshot() ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return json.Marshal(struct {
		Certificates          map[string]*GCPCertificate         `json:"certificates"`
		Operations            map[string]*GCPOperation           `json:"operations"`
		CertificateMaps       map[string]*GCPCertificateMap      `json:"certificateMaps"`
		CertificateMapEntries map[string]*GCPCertificateMapEntry `json:"certificateMapEntries"`
	}{c.Certificates, c.Operations, c.CertificateMaps, c.CertificateMapEntries})
}

func (c *CertificateManager) Seed(raw []byte) error {
	var in struct {
		Certificates    map[string]*GCPCertificate    `json:"certificates"`
		CertificateMaps map[string]*GCPCertificateMap `json:"certificateMaps"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for name, cert := range in.Certificates {
		cert.Name = name
		c.Certificates[name] = cert
	}
	for name, m := range in.CertificateMaps {
		m.Name = name
		c.CertificateMaps[name] = m
	}
	return nil
}

// GCPControlPlane is a test's view of what one impersonated service account reaches.
type GCPControlPlane struct {
	IAM                *fakenet.Scope[Impersonation]
	CertificateManager *fakenet.Scope[CertificateManager]
}

// OpenGCP returns the state a service account's impersonated tokens reach, and starts
// collecting its events.
func OpenGCP(tt *testing.T, adminURL, serviceAccountEmail string) *GCPControlPlane {
	tt.Helper()
	fakenet.Track(tt, adminURL, GCPIAMCredentials.Host(), serviceAccountEmail)
	fakenet.Track(tt, adminURL, GCPCertificateManager.Host(), serviceAccountEmail)
	return &GCPControlPlane{
		IAM:                fakenet.Open[Impersonation](tt, adminURL, GCPIAMCredentials.Host(), serviceAccountEmail),
		CertificateManager: fakenet.Open[CertificateManager](tt, adminURL, GCPCertificateManager.Host(), serviceAccountEmail),
	}
}
