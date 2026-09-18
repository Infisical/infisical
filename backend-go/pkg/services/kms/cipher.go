package kms

import (
	"crypto/rand"
	"fmt"

	"github.com/infisical/api/internal/libs/crypto/cipher"
)

// Encryptor encrypts plaintext and returns the ciphertext blob (with version suffix).
type Encryptor func(plainText []byte) ([]byte, error)


// Decryptor decrypts a versioned ciphertext blob and returns the plaintext.
type Decryptor func(cipherTextBlob []byte) ([]byte, error)

// CipherPair holds matched encrypt/decrypt functions bound to a single data key.
type CipherPair struct {
	encrypt Encryptor
	decrypt Decryptor
}

// Encrypt encrypts plaintext using the bound data key.
func (c *CipherPair) Encrypt(plaintext []byte) ([]byte, error) {
	return c.encrypt(plaintext)
}

// Decrypt decrypts ciphertext using the bound data key.
func (c *CipherPair) Decrypt(ciphertext []byte) ([]byte, error) {
	return c.decrypt(ciphertext)
}

// generateEncryptedKeyMaterial generates a random 32-byte key and encrypts it
// with the root key (no version suffix). Used as the callback for find-or-create methods.
func (s *Service) generateEncryptedKeyMaterial() ([]byte, error) {
	rootKey := s.getRootKey()
	if len(rootKey) == 0 {
		return nil, fmt.Errorf("KMS: root key not loaded")
	}

	keyMaterial := make([]byte, 32)
	if _, err := rand.Read(keyMaterial); err != nil {
		return nil, fmt.Errorf("KMS: generating key material: %w", err)
	}

	encryptedKey, err := cipher.SymmetricEncrypt(keyMaterial, rootKey)
	if err != nil {
		return nil, fmt.Errorf("KMS: encrypting key material: %w", err)
	}

	return encryptedKey, nil
}
