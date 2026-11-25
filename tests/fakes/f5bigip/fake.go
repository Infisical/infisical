// Package f5bigip fakes the iControl REST API of an F5 BIG-IP: token logins, chunked
// file uploads, the ssl-cert and ssl-key file objects installed from those uploads, the
// Client SSL profiles that reference them, and saving the running configuration.
package f5bigip

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// Service answers as one BIG-IP.
//
// A BIG-IP's management address is the customer's own, so no host is hardcoded in
// Infisical. A fixed .test name stands in for it and reaches this fake through
// fakenet's DNS and CA, never by pointing the connection at fakenet.
var Service = service{host: "bigip.f5.test"}

// DownloadsDir is where uploads land and where sourcePath points.
const DownloadsDir = "/var/config/rest/downloads"

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the user: read from the login body, and from the auth token every later
// call carries, which this fake mints with the user in front.
func (service) Scope(r *http.Request) (string, bool) {
	if token := r.Header.Get("X-F5-Auth-Token"); token != "" {
		user, _, ok := strings.Cut(token, ".")
		return user, ok
	}
	if r.URL.Path != "/mgmt/shared/authn/login" {
		return "", false
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return "", false
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	var in loginBody
	if json.Unmarshal(body, &in) != nil {
		return "", false
	}
	return in.Username, in.Username != ""
}

type loginBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Password is the one a user a test invented logs in with.
func Password(user string) string {
	sum := sha256.Sum256([]byte("infisical-fake-f5bigip/" + user))
	return hex.EncodeToString(sum[:16])
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	b := &BigIP{Downloads: map[string]string{}, SSLCerts: map[string]string{}, SSLKeys: map[string]string{}, ClientSSLProfiles: map[string]*Profile{}, tokens: map[string]bool{}, events: events}
	b.mux = http.NewServeMux()
	b.mux.HandleFunc("POST /mgmt/shared/authn/login", b.login)
	b.mux.HandleFunc("PATCH /mgmt/shared/authz/tokens/{token}", b.authed(b.extendToken))
	b.mux.HandleFunc("DELETE /mgmt/shared/authz/tokens/{token}", b.authed(b.deleteToken))
	b.mux.HandleFunc("GET /mgmt/tm/sys/version", b.authed(b.version))
	b.mux.HandleFunc("POST /mgmt/shared/file-transfer/uploads/{name}", b.authed(b.upload))
	b.mux.HandleFunc("POST /mgmt/tm/util/unix-rm", b.authed(b.unixRm))
	b.mux.HandleFunc("POST /mgmt/tm/sys/config", b.authed(b.saveConfig))
	b.mux.HandleFunc("GET /mgmt/tm/ltm/profile/client-ssl", b.authed(b.listClientSSLProfiles))
	b.mux.HandleFunc("GET /mgmt/tm/ltm/profile/client-ssl/{id}", b.authed(b.getClientSSLProfile))
	b.mux.HandleFunc("PATCH /mgmt/tm/ltm/profile/client-ssl/{id}", b.authed(b.updateClientSSLProfile))
	b.mux.HandleFunc("GET /mgmt/tm/ltm/profile/server-ssl", b.authed(b.listServerSSLProfiles))
	for kind, store := range map[string]func() map[string]string{
		"ssl-cert": func() map[string]string { return b.SSLCerts },
		"ssl-key":  func() map[string]string { return b.SSLKeys },
	} {
		b.mux.HandleFunc("GET /mgmt/tm/sys/file/"+kind, b.authed(b.listFiles(kind, store)))
		b.mux.HandleFunc("POST /mgmt/tm/sys/file/"+kind, b.authed(b.createFile(kind, store)))
		b.mux.HandleFunc("PATCH /mgmt/tm/sys/file/"+kind+"/{id}", b.authed(b.updateFile(kind, store)))
		b.mux.HandleFunc("DELETE /mgmt/tm/sys/file/"+kind+"/{id}", b.authed(b.deleteFile(kind, store)))
	}
	return b
}

// BigIP is one device a user can reach.
type BigIP struct {
	// Downloads maps an uploaded file name to its contents.
	Downloads map[string]string `json:"downloads"`
	// SSLCerts and SSLKeys map an object's full path, such as /Common/web, to the PEM
	// installed from its source file.
	SSLCerts map[string]string `json:"sslCerts"`
	SSLKeys  map[string]string `json:"sslKeys"`
	// ClientSSLProfiles maps a Client SSL profile's full path to the profile.
	ClientSSLProfiles map[string]*Profile `json:"clientSslProfiles"`
	// Saved is the ssl-cert and ssl-key objects the saved configuration holds, as of
	// the last save, each as "<kind> <full path>".
	Saved []string `json:"saved"`

	mu     sync.Mutex
	mux    *http.ServeMux
	tokens map[string]bool
	events fakenet.Emitter
}

// Profile is a Client SSL profile, holding the certificates it serves.
type Profile struct {
	CertKeyChain []CertKeyChainEntry `json:"certKeyChain"`
}

// CertKeyChainEntry is one certificate a profile serves, each reference the full path
// of an ssl-cert or ssl-key object.
type CertKeyChainEntry struct {
	Name  string `json:"name"`
	Cert  string `json:"cert,omitempty"`
	Key   string `json:"key,omitempty"`
	Chain string `json:"chain,omitempty"`
}

// ClientSSLProfile seeds a Client SSL profile at a full path such as /Common/web-ssl.
func ClientSSLProfile(path string, entries ...CertKeyChainEntry) any {
	return map[string]any{"clientSslProfiles": map[string]*Profile{path: {CertKeyChain: entries}}}
}

func (b *BigIP) ServeHTTP(w http.ResponseWriter, r *http.Request) { b.mux.ServeHTTP(w, r) }

func (b *BigIP) Snapshot() ([]byte, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return json.Marshal(struct {
		Downloads         map[string]string   `json:"downloads"`
		SSLCerts          map[string]string   `json:"sslCerts"`
		SSLKeys           map[string]string   `json:"sslKeys"`
		ClientSSLProfiles map[string]*Profile `json:"clientSslProfiles"`
		Saved             []string            `json:"saved"`
	}{b.Downloads, b.SSLCerts, b.SSLKeys, b.ClientSSLProfiles, b.Saved})
}

func (b *BigIP) Seed(raw []byte) error {
	var in struct {
		SSLCerts          map[string]string   `json:"sslCerts"`
		SSLKeys           map[string]string   `json:"sslKeys"`
		ClientSSLProfiles map[string]*Profile `json:"clientSslProfiles"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for k, v := range in.SSLCerts {
		b.SSLCerts[k] = v
	}
	for k, v := range in.SSLKeys {
		b.SSLKeys[k] = v
	}
	for k, v := range in.ClientSSLProfiles {
		b.ClientSSLProfiles[k] = v
	}
	return nil
}

func (b *BigIP) authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		b.mu.Lock()
		ok := b.tokens[r.Header.Get("X-F5-Auth-Token")]
		b.mu.Unlock()
		if !ok {
			f5Error(w, http.StatusUnauthorized, "X-F5-Auth-Token does not exist.")
			return
		}
		next(w, r)
	}
}

func (b *BigIP) login(w http.ResponseWriter, r *http.Request) {
	var in loginBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Password != Password(in.Username) {
		f5Error(w, http.StatusUnauthorized, "Authentication failed.")
		return
	}
	token := in.Username + "." + strings.ToUpper(id.Hex(12))
	b.mu.Lock()
	b.tokens[token] = true
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"username":          in.Username,
		"loginProviderName": "tmos",
		"token":             map[string]any{"token": token, "name": token, "userName": in.Username, "timeout": 1200},
	})
}

func (b *BigIP) extendToken(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Timeout int `json:"timeout"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	if in.Timeout > 36000 {
		f5Error(w, http.StatusBadRequest, "timeout must be at most 36000")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": r.PathValue("token"), "timeout": in.Timeout})
}

func (b *BigIP) deleteToken(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	delete(b.tokens, r.PathValue("token"))
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{})
}

func (b *BigIP) version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"kind":    "tm:sys:version:versionstats",
		"entries": map[string]any{"https://localhost/mgmt/tm/sys/version/0": map[string]any{"nestedStats": map[string]any{"entries": map[string]any{"Version": map[string]any{"description": "17.1.0"}}}}},
	})
}

