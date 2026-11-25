// Package azureadcs fakes Active Directory Certificate Services web enrollment
// (certsrv): requests posted to certfnsh.asp and certificates read back from
// certnew.cer, every page behind NTLM.
//
// A request is answered with the page AD CS shows for an issued certificate, which
// links to certnew.cer rather than carrying the certificate, so a client has to read
// it back. certnew.cer?ReqID=CACert serves the CA's own certificate, and certrqxt.asp
// lists the published templates. A template seeded as a CA template (a SubCA
// template) issues a CA certificate under the request's full subject, which is how an
// intermediate is signed.
package azureadcs

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Service answers as one AD CS web enrollment server.
//
// The certsrv URL is always the customer's own, so there is no name the client has
// hardcoded. Each test's server lives under its own first path segment of one fixed
// name, as acmeca's directories do, so a connection reaches it only through fakenet's
// DNS and CA.
var Service = service{}

type service struct{}

func (service) Host() string { return "certsrv.adcs.test" }

// Scope is the first path segment.
func (service) Scope(r *http.Request) (string, bool) {
	scope, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	return scope, scope != ""
}

// URL is the ADCS URL a connection for a scope is configured with.
func URL(scope string) string { return "https://" + Service.Host() + "/" + scope }

// Password is the password of the account a test invented. NTLM refuses any other.
func Password(username string) string { return "pw-" + username }

func (service) New(events fakenet.Emitter) fakenet.Fake {
	s := &Server{Requests: map[int]*Request{}, events: events, ca: issuer.New("Fake AD CS Root CA"), challenge: newChallenge()}
	s.mux = http.NewServeMux()
	s.mux.HandleFunc("GET /{scope}/certsrv/{page}", s.page)
	s.mux.HandleFunc("POST /{scope}/certsrv/certfnsh.asp", s.submit)
	s.mux.HandleFunc("GET /{scope}/certsrv/certnew.cer", s.download)
	return s
}

// Server is one CA's state.
type Server struct {
	// Templates are the certificate templates the CA publishes.
	Templates []string `json:"templates"`
	// CATemplates are the published templates that issue CA certificates.
	CATemplates []string `json:"caTemplates"`
	// Requests by request id.
	Requests map[int]*Request `json:"requests"`
	// Root is the CA that signs every certificate, in PEM.
	Root string `json:"root"`

	mu        sync.Mutex
	mux       *http.ServeMux
	events    fakenet.Emitter
	ca        *issuer.CA
	challenge []byte
}

// Request is one certificate request the CA received.
type Request struct {
	ID          int    `json:"id"`
	Template    string `json:"template"`
	Username    string `json:"username"`
	CommonName  string `json:"commonName"`
	Disposition string `json:"disposition"`
	PEM         string `json:"pem,omitempty"`
	// CA is set when the template issued a CA certificate.
	CA bool `json:"ca,omitempty"`
}

func (s *Server) Snapshot() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Root = s.ca.RootPEM()
	return json.Marshal(s)
}

