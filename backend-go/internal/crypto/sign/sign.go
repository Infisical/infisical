// Package sign provides asymmetric key generation, signing, and verification
// for the KMS service. It supports RSA-4096 and ECC P-256 keys with multiple
// signing algorithms (RSA-PSS, RSA PKCS#1 v1.5, ECDSA).
//
// All key formats match the Node.js backend:
//   - Private keys: PEM-encoded PKCS#8
//   - Public keys: DER-encoded SPKI
package sign

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"hash"
	"strings"
)

// Algorithm identifies a key type.
type Algorithm string

const (
	RSA4096 Algorithm = "RSA_4096"
	ECCP256 Algorithm = "ECC_NIST_P256"
)

// SigningAlgorithm identifies a signing scheme.
type SigningAlgorithm string

const (
	RSASSA_PSS_SHA256        SigningAlgorithm = "RSASSA_PSS_SHA_256"
	RSASSA_PSS_SHA384        SigningAlgorithm = "RSASSA_PSS_SHA_384"
	RSASSA_PSS_SHA512        SigningAlgorithm = "RSASSA_PSS_SHA_512"
	RSASSA_PKCS1_V1_5_SHA256 SigningAlgorithm = "RSASSA_PKCS1_V1_5_SHA_256"
	RSASSA_PKCS1_V1_5_SHA384 SigningAlgorithm = "RSASSA_PKCS1_V1_5_SHA_384"
	RSASSA_PKCS1_V1_5_SHA512 SigningAlgorithm = "RSASSA_PKCS1_V1_5_SHA_512"
	ECDSA_SHA256             SigningAlgorithm = "ECDSA_SHA_256"
	ECDSA_SHA384             SigningAlgorithm = "ECDSA_SHA_384"
	ECDSA_SHA512             SigningAlgorithm = "ECDSA_SHA_512"
)

// signingParams maps a SigningAlgorithm to its crypto.Hash and optional PSS salt length.
type signingParams struct {
	hash       crypto.Hash
	newHash    func() hash.Hash
	digestLen  int
	isPSS      bool
	saltLength int
}

var paramsMap = map[SigningAlgorithm]signingParams{
	RSASSA_PSS_SHA256:        {hash: crypto.SHA256, newHash: sha256.New, digestLen: sha256.Size, isPSS: true, saltLength: sha256.Size},
	RSASSA_PSS_SHA384:        {hash: crypto.SHA384, newHash: sha512.New384, digestLen: sha512.Size384, isPSS: true, saltLength: sha512.Size384},
	RSASSA_PSS_SHA512:        {hash: crypto.SHA512, newHash: sha512.New, digestLen: sha512.Size, isPSS: true, saltLength: sha512.Size},
	RSASSA_PKCS1_V1_5_SHA256: {hash: crypto.SHA256, newHash: sha256.New, digestLen: sha256.Size},
	RSASSA_PKCS1_V1_5_SHA384: {hash: crypto.SHA384, newHash: sha512.New384, digestLen: sha512.Size384},
	RSASSA_PKCS1_V1_5_SHA512: {hash: crypto.SHA512, newHash: sha512.New, digestLen: sha512.Size},
	ECDSA_SHA256:             {hash: crypto.SHA256, newHash: sha256.New, digestLen: sha256.Size},
	ECDSA_SHA384:             {hash: crypto.SHA384, newHash: sha512.New384, digestLen: sha512.Size384},
	ECDSA_SHA512:             {hash: crypto.SHA512, newHash: sha512.New, digestLen: sha512.Size},
}

// GeneratePrivateKey generates a new private key for the given algorithm.
// Returns the private key as PEM-encoded PKCS#8.
func GeneratePrivateKey(algo Algorithm) ([]byte, error) {
	var privKey crypto.PrivateKey
	var err error

	switch algo {
	case RSA4096:
		privKey, err = rsa.GenerateKey(rand.Reader, 4096)
	case ECCP256:
		privKey, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	default:
		return nil, fmt.Errorf("unsupported key algorithm: %s", algo)
	}
	if err != nil {
		return nil, fmt.Errorf("generating %s key: %w", algo, err)
	}

	return marshalPrivateKeyPEM(privKey)
}

// PublicKeyFromPrivate extracts the public key from a PEM-encoded PKCS#8 private key.
// Returns the public key as DER-encoded SPKI (matching the Node.js format).
func PublicKeyFromPrivate(privateKeyPEM []byte) ([]byte, error) {
	privKey, err := parsePrivateKeyPEM(privateKeyPEM)
	if err != nil {
		return nil, err
	}

	var pubKey crypto.PublicKey
	switch k := privKey.(type) {
	case *rsa.PrivateKey:
		pubKey = &k.PublicKey
	case *ecdsa.PrivateKey:
		pubKey = &k.PublicKey
	default:
		return nil, fmt.Errorf("unsupported private key type: %T", privKey)
	}

	der, err := x509.MarshalPKIXPublicKey(pubKey)
	if err != nil {
		return nil, fmt.Errorf("marshaling public key to DER: %w", err)
	}

	return der, nil
}