// upload assembles a file from Content-Range chunks, as the file-transfer worker does.
func (b *BigIP) upload(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var start, end, size int
	if _, err := fmt.Sscanf(r.Header.Get("Content-Range"), "%d-%d/%d", &start, &end, &size); err != nil || end < start || end >= size {
		f5Error(w, http.StatusBadRequest, "Content-Range header is missing or invalid")
		return
	}
	chunk, err := io.ReadAll(r.Body)
	if err != nil || len(chunk) != end-start+1 {
		f5Error(w, http.StatusBadRequest, "Chunk size does not match Content-Range")
		return
	}
	b.mu.Lock()
	current := b.Downloads[name]
	if start == 0 {
		current = ""
	}
	if len(current) != start {
		b.mu.Unlock()
		f5Error(w, http.StatusBadRequest, "Chunk does not continue the upload")
		return
	}
	current += string(chunk)
	b.Downloads[name] = current
	b.mu.Unlock()
	if len(current) == size {
		b.events.Publish(FileUploaded{Name: name})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"remainingByteCount": size - len(current),
		"totalByteCount":     size,
		"localFilePath":      DownloadsDir + "/" + name,
	})
}

func (b *BigIP) unixRm(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Command     string `json:"command"`
		UtilCmdArgs string `json:"utilCmdArgs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Command != "run" {
		f5Error(w, http.StatusBadRequest, "command must be run")
		return
	}
	for _, arg := range strings.Fields(in.UtilCmdArgs) {
		if name, ok := strings.CutPrefix(arg, DownloadsDir+"/"); ok {
			b.mu.Lock()
			delete(b.Downloads, name)
			b.mu.Unlock()
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:util:unix-rm:runstate", "command": "run", "utilCmdArgs": in.UtilCmdArgs})
}

func (b *BigIP) saveConfig(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Command != "save" {
		f5Error(w, http.StatusBadRequest, "command must be save")
		return
	}
	b.mu.Lock()
	var saved []string
	for p := range b.SSLCerts {
		saved = append(saved, "ssl-cert "+p)
	}
	for p := range b.SSLKeys {
		saved = append(saved, "ssl-key "+p)
	}
	sort.Strings(saved)
	b.Saved = saved
	b.mu.Unlock()
	b.events.Publish(ConfigSaved{Objects: saved})
	writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:sys:config:savestate", "command": "save"})
}

// objectPath turns an object id such as ~Common~web into /Common/web.
func objectPath(id string) (string, bool) {
	id, err := url.PathUnescape(id)
	if err != nil || !strings.HasPrefix(id, "~") {
		return "", false
	}
	return strings.ReplaceAll(id, "~", "/"), true
}

func (b *BigIP) source(sourcePath string) (string, bool) {
	name, ok := strings.CutPrefix(sourcePath, "file:"+DownloadsDir+"/")
	if !ok {
		return "", false
	}
	content, ok := b.Downloads[name]
	return content, ok
}

func (b *BigIP) listFiles(kind string, store func() map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		b.mu.Lock()
		defer b.mu.Unlock()
		items := []map[string]string{}
		for p := range store() {
			partition, name, _ := strings.Cut(strings.TrimPrefix(p, "/"), "/")
			items = append(items, map[string]string{"name": name, "partition": partition, "fullPath": p})
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:sys:file:" + kind + ":" + kind + "collectionstate", "items": items})
	}
}

func (b *BigIP) createFile(kind string, store func() map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name       string `json:"name"`
			Partition  string `json:"partition"`
			SourcePath string `json:"sourcePath"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" {
			f5Error(w, http.StatusBadRequest, "name is required")
			return
		}
		if in.Partition == "" {
			in.Partition = "Common"
		}
		p := "/" + in.Partition + "/" + in.Name
		b.mu.Lock()
		if _, exists := store()[p]; exists {
			b.mu.Unlock()
			f5Error(w, http.StatusConflict, "01020066:3: The requested "+kind+" ("+p+") already exists in partition "+in.Partition+".")
			return
		}
		content, ok := b.source(in.SourcePath)
		if !ok {
			b.mu.Unlock()
			f5Error(w, http.StatusBadRequest, "File not found: "+in.SourcePath)
			return
		}
		store()[p] = content
		b.mu.Unlock()
		b.events.Publish(FileObjectInstalled{Kind: kind, Path: p})
		writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:sys:file:" + kind + ":" + kind + "state", "name": in.Name, "partition": in.Partition, "fullPath": p})
	}
}

