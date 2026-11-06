package acmeca

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{}

// Service answers as acme.ca.test. Each scope is its own CA under its own path, so a
// directory URL is https://acme.ca.test/<scope>/directory.
var Service = service{}

func (service) Host() string { return "acme.ca.test" }

// Scope is the first path segment.
func (service) Scope(r *http.Request) (string, bool) {
	scope, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	return scope, scope != ""
}

// DirectoryURL is the URL Infisical is configured with for one scope's CA.
func DirectoryURL(scope string) string {
	return "https://" + Service.Host() + "/" + scope + "/directory"
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Fake ACME Root CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		panic(err)
	}

	c := &CA{
		Issued: []Issued{}, events: events, key: key, cert: cert,
		nonces: map[string]bool{}, accounts: map[string]*account{}, orders: map[string]*order{},
		authzs: map[string]*authorization{}, challenges: map[string]*challenge{},
	}
	c.mux = http.NewServeMux()
	c.mux.HandleFunc("GET /{scope}/directory", c.directory)
	c.mux.HandleFunc("HEAD /{scope}/new-nonce", c.newNonce)
	c.mux.HandleFunc("GET /{scope}/new-nonce", c.newNonce)
	c.mux.HandleFunc("POST /{scope}/new-account", c.newAccount)
	c.mux.HandleFunc("POST /{scope}/accounts/{id}", c.getAccount)
	c.mux.HandleFunc("POST /{scope}/new-order", c.newOrder)
	c.mux.HandleFunc("POST /{scope}/orders/{id}", c.getOrder)
	c.mux.HandleFunc("POST /{scope}/orders/{id}/finalize", c.finalize)
	c.mux.HandleFunc("POST /{scope}/authz/{id}", c.getAuthz)
	c.mux.HandleFunc("POST /{scope}/challenges/{id}", c.respondChallenge)
	c.mux.HandleFunc("POST /{scope}/certs/{id}", c.getCertificate)
	return c
}

func (c *CA) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Replay-Nonce", c.issueNonce())
	w.Header().Set("Cache-Control", "no-store")
	c.mux.ServeHTTP(w, r)
}

func base(r *http.Request) string { return "https://" + hostOf(r) + "/" + r.PathValue("scope") }

func (c *CA) directory(w http.ResponseWriter, r *http.Request) {
	b := base(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"newNonce":   b + "/new-nonce",
		"newAccount": b + "/new-account",
		"newOrder":   b + "/new-order",
		"meta":       map[string]any{"termsOfService": b + "/terms"},
	})
}