func (s *Server) Seed(raw []byte) error {
	var in struct {
		Templates   []string `json:"templates"`
		CATemplates []string `json:"caTemplates"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range append(in.Templates, in.CATemplates...) {
		if !slices.Contains(s.Templates, t) {
			s.Templates = append(s.Templates, t)
		}
	}
	for _, t := range in.CATemplates {
		if !slices.Contains(s.CATemplates, t) {
			s.CATemplates = append(s.CATemplates, t)
		}
	}
	return nil
}

// ServeHTTP runs the NTLM handshake IIS does on every certsrv page before routing.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	user, ok := s.ntlm(w, r)
	if !ok {
		return
	}
	r.Header.Set("X-Fake-Ntlm-User", user)
	s.mux.ServeHTTP(w, r)
}

// ntlm answers the first two legs of the handshake with 401 and returns the user once
// a type 3 message proves the password.
func (s *Server) ntlm(w http.ResponseWriter, r *http.Request) (string, bool) {
	unauthorized := func(challenge string) {
		w.Header().Set("WWW-Authenticate", challenge)
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = fmt.Fprint(w, "<html><body><h1>401 - Unauthorized: Access is denied due to invalid credentials.</h1></body></html>")
	}
	kind, msg, err := messageType(r.Header.Get("Authorization"))
	if err != nil {
		unauthorized("NTLM")
		return "", false
	}
	switch kind {
	case 1:
		unauthorized(challengeMessage(s.challenge))
		return "", false
	case 3:
		auth, err := parseAuthenticate(msg)
		if err != nil || !verifyNTLMv2(auth, Password(auth.user), s.challenge) {
			unauthorized("NTLM")
			return "", false
		}
		return auth.user, true
	}
	unauthorized("NTLM")
	return "", false
}

const pageTitle = "<html><head><title>Microsoft Active Directory Certificate Services</title></head><body>"

func (s *Server) page(w http.ResponseWriter, r *http.Request) {
	switch r.PathValue("page") {
	case "", "default.asp", "certrqus.asp":
		writeHTML(w, pageTitle+"<p>Microsoft Active Directory Certificate Services -- HARNESS-CA</p><p>Request a certificate</p></body></html>")
	case "certrqxt.asp":
		s.mu.Lock()
		var options strings.Builder
		for _, t := range s.Templates {
			fmt.Fprintf(&options, `<option value="E;%s;1;1;41;16;-1509949440;0;">%s</option>`, html.EscapeString(t), html.EscapeString(t))
		}
		s.mu.Unlock()
		writeHTML(w, pageTitle+`<form><select id="lbCertTemplateID" name="lbCertTemplate">`+options.String()+`</select></form></body></html>`)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) submit(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil || r.PostForm.Get("Mode") != "newreq" {
		writeHTML(w, pageTitle+"<p>Certificate Services Error: the request is missing Mode=newreq.</p></body></html>")
		return
	}
	template := ""
	for _, line := range strings.Split(r.PostForm.Get("CertAttrib"), "\r\n") {
		if v, ok := strings.CutPrefix(line, "CertificateTemplate:"); ok {
			template = strings.TrimSpace(v)
		}
	}
	csr, err := issuer.ParseCSR(r.PostForm.Get("CertRequest"))
	if err != nil {
		writeHTML(w, pageTitle+"<p>Error Parsing Request ASN1 bad tag value met. 0x8009310b</p></body></html>")
		return
	}

	s.mu.Lock()
	id := len(s.Requests) + 1
	req := &Request{ID: id, Template: template, Username: r.Header.Get("X-Fake-Ntlm-User"), CommonName: csr.Subject.CommonName}
	s.Requests[id] = req
	if !slices.Contains(s.Templates, template) {
		req.Disposition = "denied"
		s.mu.Unlock()
		s.events.Publish(RequestDenied{RequestID: id, Template: template})
		writeHTML(w, pageTitle+fmt.Sprintf(`<p>Your certificate request was denied. Your Request Id is %d. The disposition message is "Denied by Policy Module  0x80094800, The requested certificate template is not supported by this CA."</p></body></html>`, id))
		return
	}
	var pemCert string
	if slices.Contains(s.CATemplates, template) {
		pemCert, err = s.ca.SignCA(csr, time.Now().AddDate(5, 0, 0))
	} else {
		var leaf issuer.Leaf
		leaf, err = s.ca.Sign(csr, 365)
		pemCert = leaf.PEM
	}
	if err != nil {
		s.mu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Disposition, req.PEM, req.CA = "issued", pemCert, slices.Contains(s.CATemplates, template)
	s.mu.Unlock()

	s.events.Publish(CertificateIssued{RequestID: id, Template: template, Username: req.Username})
	writeHTML(w, pageTitle+fmt.Sprintf(`<p>Certificate Issued</p><p>The certificate you requested was issued to you.</p><a href="certnew.cer?ReqID=%d&amp;Enc=b64">Download certificate</a></body></html>`, id))
}

func (s *Server) download(w http.ResponseWriter, r *http.Request) {
	q, _ := url.ParseQuery(r.URL.RawQuery)
	if q.Get("ReqID") == "CACert" {
		w.Header().Set("Content-Type", "application/pkix-cert")
		_, _ = fmt.Fprint(w, s.ca.RootPEM())
		return
	}
	id, _ := strconv.Atoi(q.Get("ReqID"))
	s.mu.Lock()
	req := s.Requests[id]
	s.mu.Unlock()
	if req == nil || req.PEM == "" {
		writeHTML(w, pageTitle+"<p>Certificate Services Error: the certificate request id is unknown or was not issued.</p></body></html>")
		return
	}
	w.Header().Set("Content-Type", "application/pkix-cert")
	_, _ = fmt.Fprint(w, req.PEM)
}

func writeHTML(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "text/html")
	_, _ = fmt.Fprint(w, body)
}
