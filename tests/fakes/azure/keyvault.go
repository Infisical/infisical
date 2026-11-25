package azure

import (
	"crypto/sha1"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// KeyVault answers as every Key Vault, <vault>.vault.azure.net. It is scoped by the
// access token the tenant's token endpoint minted ("azure-<client id>"), read as the
// client id, so a test opens it with the connection's client id.
var KeyVault = vaultService{}

type vaultService struct{}

func (vaultService) Host() string { return "*.vault.azure.net" }

func (vaultService) Scope(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer azure-")
	return token, ok && token != ""
}

func (vaultService) New(events fakenet.Emitter) fakenet.Fake {
	v := &Vaults{Vaults: map[string]*Vault{}, events: events}
	v.mux = http.NewServeMux()
	v.mux.HandleFunc("GET /certificates", v.list)
	v.mux.HandleFunc("GET /certificates/{name}", v.get)
	v.mux.HandleFunc("GET /certificates/{name}/{version}", v.get)
	v.mux.HandleFunc("POST /certificates/{name}/import", v.importCertificate)
	v.mux.HandleFunc("DELETE /certificates/{name}", v.delete)
	return v
}

// Vaults is every Key Vault one client can reach, by vault name.
type Vaults struct {
	Vaults map[string]*Vault `json:"vaults"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// Vault holds certificates by name, and the names deleted but still recoverable, which
// Key Vault's soft delete keeps from being reused.
type Vault struct {
	Certificates map[string]*VaultCertificate `json:"certificates"`
	Deleted      []string                     `json:"deleted,omitempty"`
}

// VaultCertificate is a certificate object: the latest version's certificate and the
// PEM it was imported from, which holds its key and chain.
type VaultCertificate struct {
	Version     string `json:"version"`
	Versions    int    `json:"versions"`
	Certificate string `json:"certificate"`
	Imported    string `json:"imported"`
	ContentType string `json:"contentType"`
	Enabled     bool   `json:"enabled"`
}

type VaultCertificateDetail struct {
	Vault string `json:"vault"`
	Name  string `json:"name"`
}

type VaultCertificateImported struct{ VaultCertificateDetail }
type VaultCertificateDeleted struct{ VaultCertificateDetail }

func (VaultCertificateImported) EventName() string { return "azure.vault-certificate-imported" }
func (VaultCertificateDeleted) EventName() string  { return "azure.vault-certificate-deleted" }

// WithVault is a seed fragment creating an empty vault.
func WithVault(name string) any {
	return map[string]any{"vaults": map[string]any{name: map[string]any{"certificates": map[string]any{}}}}
}

func (v *Vaults) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("api-version") == "" {
		vaultError(w, http.StatusBadRequest, "MissingApiVersionParameter", "The api-version query parameter (?api-version=) is required for all requests.")
		return
	}
	v.mux.ServeHTTP(w, r)
}

func vaultName(r *http.Request) string {
	name, _, _ := strings.Cut(r.Host, ".")
	return name
}

func (v *Vaults) vault(w http.ResponseWriter, r *http.Request) (*Vault, bool) {
	vault, ok := v.Vaults[vaultName(r)]
	if !ok {
		vaultError(w, http.StatusForbidden, "Forbidden", "The user, group or application does not have certificates permissions on key vault '"+vaultName(r)+"'.")
	}
	return vault, ok
}

func baseURL(r *http.Request) string { return "https://" + r.Host }

// vaultListPage is the most a certificate list page holds. Key Vault returns "up to 25"
// per page, or up to maxresults; capping every page at two, whatever the client asks
// for, makes any vault with a few certificates exercise nextLink.
const vaultListPage = 2

func (v *Vaults) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	size := vaultListPage
	if raw := q.Get("maxresults"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 25 {
			vaultError(w, http.StatusBadRequest, "BadParameter", "maxresults must be between 1 and 25.")
			return
		}
		size = min(n, vaultListPage)
	}
	start := 0
	if raw := q.Get("$skiptoken"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			vaultError(w, http.StatusBadRequest, "BadParameter", "The $skiptoken is invalid.")
			return
		}
		start = n
	}

	v.mu.Lock()
	vault, ok := v.vault(w, r)
	if !ok {
		v.mu.Unlock()
		return
	}
	names := slices.Sorted(maps.Keys(vault.Certificates))
	start = min(start, len(names))
	end := min(start+size, len(names))
	value := make([]map[string]any, 0, end-start)
	for _, name := range names[start:end] {
		c := vault.Certificates[name]
		value = append(value, map[string]any{
			"id":         baseURL(r) + "/certificates/" + name,
			"attributes": map[string]any{"enabled": c.Enabled},
		})
	}
	v.mu.Unlock()

	var next any
	if end < len(names) {
		next = baseURL(r) + "/certificates?" + url.Values{
			"api-version": {q.Get("api-version")},
			"maxresults":  {strconv.Itoa(size)},
			"$skiptoken":  {strconv.Itoa(end)},
		}.Encode()
	}
	writeJSON(w, http.StatusOK, map[string]any{"value": value, "nextLink": next})
}

func (v *Vaults) get(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	v.mu.Lock()
	vault, ok := v.vault(w, r)
	if !ok {
		v.mu.Unlock()
		return
	}
	c, found := vault.Certificates[name]
	var out VaultCertificate
	if found {
		out = *c
	}
	v.mu.Unlock()
	if !found || (r.PathValue("version") != "" && r.PathValue("version") != out.Version) {
		vaultError(w, http.StatusNotFound, "CertificateNotFound", "A certificate with (name/id) "+name+" was not found in this key vault.")
		return
	}
	writeJSON(w, http.StatusOK, out.bundle(baseURL(r), name))
}

type importBody struct {
	Value  string `json:"value"`
	Policy struct {
		SecretProps struct {
			ContentType string `json:"contentType"`
		} `json:"secret_props"`
	} `json:"policy"`
	Attributes struct {
		Enabled *bool `json:"enabled"`
	} `json:"attributes"`
}

func (v *Vaults) importCertificate(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var in importBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		vaultError(w, http.StatusBadRequest, "BadParameter", "The request body is not valid JSON.")
		return
	}
	raw, err := base64.StdEncoding.DecodeString(in.Value)
	if err != nil || in.Policy.SecretProps.ContentType != "application/x-pem-file" {
		vaultError(w, http.StatusBadRequest, "BadParameter", "The specified PEM X.509 certificate content is in an unexpected format. Please check if certificate is in valid PEM format.")
		return
	}
	leaf, hasKey := pemLeafAndKey(raw)
	if leaf == nil || !hasKey {
		vaultError(w, http.StatusBadRequest, "BadParameter", "Private key is not specified in the specified X.509 PEM certificate content. Please specify private key in the X.509 PEM certificate content.")
		return
	}
	v.mu.Lock()
	vault, ok := v.vault(w, r)
	if !ok {
		v.mu.Unlock()
		return
	}
	for _, d := range vault.Deleted {
		if d == name {
			v.mu.Unlock()
			vaultError(w, http.StatusConflict, "Conflict", "Certificate "+name+" is currently in a deleted but recoverable state, and its name cannot be reused; in this state, the certificate can only be recovered or purged.")
			return
		}
	}
	c, exists := vault.Certificates[name]
	if !exists {
		c = &VaultCertificate{}
		vault.Certificates[name] = c
	}
	c.Version = id.Hex(16)
	c.Versions++
	c.Certificate = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: leaf.Raw}))
	c.Imported = string(raw)
	c.ContentType = in.Policy.SecretProps.ContentType
	c.Enabled = in.Attributes.Enabled == nil || *in.Attributes.Enabled
	out := *c
	v.mu.Unlock()
	v.events.Publish(VaultCertificateImported{VaultCertificateDetail{Vault: vaultName(r), Name: name}})
	writeJSON(w, http.StatusOK, out.bundle(baseURL(r), name))
}

func (v *Vaults) delete(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	v.mu.Lock()
	vault, ok := v.vault(w, r)
	if !ok {
		v.mu.Unlock()
		return
	}
	c, found := vault.Certificates[name]
	if found {
		delete(vault.Certificates, name)
		vault.Deleted = append(vault.Deleted, name)
	}
	v.mu.Unlock()
	if !found {
		vaultError(w, http.StatusNotFound, "CertificateNotFound", "A certificate with (name/id) "+name+" was not found in this key vault.")
		return
	}
	v.events.Publish(VaultCertificateDeleted{VaultCertificateDetail{Vault: vaultName(r), Name: name}})
	writeJSON(w, http.StatusOK, c.bundle(baseURL(r), name))
}

// pemLeafAndKey reads an imported PEM: its first certificate, which Key Vault takes as
// the certificate, and whether it carries a private key.
func pemLeafAndKey(raw []byte) (*x509.Certificate, bool) {
	var leaf *x509.Certificate
	hasKey := false
	for rest := raw; ; {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return leaf, hasKey
		}
		switch {
		case block.Type == "CERTIFICATE" && leaf == nil:
			c, err := x509.ParseCertificate(block.Bytes)
			if err != nil {
				return nil, false
			}
			leaf = c
		case strings.HasSuffix(block.Type, "PRIVATE KEY"):
			hasKey = true
		}
	}
}

func (c VaultCertificate) bundle(base, name string) map[string]any {
	block, _ := pem.Decode([]byte(c.Certificate))
	var der []byte
	if block != nil {
		der = block.Bytes
	}
	thumb := sha1.Sum(der)
	return map[string]any{
		"id":         base + "/certificates/" + name + "/" + c.Version,
		"kid":        base + "/keys/" + name + "/" + c.Version,
		"sid":        base + "/secrets/" + name + "/" + c.Version,
		"x5t":        base64.RawURLEncoding.EncodeToString(thumb[:]),
		"cer":        base64.StdEncoding.EncodeToString(der),
		"attributes": map[string]any{"enabled": c.Enabled},
		"policy":     map[string]any{"secret_props": map[string]any{"contentType": c.ContentType}},
	}
}

func vaultError(w http.ResponseWriter, status int, code, message string) {
	if status == http.StatusUnauthorized {
		w.Header().Set("WWW-Authenticate", `Bearer authorization="https://login.microsoftonline.com/common", resource="https://vault.azure.net"`)
	}
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func (v *Vaults) Snapshot() ([]byte, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	return json.Marshal(struct {
		Vaults map[string]*Vault `json:"vaults"`
	}{v.Vaults})
}

func (v *Vaults) Seed(raw []byte) error {
	var in struct {
		Vaults map[string]*Vault `json:"vaults"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	for name, vault := range in.Vaults {
		if vault.Certificates == nil {
			vault.Certificates = map[string]*VaultCertificate{}
		}
		if existing, ok := v.Vaults[name]; ok {
			for cn, c := range vault.Certificates {
				existing.Certificates[cn] = c
			}
			continue
		}
		v.Vaults[name] = vault
	}
	return nil
}

// VaultControlPlane is a test's view of the vaults one client reaches.
type VaultControlPlane struct {
	*fakenet.Scope[Vaults]
}

// OpenKeyVault returns the vaults a client id's tokens reach.
func OpenKeyVault(tt *testing.T, adminURL, clientID string) *VaultControlPlane {
	tt.Helper()
	fakenet.Track(tt, adminURL, KeyVault.Host(), clientID)
	return &VaultControlPlane{fakenet.Open[Vaults](tt, adminURL, KeyVault.Host(), clientID)}
}
