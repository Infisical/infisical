// Package netscaler fakes the NITRO configuration API of a NetScaler ADC: login
// sessions, files under /nsconfig/ssl, certkeys built from those files, their bindings
// to SSL vservers, and saving the running configuration.
package netscaler

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// Service answers as one NetScaler.
//
// A NetScaler's management address is the customer's own, so no host is hardcoded in
// Infisical. A fixed .test name stands in for it and reaches this fake through
// fakenet's DNS and CA, never by pointing the connection at fakenet.
var Service = service{host: "adc.netscaler.test"}

const configPrefix = "/nitro/v1/config"

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the user: read from the login body, and from the session token every later
// call carries, which this fake mints with the user in front.
func (service) Scope(r *http.Request) (string, bool) {
	if c, err := r.Cookie("NITRO_AUTH_TOKEN"); err == nil {
		user, _, ok := strings.Cut(c.Value, ".")
		return user, ok
	}
	if r.URL.Path != configPrefix+"/login" {
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
	return in.Login.Username, in.Login.Username != ""
}

type loginBody struct {
	Login struct {
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"login"`
}

// Password is the one a user a test invented logs in with.
func Password(user string) string {
	sum := sha256.Sum256([]byte("infisical-fake-netscaler/" + user))
	return hex.EncodeToString(sum[:16])
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &ADC{Files: map[string]string{}, CertKeys: map[string]*CertKey{}, VServers: map[string][]string{}, sessions: map[string]bool{}, events: events}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("POST "+configPrefix+"/login", a.login)
	a.mux.HandleFunc("POST "+configPrefix+"/logout", a.authed(a.logout))
	a.mux.HandleFunc("POST "+configPrefix+"/systemfile", a.authed(a.uploadFile))
	a.mux.HandleFunc("GET "+configPrefix+"/sslcertkey", a.authed(a.listCertKeys))
	a.mux.HandleFunc("POST "+configPrefix+"/sslcertkey", a.authed(a.writeCertKey))
	a.mux.HandleFunc("DELETE "+configPrefix+"/sslcertkey/{name}", a.authed(a.deleteCertKey))
	a.mux.HandleFunc("POST "+configPrefix+"/nsconfig", a.authed(a.save))
	a.mux.HandleFunc("PUT "+configPrefix+"/sslvserver_sslcertkey_binding", a.authed(a.bindCertKey))
	a.mux.HandleFunc("DELETE "+configPrefix+"/sslvserver_sslcertkey_binding/{vserver}", a.authed(a.unbindCertKey))
	return a
}

// ADC is one NetScaler a user can reach.
type ADC struct {
	// Files maps a full path such as /nsconfig/ssl/x.cer to its contents.
	Files    map[string]string   `json:"files"`
	CertKeys map[string]*CertKey `json:"certKeys"`
	// VServers maps an SSL vserver's name to the certkeys bound to it.
	VServers map[string][]string `json:"vservers"`
	// Saved is the certkeys the saved configuration holds, as of the last save.
	Saved []string `json:"saved"`

	mu       sync.Mutex
	mux      *http.ServeMux
	sessions map[string]bool
	events   fakenet.Emitter
}

// CertKey pairs a certificate file and a key file.
type CertKey struct {
	Cert string `json:"cert"`
	Key  string `json:"key"`
}

func (a *ADC) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.mux.ServeHTTP(w, r) }

func (a *ADC) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Files    map[string]string   `json:"files"`
		CertKeys map[string]*CertKey `json:"certKeys"`
		VServers map[string][]string `json:"vservers"`
		Saved    []string            `json:"saved"`
	}{a.Files, a.CertKeys, a.VServers, a.Saved})
}

func (a *ADC) Seed(raw []byte) error {
	var in struct {
		VServers map[string][]string `json:"vservers"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for name, bound := range in.VServers {
		a.VServers[name] = bound
	}
	return nil
}

// VServer seeds an SSL vserver with no certkey bound.
func VServer(name string) any {
	return map[string]any{"vservers": map[string][]string{name: {}}}
}

func (a *ADC) authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("NITRO_AUTH_TOKEN")
		a.mu.Lock()
		ok := err == nil && a.sessions[c.Value]
		a.mu.Unlock()
		if !ok {
			nitroError(w, http.StatusUnauthorized, 444, "Invalid Session")
			return
		}
		next(w, r)
	}
}