func (c *CA) newNonce(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (c *CA) newAccount(w http.ResponseWriter, r *http.Request) {
	req, p := c.read(r, true)
	if p != nil {
		p.write(w)
		return
	}
	var in struct {
		Contact            []string `json:"contact"`
		OnlyReturnExisting bool     `json:"onlyReturnExisting"`
	}
	if err := json.Unmarshal(req.payload, &in); err != nil {
		malformed("account payload is not JSON").write(w)
		return
	}
	thumb := req.header.JWK.thumbprint()

	c.mu.Lock()
	var existing *account
	for _, a := range c.accounts {
		if a.thumbprint == thumb {
			existing = a
		}
	}
	status := http.StatusOK
	acct := existing
	if acct == nil {
		if in.OnlyReturnExisting {
			c.mu.Unlock()
			(&problem{Type: "accountDoesNotExist", Detail: "no account for this key", Status: http.StatusBadRequest}).write(w)
			return
		}
		acct = &account{id: randomID(), key: req.key, thumbprint: thumb, contact: in.Contact}
		c.accounts[acct.id] = acct
		status = http.StatusCreated
	}
	c.mu.Unlock()

	w.Header().Set("Location", base(r)+"/accounts/"+acct.id)
	writeJSON(w, status, map[string]any{"status": "valid", "contact": acct.contact, "orders": base(r) + "/accounts/" + acct.id + "/orders"})
}

func (c *CA) getAccount(w http.ResponseWriter, r *http.Request) {
	acct, _, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	if acct.id != r.PathValue("id") {
		(&problem{Type: "unauthorized", Detail: "account is not yours", Status: http.StatusForbidden}).write(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "valid", "contact": acct.contact})
}

func (c *CA) newOrder(w http.ResponseWriter, r *http.Request) {
	acct, req, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	var in struct {
		Identifiers []identifier `json:"identifiers"`
	}
	if err := json.Unmarshal(req.payload, &in); err != nil || len(in.Identifiers) == 0 {
		malformed("an order needs identifiers").write(w)
		return
	}
	for _, id := range in.Identifiers {
		if id.Type != "dns" {
			(&problem{Type: "unsupportedIdentifier", Detail: "only dns identifiers are issued", Status: http.StatusBadRequest}).write(w)
			return
		}
	}

	c.mu.Lock()
	o := &order{id: randomID(), accountID: acct.id, status: "pending", identifiers: in.Identifiers, expires: time.Now().Add(24 * time.Hour)}
	for _, id := range in.Identifiers {
		az := &authorization{id: randomID(), orderID: o.id, identifier: id, status: "pending"}
		ch := &challenge{id: randomID(), authzID: az.id, token: randomID(), status: "pending"}
		az.challengeID = ch.id
		c.authzs[az.id] = az
		c.challenges[ch.id] = ch
		o.authzIDs = append(o.authzIDs, az.id)
	}
	c.orders[o.id] = o
	body := c.orderJSON(base(r), o)
	c.mu.Unlock()

	w.Header().Set("Location", base(r)+"/orders/"+o.id)
	writeJSON(w, http.StatusCreated, body)
}

func (c *CA) getOrder(w http.ResponseWriter, r *http.Request) {
	acct, _, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	c.mu.Lock()
	o, ok := c.orders[r.PathValue("id")]
	var body map[string]any
	if ok && o.accountID == acct.id {
		body = c.orderJSON(base(r), o)
	}
	c.mu.Unlock()
	if body == nil {
		notFound("order").write(w)
		return
	}
	writeJSON(w, http.StatusOK, body)
}

func (c *CA) getAuthz(w http.ResponseWriter, r *http.Request) {
	acct, _, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	c.mu.Lock()
	az, ok := c.authzs[r.PathValue("id")]
	var body map[string]any
	if ok && c.orders[az.orderID].accountID == acct.id {
		body = c.authzJSON(base(r), az)
	}
	c.mu.Unlock()
	if body == nil {
		notFound("authorization").write(w)
		return
	}
	writeJSON(w, http.StatusOK, body)
}

// respondChallenge marks a challenge valid when the client says it is ready (a
// non-empty payload), and only reports it on a POST-as-GET.
func (c *CA) respondChallenge(w http.ResponseWriter, r *http.Request) {
	acct, req, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	c.mu.Lock()
	ch, ok := c.challenges[r.PathValue("id")]
	if !ok || c.orders[c.authzs[ch.authzID].orderID].accountID != acct.id {
		c.mu.Unlock()
		notFound("challenge").write(w)
		return
	}
	accepted := len(req.payload) > 0 && ch.status == "pending"
	if accepted {
		ch.status, ch.validated = "valid", time.Now().UTC()
		az := c.authzs[ch.authzID]
		az.status = "valid"
		o := c.orders[az.orderID]
		if allValid(c, o) {
			o.status = "ready"
		}
	}
	body := c.challengeJSON(base(r), ch)
	identifier := c.authzs[ch.authzID].identifier.Value
	c.mu.Unlock()

	if accepted {
		c.events.Publish(ChallengeAccepted{Identifier: identifier, Token: ch.token})
	}
	w.Header().Set("Link", "<"+base(r)+"/authz/"+ch.authzID+`>;rel="up"`)
	writeJSON(w, http.StatusOK, body)
}

func (c *CA) finalize(w http.ResponseWriter, r *http.Request) {
	acct, req, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	var in struct {
		CSR string `json:"csr"`
	}
	if err := json.Unmarshal(req.payload, &in); err != nil {
		malformed("finalize payload is not JSON").write(w)
		return
	}
	der, err := b64.DecodeString(in.CSR)
	if err != nil {
		(&problem{Type: "badCSR", Detail: "csr is not base64url", Status: http.StatusBadRequest}).write(w)
		return
	}
	csr, err := x509.ParseCertificateRequest(der)
	if err == nil {
		err = csr.CheckSignature()
	}
	if err != nil {
		(&problem{Type: "badCSR", Detail: "csr does not parse or verify: " + err.Error(), Status: http.StatusBadRequest}).write(w)
		return
	}

	c.mu.Lock()
	o, ok := c.orders[r.PathValue("id")]
	if !ok || o.accountID != acct.id {
		c.mu.Unlock()
		notFound("order").write(w)
		return
	}
	if o.status != "ready" {
		c.mu.Unlock()
		(&problem{Type: "orderNotReady", Detail: "order is " + o.status, Status: http.StatusForbidden}).write(w)
		return
	}
	names := orderNames(o)
	if !slices.Equal(names, csrNames(csr)) {
		c.mu.Unlock()
		(&problem{Type: "badCSR", Detail: "csr names do not match the order", Status: http.StatusBadRequest}).write(w)
		return
	}
	issued, err := c.sign(o.id, names, csr)
	if err != nil {
		c.mu.Unlock()
		(&problem{Type: "serverInternal", Detail: err.Error(), Status: http.StatusInternalServerError}).write(w)
		return
	}
	o.status, o.certPEM = "valid", issued.PEM
	c.Issued = append(c.Issued, issued)
	body := c.orderJSON(base(r), o)
	c.mu.Unlock()

	c.events.Publish(CertificateIssued{issued})
	w.Header().Set("Location", base(r)+"/orders/"+o.id)
	writeJSON(w, http.StatusOK, body)
}

func (c *CA) getCertificate(w http.ResponseWriter, r *http.Request) {
	acct, _, p := c.owner(r)
	if p != nil {
		p.write(w)
		return
	}
	c.mu.Lock()
	o, ok := c.orders[r.PathValue("id")]
	var chain string
	if ok && o.accountID == acct.id {
		chain = o.certPEM
	}
	c.mu.Unlock()
	if chain == "" {
		notFound("certificate").write(w)
		return
	}
	w.Header().Set("Content-Type", "application/pem-certificate-chain")
	_, _ = w.Write([]byte(chain))
}

// sign issues a leaf naming the order's identifiers as SANs and no common name,
// which is what Pebble does. Called with the lock held.
func (c *CA) sign(orderID string, names []string, csr *x509.CertificateRequest) (Issued, error) {
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return Issued{}, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		DNSNames:     names,
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(90 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, c.cert, csr.PublicKey, c.key)
	if err != nil {
		return Issued{}, err
	}
	chain := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})) +
		string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.cert.Raw}))
	return Issued{OrderID: orderID, Names: names, Serial: hex.EncodeToString(serial.Bytes()), PEM: chain, IssuedAt: time.Now().UTC()}, nil
}

