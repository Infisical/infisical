package cipher

import (
	"crypto/aes"
	gocipher "crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

const (
	ivLength  = 12
	tagLength = 16
)

type SymmetricKeyAlgorithm string

const (
	AESGCM256 SymmetricKeyAlgorithm = "aes-256-gcm"
	AESGCM128 SymmetricKeyAlgorithm = "aes-128-gcm"
)

// SymmetricEncrypt encrypts plaintext with a 128-bit or 256-bit AES key using AES-GCM.
// Returns a single blob: IV (12) || ciphertext || GCM auth tag (16).
func SymmetricEncrypt(plaintext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}

	gcm, err := gocipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating GCM: %w", err)
	}

	iv := make([]byte, ivLength)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return nil, fmt.Errorf("generating IV: %w", err)
	}

	// Seal appends ciphertext + GCM tag after the IV prefix.
	return gcm.Seal(iv, iv, plaintext, nil), nil
}

// SymmetricDecrypt decrypts a blob produced by Encrypt.
// Expects: IV (12) || ciphertext || GCM auth tag (16).
func SymmetricDecrypt(blob, key []byte) ([]byte, error) {
	if len(blob) < ivLength+tagLength {
		return nil, fmt.Errorf("ciphertext too short: need at least %d bytes, got %d", ivLength+tagLength, len(blob))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}

	gcm, err := gocipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating GCM: %w", err)
	}

	iv := blob[:ivLength]
	ciphertext := blob[ivLength:]

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting: %w", err)
	}

	return plaintext, nil
}

func getKeyLengthForAlgorithm(algorithm SymmetricKeyAlgorithm) (uint, error) {
	switch algorithm {
	case AESGCM128:
		return 16, nil // 128 bits
	case AESGCM256:
		return 32, nil // 256 bits
	default:
		return 0, fmt.Errorf("unsupported symmetric key algorithm: %s", algorithm)
	}
}

func GenerateKeyMaterial(algorithm SymmetricKeyAlgorithm) ([]byte, error) {
	keyLength, err := getKeyLengthForAlgorithm(algorithm)
	if err != nil {
		return nil, err
	}

	key := make([]byte, keyLength)

	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("generating symmetric key: %w", err)
	}

	return key, nil
}