func (a *ADC) login(w http.ResponseWriter, r *http.Request) {
	var in loginBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Login.Password != Password(in.Login.Username) {
		nitroError(w, http.StatusUnauthorized, 354, "Invalid username or password")
		return
	}
	token := in.Login.Username + "." + id.Hex(16)
	a.mu.Lock()
	a.sessions[token] = true
	a.mu.Unlock()
	writeJSON(w, http.StatusCreated, map[string]any{"errorcode": 0, "message": "Done", "severity": "NONE", "sessionid": token})
}

func (a *ADC) logout(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("NITRO_AUTH_TOKEN")
	a.mu.Lock()
	delete(a.sessions, c.Value)
	a.mu.Unlock()
	done(w, http.StatusCreated)
}

func (a *ADC) uploadFile(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SystemFile struct {
			Filename     string `json:"filename"`
			FileLocation string `json:"filelocation"`
			FileContent  string `json:"filecontent"`
			FileEncoding string `json:"fileencoding"`
		} `json:"systemfile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SystemFile.Filename == "" || in.SystemFile.FileLocation == "" {
		nitroError(w, http.StatusBadRequest, 1092, "Arguments cannot both be specified [filename, filelocation]")
		return
	}
	content := in.SystemFile.FileContent
	if in.SystemFile.FileEncoding == "BASE64" {
		decoded, err := base64.StdEncoding.DecodeString(content)
		if err != nil {
			nitroError(w, http.StatusBadRequest, 1097, "Invalid file content")
			return
		}
		content = string(decoded)
	}
	path := strings.TrimSuffix(in.SystemFile.FileLocation, "/") + "/" + in.SystemFile.Filename

	a.mu.Lock()
	_, exists := a.Files[path]
	if exists && r.URL.Query().Get("override") != "yes" {
		a.mu.Unlock()
		nitroError(w, http.StatusConflict, 1642, "File already exists")
		return
	}
	a.Files[path] = content
	a.mu.Unlock()

	a.events.Publish(FileUploaded{Path: path})
	done(w, http.StatusCreated)
}

func (a *ADC) listCertKeys(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := []map[string]string{}
	for _, name := range slices.Sorted(maps.Keys(a.CertKeys)) {
		ck := a.CertKeys[name]
		out = append(out, map[string]string{"certkey": name, "cert": ck.Cert, "key": ck.Key})
	}
	writeJSON(w, http.StatusOK, map[string]any{"errorcode": 0, "message": "Done", "severity": "NONE", "sslcertkey": out})
}

func (a *ADC) writeCertKey(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SSLCertKey struct {
			CertKey string `json:"certkey"`
			Cert    string `json:"cert"`
			Key     string `json:"key"`
		} `json:"sslcertkey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SSLCertKey.CertKey == "" {
		nitroError(w, http.StatusBadRequest, 1095, "Required argument missing [certkey]")
		return
	}
	ck := in.SSLCertKey
	update := r.URL.Query().Get("action") == "update"

	a.mu.Lock()
	_, exists := a.CertKeys[ck.CertKey]
	_, hasCert := a.Files[ck.Cert]
	_, hasKey := a.Files[ck.Key]
	switch {
	case update && !exists:
		a.mu.Unlock()
		nitroError(w, http.StatusNotFound, 1540, "Certificate does not exist")
		return
	case !update && exists:
		a.mu.Unlock()
		nitroError(w, http.StatusConflict, 273, "Resource already exists")
		return
	case !hasCert || !hasKey:
		a.mu.Unlock()
		nitroError(w, http.StatusNotFound, 1541, "Invalid certificate file or key file")
		return
	}
	a.CertKeys[ck.CertKey] = &CertKey{Cert: ck.Cert, Key: ck.Key}
	a.mu.Unlock()

	if update {
		a.events.Publish(CertKeyUpdated{Name: ck.CertKey})
		done(w, http.StatusOK)
		return
	}
	a.events.Publish(CertKeyCreated{Name: ck.CertKey})
	done(w, http.StatusCreated)
}

