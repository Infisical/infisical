// Package panos fakes the XML API of a PAN-OS firewall: API key generation, the
// candidate configuration's shared certificates and SSL/TLS service profiles, file
// imports, and commits.
package panos

import (
	"bytes"
	"crypto"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"encoding/xml"
	"fmt"
	"io"
	"maps"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/youmark/pkcs8"
)

// Service answers as one firewall's management interface.
//
// The management address is the customer's own, so no host is hardcoded in Infisical.
// A fixed .test name stands in for it and reaches this fake through fakenet's DNS and
// CA, never by pointing the connection at fakenet.
var Service = service{host: "firewall.panos.test"}

const (
	sharedCertificates = "/config/shared/certificate"
	sharedProfiles     = "/config/shared/ssl-tls-service-profile"
	vsysList           = "/config/devices/entry[@name='localhost.localdomain']/vsys"
)

var entryName = regexp.MustCompile(`^/entry\[@name='([^']+)'\]$`)

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the admin user: read from a keygen request, and from the API key every later
// call carries, which this fake mints with the user in front.
func (service) Scope(r *http.Request) (string, bool) {
	if key := r.Header.Get("X-PAN-KEY"); key != "" {
		user, _, ok := strings.Cut(key, ".")
		return user, ok
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
		return "", false
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return "", false
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	form, err := url.ParseQuery(string(body))
	if err != nil || form.Get("type") != "keygen" {
		return "", false
	}
	return form.Get("user"), form.Get("user") != ""
}

// Password is the one an admin a test invented logs in with.
func Password(user string) string {
	sum := sha256.Sum256([]byte("infisical-fake-panos/" + user))
	return hex.EncodeToString(sum[:16])
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	return &Firewall{Certificates: map[string]*Certificate{}, Profiles: map[string]string{}, keys: map[string]bool{}, events: events}
}

// Firewall is one device an admin can reach. Certificates and Profiles are the
// candidate configuration; Committed is what the last commit made running.
type Firewall struct {
	Certificates map[string]*Certificate `json:"certificates"`
	// Profiles maps an SSL/TLS service profile to the certificate it presents.
	Profiles  map[string]string `json:"profiles"`
	Committed *Commit           `json:"committed,omitempty"`
	// ImportRefusal, when set, is the reason the device refuses every import. PAN-OS
	// serves every call on /api/, so fakenet's path rules cannot single imports out.
	ImportRefusal string `json:"importRefusal,omitempty"`

	mu     sync.Mutex
	keys   map[string]bool
	jobs   int
	events fakenet.Emitter
}

// Certificate is a shared certificate object. PrivateKey is set only for a key pair,
// and holds the key as imported, still encrypted under the import passphrase.
type Certificate struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey,omitempty"`
}

// Commit is the configuration a commit made running.
type Commit struct {
	Certificates []string          `json:"certificates"`
	Profiles     map[string]string `json:"profiles"`
}

// WithProfile is a seed fragment for a shared SSL/TLS service profile presenting no
// certificate.
func WithProfile(name string) any { return Firewall{Profiles: map[string]string{name: ""}} }

// WithCertificate is a seed fragment for a shared certificate, without a key, that
// Infisical did not import.
func WithCertificate(name, publicKey string) any {
	return Firewall{Certificates: map[string]*Certificate{name: {PublicKey: publicKey}}}
}

// RefuseImports is a seed fragment making the device refuse every import with reason.
func RefuseImports(reason string) any { return Firewall{ImportRefusal: reason} }

func (f *Firewall) Snapshot() ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return json.Marshal(struct {
		Certificates  map[string]*Certificate `json:"certificates"`
		Profiles      map[string]string       `json:"profiles"`
		Committed     *Commit                 `json:"committed,omitempty"`
		ImportRefusal string                  `json:"importRefusal,omitempty"`
	}{f.Certificates, f.Profiles, f.Committed, f.ImportRefusal})
}

