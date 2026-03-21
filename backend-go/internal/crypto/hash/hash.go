// Package hash provides cryptographic hash and HMAC functions used across
// the Infisical backend: SHA-256, SHA-1, HMAC-SHA-256, HMAC-SHA-1, and
// constant-time comparison.
package hash

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // SHA-1 needed for certificate fingerprints and legacy compatibility
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"hash"
)

// Algorithm identifies a hash function.
type Algorithm string

const (
	AlgoSHA1   Algorithm = "sha1"
	AlgoSHA256 Algorithm = "sha256"
	AlgoSHA384 Algorithm = "sha384"
	AlgoSHA512 Algorithm = "sha512"
)

// SHA256 returns the raw SHA-256 digest (32 bytes).
func SHA256(data []byte) []byte {
	h := sha256.Sum256(data)
	return h[:]
}

// SHA256Hex returns the hex-encoded SHA-256 digest.
func SHA256Hex(data []byte) string {
	return hex.EncodeToString(SHA256(data))
}

// SHA1 returns the raw SHA-1 digest (20 bytes).
// Use only where required for compatibility (e.g. certificate fingerprints).
func SHA1(data []byte) []byte {
	h := sha1.Sum(data)
	return h[:]
}

// SHA1Hex returns the hex-encoded SHA-1 digest.
func SHA1Hex(data []byte) string {
	return hex.EncodeToString(SHA1(data))
}

// SHA384 returns the raw SHA-384 digest (48 bytes).
func SHA384(data []byte) []byte {
	h := sha512.Sum384(data)
	return h[:]
}

// SHA512 returns the raw SHA-512 digest (64 bytes).
func SHA512Bytes(data []byte) []byte {
	h := sha512.Sum512(data)
	return h[:]
}

// HMACSHA256 computes HMAC-SHA-256.
func HMACSHA256(key, data []byte) []byte {
	return computeHMAC(sha256.New, key, data)
}

// HMACSHA1 computes HMAC-SHA-1.
// Use only where required for protocol compatibility.
func HMACSHA1(key, data []byte) []byte {
	return computeHMAC(sha1.New, key, data) //nolint:gosec // SHA-1 required for protocol compatibility
}

// TimingSafeEqual performs constant-time comparison of two byte slices.
// Returns true only if a and b have the same length and identical contents.
func TimingSafeEqual(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}

func computeHMAC(newHash func() hash.Hash, key, data []byte) []byte {
	mac := hmac.New(newHash, key)
	mac.Write(data)
	return mac.Sum(nil)
}

// NewHasher returns a hash.Hash for the given algorithm.
func NewHasher(algorithm Algorithm) (hash.Hash, error) {
	switch algorithm {
	case AlgoSHA256:
		return sha256.New(), nil
	case AlgoSHA384:
		return sha512.New384(), nil
	case AlgoSHA512:
		return sha512.New(), nil
	case AlgoSHA1:
		return sha1.New(), nil //nolint:gosec // SHA-1 required for protocol compatibility
	default:
		return nil, fmt.Errorf("unsupported hash algorithm: %s", algorithm)
	}
}

// NewHMAC returns an HMAC hash.Hash for the given algorithm and key.
func NewHMAC(algorithm Algorithm, key []byte) (hash.Hash, error) {
	switch algorithm {
	case AlgoSHA256:
		return hmac.New(sha256.New, key), nil
	case AlgoSHA384:
		return hmac.New(sha512.New384, key), nil
	case AlgoSHA512:
		return hmac.New(sha512.New, key), nil
	case AlgoSHA1:
		return hmac.New(sha1.New, key), nil //nolint:gosec // SHA-1 required for protocol compatibility
	default:
		return nil, fmt.Errorf("unsupported HMAC algorithm: %s", algorithm)
	}
}