func (a *ADC) deleteCertKey(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	a.mu.Lock()
	ck, ok := a.CertKeys[name]
	if !ok {
		a.mu.Unlock()
		nitroError(w, http.StatusNotFound, 1540, "Certificate does not exist")
		return
	}
	if a.boundTo(name) != "" {
		a.mu.Unlock()
		nitroError(w, 599, 1586, "Certificate is bound to a vserver")
		return
	}
	delete(a.CertKeys, name)
	if strings.Contains(r.URL.Query().Get("args"), "deletefromdevice:true") {
		delete(a.Files, ck.Cert)
		delete(a.Files, ck.Key)
	}
	a.mu.Unlock()

	a.events.Publish(CertKeyDeleted{Name: name})
	done(w, http.StatusOK)
}

func (a *ADC) save(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("action") != "save" {
		nitroError(w, http.StatusBadRequest, 1093, "Invalid action")
		return
	}
	a.mu.Lock()
	a.Saved = slices.AppendSeq([]string{}, maps.Keys(a.CertKeys))
	slices.Sort(a.Saved)
	saved := append([]string{}, a.Saved...)
	a.mu.Unlock()
	a.events.Publish(ConfigSaved{CertKeys: saved})
	done(w, http.StatusOK)
}

func (a *ADC) boundTo(certKey string) string {
	for _, vserver := range slices.Sorted(maps.Keys(a.VServers)) {
		if slices.Contains(a.VServers[vserver], certKey) {
			return vserver
		}
	}
	return ""
}

func (a *ADC) bindCertKey(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Binding struct {
			VServerName string `json:"vservername"`
			CertKeyName string `json:"certkeyname"`
		} `json:"sslvserver_sslcertkey_binding"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Binding.VServerName == "" || in.Binding.CertKeyName == "" {
		nitroError(w, http.StatusBadRequest, 1095, "Required argument missing [vservername, certkeyname]")
		return
	}
	b := in.Binding
	a.mu.Lock()
	bound, exists := a.VServers[b.VServerName]
	_, hasCertKey := a.CertKeys[b.CertKeyName]
	switch {
	case !exists:
		a.mu.Unlock()
		nitroError(w, http.StatusNotFound, 258, "No such resource [vservername, "+b.VServerName+"]")
		return
	case !hasCertKey:
		a.mu.Unlock()
		nitroError(w, http.StatusNotFound, 1540, "Certificate does not exist")
		return
	case slices.Contains(bound, b.CertKeyName):
		a.mu.Unlock()
		nitroError(w, http.StatusConflict, 273, "Resource already exists")
		return
	}
	a.VServers[b.VServerName] = append(bound, b.CertKeyName)
	a.mu.Unlock()
	a.events.Publish(CertKeyBound{VServer: b.VServerName, CertKey: b.CertKeyName})
	done(w, http.StatusOK)
}

// unbindCertKey removes one binding, the certkey named in args=certkeyname:<name>.
func (a *ADC) unbindCertKey(w http.ResponseWriter, r *http.Request) {
	vserver := r.PathValue("vserver")
	_, certKey, _ := strings.Cut(r.URL.Query().Get("args"), "certkeyname:")
	a.mu.Lock()
	bound := a.VServers[vserver]
	i := slices.Index(bound, certKey)
	if certKey == "" || i < 0 {
		a.mu.Unlock()
		nitroError(w, http.StatusNotFound, 258, "No such resource [certkeyname, "+certKey+"]")
		return
	}
	a.VServers[vserver] = slices.Delete(bound, i, i+1)
	a.mu.Unlock()
	a.events.Publish(CertKeyUnbound{VServer: vserver, CertKey: certKey})
	done(w, http.StatusOK)
}

func done(w http.ResponseWriter, status int) {
	writeJSON(w, status, map[string]any{"errorcode": 0, "message": "Done", "severity": "NONE"})
}

func nitroError(w http.ResponseWriter, status, code int, message string) {
	writeJSON(w, status, map[string]any{"errorcode": code, "message": message, "severity": "ERROR"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
