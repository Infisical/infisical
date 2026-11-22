// Package oci fakes the Oracle Cloud Identity API's GetUser call, which Infisical makes
// with the signed headers a workload sends for machine identity OCI auth.
//
// The keyId of the HTTP signature, <tenancy>/<user>/<fingerprint>, is the scope. A test
// registers the user's public key and profile, and signs the request itself; a request
// signed with another key is refused here, as OCI refuses it.
package oci

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Region is the only region served.
const Region = "us-ashburn-1"

var Service = service{host: "identity." + Region + ".oraclecloud.com"}

type service struct{ host string }

func (s service) Host() string { return s.host }

func (service) Scope(r *http.Request) (string, bool) {
	keyID := param(r.Header.Get("Authorization"), "keyId")
	return keyID, keyID != ""
}

func (service) New(_ fakenet.Emitter) fakenet.Fake {
	u := &User{}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /20160918/users/{ocid}", u.get)
	u.mux = mux
	return u
}

// User is the OCI user that owns one API key.
type User struct {
	OCID          string `json:"ocid"`
	Name          string `json:"name"`
	CompartmentID string `json:"compartmentId"`
	PublicKeyPEM  string `json:"publicKeyPem"`

	mu  sync.Mutex
	mux *http.ServeMux
}

func (u *User) ServeHTTP(w http.ResponseWriter, r *http.Request) { u.mux.ServeHTTP(w, r) }

func (u *User) get(w http.ResponseWriter, r *http.Request) {
	u.mu.Lock()
	user := struct{ ocid, name, compartment, pub string }{u.OCID, u.Name, u.CompartmentID, u.PublicKeyPEM}
	u.mu.Unlock()

	if !verify(r, user.pub) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"code": "NotAuthenticated", "message": "The required information to complete authentication was not provided or was incorrect."})
		return
	}
	if r.PathValue("ocid") != user.ocid {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": "NotAuthorizedOrNotFound", "message": "Authorization failed or requested resource not found."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": user.ocid, "name": user.name, "compartmentId": user.compartment,
		"lifecycleState": "ACTIVE", "description": "harness user",
	})
}

// SigningString is what an OCI request signature covers: date, (request-target), host.
func SigningString(method, path, host, date string) string {
	return "date: " + date + "\n(request-target): " + strings.ToLower(method) + " " + path + "\nhost: " + host
}

// Authorization signs a GET of path and returns the Authorization header value.
func Authorization(key *rsa.PrivateKey, keyID, path, host, date string) (string, error) {
	digest := sha256.Sum256([]byte(SigningString(http.MethodGet, path, host, date)))
	sig, err := rsa.SignPKCS1v15(nil, key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}
	return `Signature version="1",keyId="` + keyID + `",algorithm="rsa-sha256",headers="date (request-target) host",signature="` +
		base64.StdEncoding.EncodeToString(sig) + `"`, nil
}

func verify(r *http.Request, pubPEM string) bool {
	block, _ := pem.Decode([]byte(pubPEM))
	if block == nil {
		return false
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false
	}
	pub, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return false
	}
	auth := r.Header.Get("Authorization")
	sig, err := base64.StdEncoding.DecodeString(param(auth, "signature"))
	if err != nil {
		return false
	}
	date := r.Header.Get("Date")
	if date == "" {
		date = r.Header.Get("X-Date")
	}
	digest := sha256.Sum256([]byte(SigningString(r.Method, r.URL.Path, r.Host, date)))
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig) == nil
}

func param(auth, name string) string {
	for _, part := range strings.Split(strings.TrimPrefix(auth, "Signature "), ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && k == name {
			return strings.Trim(v, `"`)
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (u *User) Snapshot() ([]byte, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	return json.Marshal(struct {
		OCID          string `json:"ocid"`
		Name          string `json:"name"`
		CompartmentID string `json:"compartmentId"`
	}{u.OCID, u.Name, u.CompartmentID})
}

func (u *User) Seed(raw []byte) error {
	var in struct {
		OCID          string `json:"ocid"`
		Name          string `json:"name"`
		CompartmentID string `json:"compartmentId"`
		PublicKeyPEM  string `json:"publicKeyPem"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	u.OCID, u.Name, u.CompartmentID, u.PublicKeyPEM = in.OCID, in.Name, in.CompartmentID, in.PublicKeyPEM
	return nil
}

// ControlPlane is a test's view of one OCI API key.
type ControlPlane struct {
	*fakenet.Scope[User]
	KeyID string
}

// Open registers a user and the public half of its API key under keyID.
func Open(tt *testing.T, adminURL, keyID, userOCID, name, tenancyOCID, publicKeyPEM string) *ControlPlane {
	tt.Helper()
	cp := &ControlPlane{Scope: fakenet.Open[User](tt, adminURL, Service.Host(), keyID), KeyID: keyID}
	cp.Seed(tt, map[string]string{"ocid": userOCID, "name": name, "compartmentId": tenancyOCID, "publicKeyPem": publicKeyPEM})
	return cp
}