// owner verifies a kid-signed request and returns the account that sent it.
func (c *CA) owner(r *http.Request) (*account, *signedRequest, *problem) {
	req, p := c.read(r, false)
	if p != nil {
		return nil, nil, p
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.accounts[accountIDFromURL(req.header.Kid)], req, nil
}

func (c *CA) orderJSON(b string, o *order) map[string]any {
	authzs := make([]string, 0, len(o.authzIDs))
	for _, id := range o.authzIDs {
		authzs = append(authzs, b+"/authz/"+id)
	}
	body := map[string]any{
		"status":         o.status,
		"expires":        o.expires.Format(time.RFC3339),
		"identifiers":    o.identifiers,
		"authorizations": authzs,
		"finalize":       b + "/orders/" + o.id + "/finalize",
	}
	if o.certPEM != "" {
		body["certificate"] = b + "/certs/" + o.id
	}
	return body
}

func (c *CA) authzJSON(b string, az *authorization) map[string]any {
	return map[string]any{
		"status":     az.status,
		"identifier": az.identifier,
		"challenges": []any{c.challengeJSON(b, c.challenges[az.challengeID])},
		"expires":    time.Now().Add(24 * time.Hour).Format(time.RFC3339),
	}
}

func (c *CA) challengeJSON(b string, ch *challenge) map[string]any {
	body := map[string]any{"type": "dns-01", "url": b + "/challenges/" + ch.id, "token": ch.token, "status": ch.status}
	if !ch.validated.IsZero() {
		body["validated"] = ch.validated.Format(time.RFC3339)
	}
	return body
}

func allValid(c *CA, o *order) bool {
	for _, id := range o.authzIDs {
		if c.authzs[id].status != "valid" {
			return false
		}
	}
	return true
}

func orderNames(o *order) []string {
	var names []string
	for _, id := range o.identifiers {
		names = append(names, strings.ToLower(id.Value))
	}
	slices.Sort(names)
	return slices.Compact(names)
}

func csrNames(csr *x509.CertificateRequest) []string {
	names := []string{}
	if csr.Subject.CommonName != "" {
		names = append(names, strings.ToLower(csr.Subject.CommonName))
	}
	for _, n := range csr.DNSNames {
		names = append(names, strings.ToLower(n))
	}
	slices.Sort(names)
	return slices.Compact(names)
}

func (c *CA) issueNonce() string {
	n := randomID()
	c.mu.Lock()
	c.nonces[n] = true
	c.mu.Unlock()
	return n
}

func (c *CA) takeNonce(n string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.nonces[n] {
		return false
	}
	delete(c.nonces, n)
	return true
}

func randomID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return b64.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
