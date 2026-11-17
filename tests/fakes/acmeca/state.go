// Package acmeca fakes an upstream ACME certificate authority (RFC 8555), the role
// Let's Encrypt plays for an Infisical ACME CA.
//
// It checks what a real CA checks on the wire: every request is a JWS whose
// signature, nonce and url are verified, an account only reaches its own orders, and a
// finalize CSR has to name exactly the order's identifiers. It validates DNS-01 by
// reading the TXT record the DNS provider fakes publish to fakenet: an answer whose
// _acme-challenge record does not hold the key authorization digest makes the
// challenge, its authorization and the order invalid, so a record with the wrong name
// or value fails issuance as it would against Let's Encrypt.
package acmeca

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// CA is one scope's certificate authority.
type CA struct {
	// Issued is every certificate the CA signed, oldest first.
	Issued []Issued `json:"issued"`

	mu         sync.Mutex
	mux        *http.ServeMux
	events     fakenet.Emitter
	key        *ecdsa.PrivateKey
	cert       *x509.Certificate
	nonces     map[string]bool
	accounts   map[string]*account
	orders     map[string]*order
	authzs     map[string]*authorization
	challenges map[string]*challenge
}

// Issued is one certificate the CA signed.
type Issued struct {
	OrderID  string    `json:"orderId"`
	Names    []string  `json:"names"`
	Serial   string    `json:"serial"`
	PEM      string    `json:"pem"`
	IssuedAt time.Time `json:"issuedAt"`
}

type account struct {
	id         string
	key        crypto.PublicKey
	thumbprint string
	contact    []string
}

type identifier struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type order struct {
	id          string
	accountID   string
	status      string
	identifiers []identifier
	authzIDs    []string
	certPEM     string
	expires     time.Time
}

type authorization struct {
	id          string
	orderID     string
	identifier  identifier
	status      string
	challengeID string
}

type challenge struct {
	id        string
	authzID   string
	token     string
	status    string
	validated time.Time
	err       *problem
}

func (c *CA) Snapshot() ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return json.Marshal(struct {
		Issued []Issued `json:"issued"`
	}{c.Issued})
}

// Seed accepts nothing: everything the CA holds is what a client asked it for.
func (c *CA) Seed([]byte) error { return nil }