func (b *BigIP) updateFile(kind string, store func() map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := objectPath(r.PathValue("id"))
		if !ok {
			f5Error(w, http.StatusBadRequest, "invalid object id")
			return
		}
		var in struct {
			SourcePath string `json:"sourcePath"`
		}
		_ = json.NewDecoder(r.Body).Decode(&in)
		b.mu.Lock()
		if _, exists := store()[p]; !exists {
			b.mu.Unlock()
			f5Error(w, http.StatusNotFound, "01020036:3: The requested "+kind+" ("+p+") was not found.")
			return
		}
		content, ok := b.source(in.SourcePath)
		if !ok {
			b.mu.Unlock()
			f5Error(w, http.StatusBadRequest, "File not found: "+in.SourcePath)
			return
		}
		store()[p] = content
		b.mu.Unlock()
		b.events.Publish(FileObjectInstalled{Kind: kind, Path: p})
		writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:sys:file:" + kind + ":" + kind + "state", "fullPath": p})
	}
}

func (b *BigIP) deleteFile(kind string, store func() map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := objectPath(r.PathValue("id"))
		b.mu.Lock()
		if _, exists := store()[p]; !ok || !exists {
			b.mu.Unlock()
			f5Error(w, http.StatusNotFound, "01020036:3: The requested "+kind+" ("+p+") was not found.")
			return
		}
		if profile, used := b.referencedBy(p); used {
			b.mu.Unlock()
			f5Error(w, http.StatusBadRequest, "01070313:3: The requested "+kind+" ("+p+") is in use by Client SSL profile ("+profile+") and cannot be deleted.")
			return
		}
		delete(store(), p)
		b.mu.Unlock()
		b.events.Publish(FileObjectDeleted{Kind: kind, Path: p})
		writeJSON(w, http.StatusOK, map[string]any{})
	}
}

