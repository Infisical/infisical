package fakenet

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// serveCertificate makes the TLS listener present cert to clients asking for name,
// in place of the certificate the CA would mint, until clearCertificate. It shares
// the per-name cache certFor reads before minting, so the next handshake for the
// name already gets it.
func (c *CA) serveCertificate(name string, cert *tls.Certificate) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache[strings.ToLower(name)] = cert
}

// clearCertificate goes back to a certificate the CA mints for name.
func (c *CA) clearCertificate(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.cache, strings.ToLower(name))
}

type servedCertificate struct {
	// Certificate is the leaf followed by any chain, in PEM.
	Certificate string `json:"certificate"`
	PrivateKey  string `json:"privateKey"`
}

// adminServeCertificate is PUT and DELETE /tls/{name}.
func adminServeCertificate(ca *CA) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ca == nil {
			http.Error(w, "fakenet: this server has no TLS listener", http.StatusNotImplemented)
			return
		}
		name := r.PathValue("name")
		if r.Method == http.MethodDelete {
			ca.clearCertificate(name)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		var in servedCertificate
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		cert, err := tls.X509KeyPair([]byte(in.Certificate), []byte(in.PrivateKey))
		if err != nil {
			http.Error(w, fmt.Sprintf("fakenet: certificate and key for %s do not load: %v", name, err), http.StatusBadRequest)
			return
		}
		ca.serveCertificate(name, &cert)
		w.WriteHeader(http.StatusNoContent)
	}
}

// ServeCertificate makes fakenet present a certificate the test supplies, leaf first
// with any chain after it, to TLS clients asking for name, until the test ends. A
// product that reads what a server presents, such as certificate discovery, then sees
// that certificate instead of the one fakenet would mint.
func ServeCertificate(tt *testing.T, adminURL, name, certPEM, keyPEM string) {
	tt.Helper()
	target := strings.TrimSuffix(adminURL, "/") + AdminPrefix + "/tls/" + url.PathEscape(name)
	raw, err := json.Marshal(servedCertificate{Certificate: certPEM, PrivateKey: keyPEM})
	if err != nil {
		tt.Fatalf("fakenet: encoding the certificate for %s: %v", name, err)
	}
	if err := adminDo(http.MethodPut, target, raw); err != nil {
		tt.Fatalf("fakenet: serving a certificate for %s: %v", name, err)
	}
	tt.Cleanup(func() { _ = adminDo(http.MethodDelete, target, nil) })
}