// Sign signs data with a PEM-encoded PKCS#8 private key.
//
// If isDigest is true, data is treated as a pre-computed hash digest and signed
// directly (without hashing again). RSA-PSS does not support pre-digested input.
//
// ECDSA signatures are DER-encoded (ASN.1), matching the Node.js output.
func Sign(data, privateKeyPEM []byte, algo SigningAlgorithm, isDigest bool) ([]byte, error) {
	if err := validateAlgorithmWithKey(algo, privateKeyPEM); err != nil {
		return nil, err
	}

	params, ok := paramsMap[algo]
	if !ok {
		return nil, fmt.Errorf("unsupported signing algorithm: %s", algo)
	}

	privKey, err := parsePrivateKeyPEM(privateKeyPEM)
	if err != nil {
		return nil, err
	}

	var digest []byte
	if isDigest {
		if params.isPSS {
			return nil, fmt.Errorf("RSA-PSS does not support pre-digested input")
		}
		digest = data
	} else {
		h := params.newHash()
		h.Write(data)
		digest = h.Sum(nil)
	}

	switch k := privKey.(type) {
	case *rsa.PrivateKey:
		if params.isPSS {
			return rsa.SignPSS(rand.Reader, k, params.hash, digest, &rsa.PSSOptions{
				SaltLength: params.saltLength,
			})
		}
		return rsa.SignPKCS1v15(rand.Reader, k, params.hash, digest)

	case *ecdsa.PrivateKey:
		// ecdsa.SignASN1 produces DER-encoded signatures matching Node.js dsaEncoding: "der".
		return ecdsa.SignASN1(rand.Reader, k, digest)

	default:
		return nil, fmt.Errorf("unsupported private key type for signing: %T", privKey)
	}
}

// Verify verifies a signature against data using a DER-encoded SPKI public key.
//
// If isDigest is true, data is treated as a pre-computed hash digest.
// RSA-PSS does not support pre-digested input.
func Verify(data, signature, publicKeyDER []byte, algo SigningAlgorithm, isDigest bool) (bool, error) {
	params, ok := paramsMap[algo]
	if !ok {
		return false, fmt.Errorf("unsupported signing algorithm: %s", algo)
	}

	if isDigest && params.isPSS {
		return false, fmt.Errorf("RSA-PSS does not support pre-digested input")
	}

	pubKeyRaw, err := x509.ParsePKIXPublicKey(publicKeyDER)
	if err != nil {
		return false, fmt.Errorf("parsing public key DER: %w", err)
	}

	var digest []byte
	if isDigest {
		digest = data
	} else {
		h := params.newHash()
		h.Write(data)
		digest = h.Sum(nil)
	}

	switch pubKey := pubKeyRaw.(type) {
	case *rsa.PublicKey:
		if params.isPSS {
			err = rsa.VerifyPSS(pubKey, params.hash, digest, signature, &rsa.PSSOptions{
				SaltLength: params.saltLength,
			})
		} else {
			err = rsa.VerifyPKCS1v15(pubKey, params.hash, digest, signature)
		}
		if err != nil {
			return false, nil
		}
		return true, nil

	case *ecdsa.PublicKey:
		return ecdsa.VerifyASN1(pubKey, digest, signature), nil

	default:
		return false, fmt.Errorf("unsupported public key type for verification: %T", pubKeyRaw)
	}
}

// parsePrivateKeyPEM decodes a PEM block and parses a PKCS#8 private key.
func parsePrivateKeyPEM(pemData []byte) (crypto.PrivateKey, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in private key")
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parsing PKCS#8 private key: %w", err)
	}

	return key, nil
}

// marshalPrivateKeyPEM marshals a private key to PEM-encoded PKCS#8.
func marshalPrivateKeyPEM(key crypto.PrivateKey) ([]byte, error) {
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("marshaling private key to PKCS#8: %w", err)
	}

	return pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: der,
	}), nil
}

// validateAlgorithmWithKey checks that the signing algorithm is compatible
// with the key type encoded in the PEM.
func validateAlgorithmWithKey(algo SigningAlgorithm, privateKeyPEM []byte) error {
	privKey, err := parsePrivateKeyPEM(privateKeyPEM)
	if err != nil {
		return err
	}

	algoStr := string(algo)
	isRSAAlgo := strings.HasPrefix(algoStr, "RSASSA")
	isECDSAAlgo := strings.HasPrefix(algoStr, "ECDSA")

	switch privKey.(type) {
	case *rsa.PrivateKey:
		if !isRSAAlgo {
			return fmt.Errorf("RSA key cannot be used with %s", algo)
		}
	case *ecdsa.PrivateKey:
		if !isECDSAAlgo {
			return fmt.Errorf("ECC key cannot be used with %s", algo)
		}
	}

	return nil
}