func (f *Firewall) Seed(raw []byte) error {
	var in struct {
		Certificates  map[string]*Certificate `json:"certificates"`
		Profiles      map[string]string       `json:"profiles"`
		ImportRefusal string                  `json:"importRefusal"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	for k, v := range in.Certificates {
		f.Certificates[k] = v
	}
	for k, v := range in.Profiles {
		f.Profiles[k] = v
	}
	if in.ImportRefusal != "" {
		f.ImportRefusal = in.ImportRefusal
	}
	return nil
}

func (f *Firewall) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || r.URL.Path != "/api/" {
		http.NotFound(w, r)
		return
	}
	params, file, err := readParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "18", err.Error())
		return
	}
	if params.Get("type") == "keygen" {
		f.keygen(w, params)
		return
	}
	f.mu.Lock()
	known := f.keys[r.Header.Get("X-PAN-KEY")]
	f.mu.Unlock()
	if !known {
		writeError(w, http.StatusForbidden, "403", "Invalid Credential")
		return
	}
	switch params.Get("type") {
	case "op":
		f.op(w, params.Get("cmd"))
	case "config":
		f.config(w, params)
	case "import":
		f.importFile(w, params, file)
	case "commit":
		f.commit(w, params)
	default:
		writeError(w, http.StatusBadRequest, "18", "Malformed Request")
	}
}

// readParams merges the query string with the form body, urlencoded or multipart, and
// returns the uploaded file of a multipart import.
func readParams(r *http.Request) (url.Values, string, error) {
	params := r.URL.Query()
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	switch {
	case mediaType == "application/x-www-form-urlencoded":
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, "", err
		}
		form, err := url.ParseQuery(string(body))
		if err != nil {
			return nil, "", err
		}
		for k, v := range form {
			params[k] = v
		}
		return params, "", nil
	case strings.HasPrefix(mediaType, "multipart/"):
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			return nil, "", err
		}
		for k, v := range r.MultipartForm.Value {
			params[k] = v
		}
		fh, ok := r.MultipartForm.File["file"]
		if !ok || len(fh) == 0 {
			return params, "", nil
		}
		src, err := fh[0].Open()
		if err != nil {
			return nil, "", err
		}
		defer func() { _ = src.Close() }()
		content, err := io.ReadAll(src)
		return params, string(content), err
	}
	return params, "", nil
}

func (f *Firewall) keygen(w http.ResponseWriter, params url.Values) {
	user := params.Get("user")
	if params.Get("password") != Password(user) {
		writeError(w, http.StatusForbidden, "403", "Invalid Credential")
		return
	}
	key := user + "." + id.Hex(24)
	f.mu.Lock()
	f.keys[key] = true
	f.mu.Unlock()
	writeSuccess(w, "<key>"+key+"</key>")
}

func (f *Firewall) op(w http.ResponseWriter, cmd string) {
	switch {
	case cmd == "<show><system><info></info></system></show>":
		writeSuccess(w, "<system><hostname>harness-fw</hostname><model>PA-VM</model><sw-version>11.1.0</sw-version></system>")
	case strings.HasPrefix(cmd, "<show><jobs><id>"):
		id := strings.TrimSuffix(strings.TrimPrefix(cmd, "<show><jobs><id>"), "</id></jobs></show>")
		writeSuccess(w, "<job><id>"+escape(id)+"</id><type>Commit</type><status>FIN</status><result>OK</result><details><line>Configuration committed successfully</line></details></job>")
	default:
		writeError(w, http.StatusBadRequest, "17", "Invalid command")
	}
}

func (f *Firewall) config(w http.ResponseWriter, params url.Values) {
	xpath := params.Get("xpath")
	f.mu.Lock()
	defer f.mu.Unlock()
	switch params.Get("action") {
	case "get":
		writeSuccess(w, f.get(xpath))
	case "edit":
		profile, ok := strings.CutPrefix(xpath, sharedProfiles)
		profile, ok2 := strings.CutSuffix(profile, "/certificate")
		m := entryName.FindStringSubmatch(profile)
		if !ok || !ok2 || m == nil {
			writeError(w, http.StatusBadRequest, "12", "Invalid xpath")
			return
		}
		var el struct {
			Value string `xml:",chardata"`
		}
		if err := xml.Unmarshal([]byte(params.Get("element")), &el); err != nil {
			writeError(w, http.StatusBadRequest, "12", "Malformed element")
			return
		}
		if _, exists := f.Profiles[m[1]]; !exists {
			writeError(w, http.StatusBadRequest, "12", "Object doesn't exist")
			return
		}
		if _, exists := f.Certificates[el.Value]; !exists {
			writeError(w, http.StatusBadRequest, "12", fmt.Sprintf("ssl-tls-service-profile -> %s -> certificate '%s' is not a valid reference", m[1], el.Value))
			return
		}
		f.Profiles[m[1]] = el.Value
		f.events.Publish(ProfileUpdated{Name: m[1], Certificate: el.Value})
		writeSuccess(w, "<msg>command succeeded</msg>")
	case "delete":
		m := entryName.FindStringSubmatch(strings.TrimPrefix(xpath, sharedCertificates))
		if !strings.HasPrefix(xpath, sharedCertificates) || m == nil {
			writeError(w, http.StatusBadRequest, "12", "Invalid xpath")
			return
		}
		if users := f.profilesUsing(m[1]); len(users) > 0 {
			refs := make([]string, 0, len(users))
			for _, p := range users {
				refs = append(refs, "shared -> ssl-tls-service-profile -> "+p+" -> certificate")
			}
			writeError(w, http.StatusBadRequest, "10", m[1]+" cannot be deleted because of references from: "+strings.Join(refs, ", "))
			return
		}
		delete(f.Certificates, m[1])
		f.events.Publish(CertificateDeleted{Name: m[1]})
		writeSuccess(w, "<msg>command succeeded</msg>")
	default:
		writeError(w, http.StatusBadRequest, "18", "Malformed Request")
	}
}

func (f *Firewall) get(xpath string) string {
	switch {
	case xpath == sharedCertificates:
		var b strings.Builder
		for _, name := range slices.Sorted(maps.Keys(f.Certificates)) {
			b.WriteString(certificateEntry(name, f.Certificates[name]))
		}
		return "<certificate>" + b.String() + "</certificate>"
	case strings.HasPrefix(xpath, sharedCertificates):
		if m := entryName.FindStringSubmatch(strings.TrimPrefix(xpath, sharedCertificates)); m != nil {
			if c, ok := f.Certificates[m[1]]; ok {
				return certificateEntry(m[1], c)
			}
		}
	case xpath == vsysList:
		return `<vsys><entry name="vsys1"/></vsys>`
	case xpath == sharedProfiles:
		var b strings.Builder
		for name, cert := range f.Profiles {
			b.WriteString(profileEntry(name, cert))
		}
		return "<ssl-tls-service-profile>" + b.String() + "</ssl-tls-service-profile>"
	case strings.HasPrefix(xpath, sharedProfiles):
		if m := entryName.FindStringSubmatch(strings.TrimPrefix(xpath, sharedProfiles)); m != nil {
			if cert, ok := f.Profiles[m[1]]; ok {
				return profileEntry(m[1], cert)
			}
		}
	}
	return ""
}

func (f *Firewall) profilesUsing(certificate string) []string {
	var out []string
	for _, name := range slices.Sorted(maps.Keys(f.Profiles)) {
		if f.Profiles[name] == certificate {
			out = append(out, name)
		}
	}
	return out
}

func certificateEntry(name string, c *Certificate) string {
	out := `<entry name="` + escape(name) + `"><public-key>` + escape(c.PublicKey) + `</public-key>`
	if c.PrivateKey != "" {
		out += `<private-key>` + escape(c.PrivateKey) + `</private-key>`
	}
	return out + `</entry>`
}

func profileEntry(name, cert string) string {
	out := `<entry name="` + escape(name) + `">`
	if cert != "" {
		out += `<certificate>` + escape(cert) + `</certificate>`
	}
	return out + `</entry>`
}

func (f *Firewall) importFile(w http.ResponseWriter, params url.Values, file string) {
	name := params.Get("certificate-name")
	category := params.Get("category")
	f.mu.Lock()
	refusal := f.ImportRefusal
	f.mu.Unlock()
	if refusal != "" {
		writeError(w, http.StatusBadRequest, "13", refusal)
		return
	}
	certPEM, rest, found := strings.Cut(file, "-----END CERTIFICATE-----")
	if name == "" || params.Get("format") != "pem" || !found || !strings.Contains(certPEM, "-----BEGIN CERTIFICATE-----") {
		writeError(w, http.StatusBadRequest, "18", "Import of "+name+" failed. Invalid certificate file")
		return
	}
	c := &Certificate{PublicKey: strings.TrimSpace(certPEM) + "\n-----END CERTIFICATE-----"}
	switch category {
	case "certificate":
	case "keypair":
		if !keyPairMatches(c.PublicKey, rest, params.Get("passphrase")) {
			writeError(w, http.StatusBadRequest, "18", "Import of "+name+" failed. Wrong passphrase or private key")
			return
		}
		c.PrivateKey = strings.TrimSpace(rest)
	default:
		writeError(w, http.StatusBadRequest, "18", "Invalid category "+category)
		return
	}
	f.mu.Lock()
	f.Certificates[name] = c
	f.mu.Unlock()
	f.events.Publish(CertificateImported{Name: name, Category: category})
	writeSuccess(w, "<msg><line>Successfully imported "+escape(name)+" into candidate configuration</line></msg>")
}

// keyPairMatches reports whether keyPEM is an encrypted PKCS#8 key that opens with the
// passphrase and belongs to the certificate, as a real firewall refuses any other pair.
func keyPairMatches(certPEM, keyPEM, passphrase string) bool {
	cb, _ := pem.Decode([]byte(certPEM))
	kb, _ := pem.Decode([]byte(keyPEM))
	if cb == nil || kb == nil || kb.Type != "ENCRYPTED PRIVATE KEY" || passphrase == "" {
		return false
	}
	cert, err := x509.ParseCertificate(cb.Bytes)
	if err != nil {
		return false
	}
	key, err := pkcs8.ParsePKCS8PrivateKey(kb.Bytes, []byte(passphrase))
	if err != nil {
		return false
	}
	signer, ok := key.(crypto.Signer)
	pub, ok2 := cert.PublicKey.(interface{ Equal(crypto.PublicKey) bool })
	return ok && ok2 && pub.Equal(signer.Public())
}

func (f *Firewall) commit(w http.ResponseWriter, params url.Values) {
	if params.Get("action") != "partial" || !strings.HasPrefix(params.Get("cmd"), "<commit>") {
		writeError(w, http.StatusBadRequest, "18", "Malformed commit request")
		return
	}
	f.mu.Lock()
	f.jobs++
	job := f.jobs
	profiles := map[string]string{}
	for k, v := range f.Profiles {
		profiles[k] = v
	}
	names := slices.AppendSeq([]string{}, maps.Keys(f.Certificates))
	slices.Sort(names)
	f.Committed = &Commit{Certificates: names, Profiles: profiles}
	committed := *f.Committed
	f.mu.Unlock()
	f.events.Publish(Committed{Commit: committed})
	writeSuccessCode(w, "19", fmt.Sprintf("<msg><line>Commit job enqueued with jobid %d</line></msg><job>%d</job>", job, job))
}

func writeSuccess(w http.ResponseWriter, result string) { writeSuccessCode(w, "", result) }

func writeSuccessCode(w http.ResponseWriter, code, result string) {
	attr := ""
	if code != "" {
		attr = ` code="` + code + `"`
	}
	w.Header().Set("Content-Type", "application/xml")
	_, _ = io.WriteString(w, `<response status="success"`+attr+`><result>`+result+`</result></response>`)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, `<response status="error" code="`+code+`"><msg><line>`+escape(message)+`</line></msg></response>`)
}

// escape leaves newlines raw, as PAN-OS does in a certificate's PEM: xml.EscapeText would
// write them as &#xA;, which Infisical's XML parser does not decode.
var escape = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;").Replace
