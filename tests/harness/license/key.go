package license

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"sync"
)

// serviceKey is the RSA private key the license client signs its service JWT with.
//
// Generated at first use rather than committed. A real private key in this repo
// would be flagged by Infisical's own secret scanning and by GitHub's, for a value
// that grants nothing.
//
// It deliberately does NOT need to be stable across processes, unlike AUTH_SECRET.
// WireMock never verifies the signature, so a second test binary adopting a running
// instance can hold a different key and every call still succeeds. The only real
// constraint is that the client can parse it: it fails before sending anything if it
// cannot.
var serviceKey = sync.OnceValue(func() string {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(fmt.Sprintf("license: generating service key: %v", err))
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		panic(fmt.Sprintf("license: encoding service key: %v", err))
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
})
