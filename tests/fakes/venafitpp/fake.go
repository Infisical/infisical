// Package venafitpp fakes a Venafi Trust Protection Platform server: OAuth tokens from
// /vedauth, and certificate requests and retrieval under /vedsdk.
//
// A request is accepted with no certificate in the answer, and the first retrieve of
// it answers 202 the way TPP does while its workflow runs, so a client has to poll.
package venafitpp

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// Service answers as one TPP server.
//
// A TPP URL is always the customer's own, so there is no name the client has
// hardcoded. Each test's server lives under its own first path segment of one fixed
// name, as acmeca's directories do, so a connection reaches it only through fakenet's
// DNS and CA.
var Service = service{}

type service struct{}

func (service) Host() string { return "tpp.venafi.test" }

// Scope is the first path segment.
func (service) Scope(r *http.Request) (string, bool) {
	scope, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	return scope, scope != ""
}

// URL is the TPP URL a connection for a scope is configured with.
func URL(scope string) string { return "https://" + Service.Host() + "/" + scope }

// Password is the password of the user a test invented. TPP refuses any other.
func Password(username string) string { return "pw-" + username }

func (service) New(events fakenet.Emitter) fakenet.Fake {
	s := &Server{Certificates: map[string]*Certificate{}, Tokens: map[string]*Token{}, events: events, ca: issuer.New("Fake Venafi Root CA")}
	s.mux = http.NewServeMux()
	s.mux.HandleFunc("POST /{scope}/vedauth/authorize/oauth", s.authorize)
	s.mux.HandleFunc("GET /{scope}/vedauth/revoke/token", s.revoke)
	s.mux.HandleFunc("POST /{scope}/vedsdk/certificates/request", s.request)
	s.mux.HandleFunc("POST /{scope}/vedsdk/certificates/retrieve", s.retrieve)
	return s
}

// Server is one TPP server's state.
type Server struct {
	// Certificates by certificate DN.
	Certificates map[string]*Certificate `json:"certificates"`
	// Tokens by access token.
	Tokens map[string]*Token `json:"tokens"`
	// Root is the CA that signs every certificate, in PEM.
	Root string `json:"root"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	ca     *issuer.CA
}

// Token is an access token TPP issued.
type Token struct {
	Username string `json:"username"`
	ClientID string `json:"clientId"`
	Scope    string `json:"scope"`
	Revoked  bool   `json:"revoked"`
}

// Certificate is one certificate object under a policy folder.
type Certificate struct {
	DN         string `json:"dn"`
	PolicyDN   string `json:"policyDN"`
	ObjectName string `json:"objectName"`
	Origin     string `json:"origin"`
	// Retrievals counts retrieve calls since the latest request.
	Retrievals int `json:"retrievals"`
	// Requests counts requests on the object; a request for an existing object
	// re-enrolls it, as a renewal does.
	Requests int    `json:"requests"`
	PEM      string `json:"pem"`
}

func (s *Server) Snapshot() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Root = s.ca.RootPEM()
	return json.Marshal(s)
}

// Seed accepts nothing: every token and certificate is one a client asked for.
func (s *Server) Seed([]byte) error { return nil }

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ClientID string `json:"client_id"`
		Username string `json:"username"`
		Password string `json:"password"`
		Scope    string `json:"scope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Username == "" || in.ClientID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "client_id, username and password are required"})
		return
	}
	if in.Password != Password(in.Username) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant", "error_description": "Username/password combination not valid"})
		return
	}
	token := id.Hex(16)
	s.mu.Lock()
	s.Tokens[token] = &Token{Username: in.Username, ClientID: in.ClientID, Scope: in.Scope}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": token, "refresh_token": id.Hex(16), "expires": time.Now().Add(time.Hour).Unix(),
		"expires_in": 3600, "token_type": "Bearer", "scope": in.Scope, "identity": "local:{" + in.Username + "}",
	})
}

// token is the live token a request carries, or nil after answering 401. Called
// without the lock.
func (s *Server) token(w http.ResponseWriter, r *http.Request) *Token {
	raw, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	s.mu.Lock()
	t := s.Tokens[raw]
	s.mu.Unlock()
	if t == nil || t.Revoked {
		w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_token", "error_description": "Grant has been revoked, has expired, or the refresh token is invalid"})
		return nil
	}
	return t
}

func (s *Server) revoke(w http.ResponseWriter, r *http.Request) {
	t := s.token(w, r)
	if t == nil {
		return
	}
	s.mu.Lock()
	t.Revoked = true
	user := t.Username
	s.mu.Unlock()
	s.events.Publish(TokenRevoked{Username: user})
	w.WriteHeader(http.StatusOK)
}

func (s *Server) request(w http.ResponseWriter, r *http.Request) {
	if s.token(w, r) == nil {
		return
	}
	var in struct {
		PolicyDN   string `json:"PolicyDN"`
		PKCS10     string `json:"PKCS10"`
		ObjectName string `json:"ObjectName"`
		Origin     string `json:"Origin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.PolicyDN == "" || in.ObjectName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"Error": "PolicyDN and ObjectName are required"})
		return
	}
	csr, err := issuer.ParseCSR(in.PKCS10)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"Error": "PKCS10 is invalid: " + err.Error()})
		return
	}
	leaf, err := s.ca.Sign(csr, 365)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"Error": err.Error()})
		return
	}
	dn := strings.TrimRight(in.PolicyDN, `\`) + `\` + in.ObjectName
	s.mu.Lock()
	requests := 1
	if prev := s.Certificates[dn]; prev != nil {
		requests = prev.Requests + 1
	}
	s.Certificates[dn] = &Certificate{DN: dn, PolicyDN: in.PolicyDN, ObjectName: in.ObjectName, Origin: in.Origin, PEM: leaf.PEM, Requests: requests}
	s.mu.Unlock()
	s.events.Publish(CertificateRequested{DN: dn})
	writeJSON(w, http.StatusOK, map[string]string{"CertificateDN": dn, "Guid": "{" + id.Hex(16) + "}"})
}

func (s *Server) retrieve(w http.ResponseWriter, r *http.Request) {
	if s.token(w, r) == nil {
		return
	}
	var in struct {
		CertificateDN string `json:"CertificateDN"`
		IncludeChain  bool   `json:"IncludeChain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"Error": "invalid body"})
		return
	}
	s.mu.Lock()
	c := s.Certificates[in.CertificateDN]
	if c == nil {
		s.mu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"Error": "Certificate does not exist: " + in.CertificateDN})
		return
	}
	c.Retrievals++
	if c.Retrievals == 1 {
		s.mu.Unlock()
		writeJSON(w, http.StatusAccepted, map[string]string{"Stage": "500", "Status": "Post CSR"})
		return
	}
	data := c.PEM
	if in.IncludeChain {
		data += s.ca.RootPEM()
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]string{"CertificateData": base64.StdEncoding.EncodeToString([]byte(data)), "Format": "Base64", "Filename": c.ObjectName + ".cer"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
