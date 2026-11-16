package acmeca

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
)

var b64 = base64.RawURLEncoding

type jwk struct {
	Kty string `json:"kty"`
	N   string `json:"n,omitempty"`
	E   string `json:"e,omitempty"`
	Crv string `json:"crv,omitempty"`
	X   string `json:"x,omitempty"`
	Y   string `json:"y,omitempty"`
}

type protectedHeader struct {
	Alg   string `json:"alg"`
	Nonce string `json:"nonce"`
	URL   string `json:"url"`
	Kid   string `json:"kid"`
	JWK   *jwk   `json:"jwk"`
}

type signedRequest struct {
	header  protectedHeader
	payload []byte
	key     crypto.PublicKey
}

// read parses and verifies a flattened JWS: the signature, a nonce this CA issued and
// has not seen used, and a url naming the request itself.
func (c *CA) read(r *http.Request, wantJWK bool) (*signedRequest, *problem) {
	var body struct {
		Protected string `json:"protected"`
		Payload   string `json:"payload"`
		Signature string `json:"signature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return nil, malformed("request body is not a JWS")
	}
	rawHeader, err := b64.DecodeString(body.Protected)
	if err != nil {
		return nil, malformed("protected header is not base64url")
	}
	var h protectedHeader
	if err := json.Unmarshal(rawHeader, &h); err != nil {
		return nil, malformed("protected header is not JSON")
	}

	if !c.takeNonce(h.Nonce) {
		return nil, &problem{Type: "badNonce", Detail: "JWS has an invalid anti-replay nonce", Status: http.StatusBadRequest}
	}
	if h.URL != "https://"+hostOf(r)+r.URL.Path {
		return nil, malformed(fmt.Sprintf("JWS url %q does not match the request", h.URL))
	}

	var key crypto.PublicKey
	switch {
	case wantJWK && (h.JWK == nil || h.Kid != ""):
		return nil, malformed("this endpoint takes a jwk and no kid")
	case !wantJWK && (h.Kid == "" || h.JWK != nil):
		return nil, malformed("this endpoint takes a kid and no jwk")
	case wantJWK:
		if key, err = h.JWK.publicKey(); err != nil {
			return nil, &problem{Type: "badPublicKey", Detail: err.Error(), Status: http.StatusBadRequest}
		}
	default:
		c.mu.Lock()
		acct, ok := c.accounts[accountIDFromURL(h.Kid)]
		c.mu.Unlock()
		if !ok {
			return nil, &problem{Type: "accountDoesNotExist", Detail: "no account at " + h.Kid, Status: http.StatusBadRequest}
		}
		key = acct.key
	}

	sig, err := b64.DecodeString(body.Signature)
	if err != nil {
		return nil, malformed("signature is not base64url")
	}
	if err := verify(h.Alg, key, []byte(body.Protected+"."+body.Payload), sig); err != nil {
		return nil, &problem{Type: "unauthorized", Detail: "JWS signature: " + err.Error(), Status: http.StatusForbidden}
	}
	payload, err := b64.DecodeString(body.Payload)
	if err != nil {
		return nil, malformed("payload is not base64url")
	}
	return &signedRequest{header: h, payload: payload, key: key}, nil
}

func verify(alg string, key crypto.PublicKey, signed, sig []byte) error {
	switch k := key.(type) {
	case *rsa.PublicKey:
		if alg != "RS256" {
			return fmt.Errorf("algorithm %s does not fit an RSA key", alg)
		}
		d := sha256.Sum256(signed)
		return rsa.VerifyPKCS1v15(k, crypto.SHA256, d[:], sig)
	case *ecdsa.PublicKey:
		var digest []byte
		switch alg {
		case "ES256":
			d := sha256.Sum256(signed)
			digest = d[:]
		case "ES384":
			d := sha512.Sum384(signed)
			digest = d[:]
		default:
			return fmt.Errorf("algorithm %s does not fit an EC key", alg)
		}
		half := len(sig) / 2
		r, s := new(big.Int).SetBytes(sig[:half]), new(big.Int).SetBytes(sig[half:])
		if !ecdsa.Verify(k, digest, r, s) {
			return errors.New("does not verify")
		}
		return nil
	}
	return errors.New("unsupported key type")
}

func (j *jwk) publicKey() (crypto.PublicKey, error) {
	switch j.Kty {
	case "RSA":
		n, err := b64.DecodeString(j.N)
		if err != nil {
			return nil, err
		}
		e, err := b64.DecodeString(j.E)
		if err != nil {
			return nil, err
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}, nil
	case "EC":
		var curve elliptic.Curve
		switch j.Crv {
		case "P-256":
			curve = elliptic.P256()
		case "P-384":
			curve = elliptic.P384()
		default:
			return nil, fmt.Errorf("unsupported curve %q", j.Crv)
		}
		x, err := b64.DecodeString(j.X)
		if err != nil {
			return nil, err
		}
		y, err := b64.DecodeString(j.Y)
		if err != nil {
			return nil, err
		}
		size := (curve.Params().BitSize + 7) / 8
		if len(x) != size || len(y) != size {
			return nil, fmt.Errorf("EC coordinates are not %d bytes", size)
		}
		return ecdsa.ParseUncompressedPublicKey(curve, append(append([]byte{4}, x...), y...))
	}
	return nil, fmt.Errorf("unsupported key type %q", j.Kty)
}

// thumbprint is the RFC 7638 thumbprint, which is how a returning key finds its
// account.
func (j *jwk) thumbprint() string {
	var canonical string
	if j.Kty == "RSA" {
		canonical = fmt.Sprintf(`{"e":%q,"kty":"RSA","n":%q}`, j.E, j.N)
	} else {
		canonical = fmt.Sprintf(`{"crv":%q,"kty":"EC","x":%q,"y":%q}`, j.Crv, j.X, j.Y)
	}
	d := sha256.Sum256([]byte(canonical))
	return b64.EncodeToString(d[:])
}

func accountIDFromURL(u string) string {
	i := strings.LastIndex(u, "/accounts/")
	if i < 0 {
		return ""
	}
	return u[i+len("/accounts/"):]
}

func hostOf(r *http.Request) string {
	h := r.Host
	if i := strings.IndexByte(h, ':'); i >= 0 {
		h = h[:i]
	}
	return h
}