// referencedBy names a Client SSL profile whose cert-key-chain uses the object at p.
func (b *BigIP) referencedBy(p string) (string, bool) {
	for _, path := range slices.Sorted(maps.Keys(b.ClientSSLProfiles)) {
		for _, e := range b.ClientSSLProfiles[path].CertKeyChain {
			if e.Cert == p || e.Key == p || e.Chain == p {
				return path, true
			}
		}
	}
	return "", false
}

func (b *BigIP) listClientSSLProfiles(w http.ResponseWriter, _ *http.Request) {
	b.mu.Lock()
	defer b.mu.Unlock()
	items := []map[string]any{}
	for _, p := range slices.Sorted(maps.Keys(b.ClientSSLProfiles)) {
		items = append(items, profileState(p, b.ClientSSLProfiles[p]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:ltm:profile:client-ssl:client-sslcollectionstate", "items": items})
}

func (b *BigIP) getClientSSLProfile(w http.ResponseWriter, r *http.Request) {
	p, _ := objectPath(r.PathValue("id"))
	b.mu.Lock()
	defer b.mu.Unlock()
	profile, ok := b.ClientSSLProfiles[p]
	if !ok {
		f5Error(w, http.StatusNotFound, "01020036:3: The requested Client SSL Profile ("+p+") was not found.")
		return
	}
	writeJSON(w, http.StatusOK, profileState(p, profile))
}

func (b *BigIP) updateClientSSLProfile(w http.ResponseWriter, r *http.Request) {
	p, _ := objectPath(r.PathValue("id"))
	var in struct {
		CertKeyChain *[]CertKeyChainEntry `json:"certKeyChain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		f5Error(w, http.StatusBadRequest, "Found invalid JSON body in the request.")
		return
	}
	b.mu.Lock()
	profile, ok := b.ClientSSLProfiles[p]
	if !ok {
		b.mu.Unlock()
		f5Error(w, http.StatusNotFound, "01020036:3: The requested Client SSL Profile ("+p+") was not found.")
		return
	}
	if in.CertKeyChain != nil {
		profile.CertKeyChain = *in.CertKeyChain
	}
	chain := slices.Clone(profile.CertKeyChain)
	out := profileState(p, profile)
	b.mu.Unlock()
	b.events.Publish(ClientSSLProfileUpdated{Path: p, CertKeyChain: chain})
	writeJSON(w, http.StatusOK, out)
}

// listServerSSLProfiles answers an empty collection: this fake holds no Server SSL
// profiles, but removal enumerates them before deleting a certificate.
func (b *BigIP) listServerSSLProfiles(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"kind": "tm:ltm:profile:server-ssl:server-sslcollectionstate", "items": []any{}})
}

func profileState(p string, profile *Profile) map[string]any {
	partition, name, _ := strings.Cut(strings.TrimPrefix(p, "/"), "/")
	return map[string]any{
		"kind":         "tm:ltm:profile:client-ssl:client-sslstate",
		"name":         name,
		"partition":    partition,
		"fullPath":     p,
		"certKeyChain": profile.CertKeyChain,
	}
}

func f5Error(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"code": status, "message": message, "errorStack": []string{}, "apiError": 3})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
