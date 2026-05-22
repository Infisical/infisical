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
