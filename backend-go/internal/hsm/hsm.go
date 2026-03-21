// Package hsm provides a PKCS#11 HSM integration for encrypting/decrypting
// the KMS root key. It wraps crypto11 for session management and key operations.
//
// Blob format (must match the Node.js backend):
//
//	IV (16 bytes) || AES-CBC ciphertext (PKCS#7 padded) || HMAC-SHA256 (32 bytes)
package hsm

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"sync"

	"github.com/ThalesGroup/crypto11"
	"github.com/miekg/pkcs11"
)

const (
	ivLength    = 16
	hmacSize    = 32
	aesKeyBits  = 256
	hmacKeyBits = 256
)

// Config holds the HSM connection parameters.
type Config struct {
	LibPath  string
	Slot     int
	Pin      string
	KeyLabel string
}

// Service provides HSM-backed encryption, decryption, and random byte generation.
type Service struct {
	ctx    *crypto11.Context
	config Config

	mu         sync.Mutex
	testPassed bool
}

// NewService loads the PKCS#11 library and opens a session pool to the token.
func NewService(cfg Config) (*Service, error) {
	slot := cfg.Slot
	ctx, err := crypto11.Configure(&crypto11.Config{
		Path:       cfg.LibPath,
		SlotNumber: &slot,
		Pin:        cfg.Pin,
	})
	if err != nil {
		return nil, fmt.Errorf("HSM: configuring PKCS#11: %w", err)
	}

	return &Service{
		ctx:    ctx,
		config: cfg,
	}, nil
}

// Close releases all HSM resources.
func (s *Service) Close() error {
	if s.ctx != nil {
		return s.ctx.Close()
	}
	return nil
}

// StartService ensures the required AES and HMAC keys exist on the token,
// then runs a self-test to validate the HSM is working correctly.
func (s *Service) StartService() error {
	if err := s.ensureKeys(); err != nil {
		return fmt.Errorf("HSM: ensuring keys: %w", err)
	}

	if err := s.selfTest(); err != nil {
		return fmt.Errorf("HSM: self-test failed: %w", err)
	}

	s.mu.Lock()
	s.testPassed = true
	s.mu.Unlock()

	return nil
}

// IsActive returns true if the HSM self-test has passed.
func (s *Service) IsActive() bool {
	s.mu.Lock()
	passed := s.testPassed
	s.mu.Unlock()

	if passed {
		return true
	}

	if err := s.selfTest(); err != nil {
		return false
	}

	s.mu.Lock()
	s.testPassed = true
	s.mu.Unlock()

	return true
}

// Encrypt encrypts data with the HSM AES key and appends an HMAC-SHA256.
// Returns: IV (16) || ciphertext || HMAC (32).
func (s *Service) Encrypt(data []byte) ([]byte, error) {
	aesKey, err := s.findAESKey()
	if err != nil {
		return nil, fmt.Errorf("HSM: encryption failed, AES key not found: %w", err)
	}

	blockSize := aesKey.Cipher.BlockSize

	// Generate random IV.
	iv := make([]byte, blockSize)
	if _, err := rand.Read(iv); err != nil {
		return nil, fmt.Errorf("HSM: generating IV: %w", err)
	}

	// PKCS#7 pad the plaintext.
	padded := addPKCS7Padding(data, blockSize)

	// Encrypt with AES-CBC on the HSM.
	encrypter, err := aesKey.NewCBCEncrypterCloser(iv)
	if err != nil {
		return nil, fmt.Errorf("HSM: creating CBC encrypter: %w", err)
	}

	ciphertext := make([]byte, len(padded))
	encrypter.CryptBlocks(ciphertext, padded)
	encrypter.Close()

	// Compute HMAC-SHA256 over IV || ciphertext on the HSM.
	mac, err := s.calculateHMAC(iv, ciphertext)
	if err != nil {
		return nil, fmt.Errorf("HSM: computing HMAC: %w", err)
	}

	// Assemble: IV || ciphertext || HMAC.
	result := make([]byte, 0, len(iv)+len(ciphertext)+len(mac))
	result = append(result, iv...)
	result = append(result, ciphertext...)
	result = append(result, mac...)

	return result, nil
}

// Decrypt verifies the HMAC and decrypts a blob produced by Encrypt.
// Expects: IV (16) || ciphertext || HMAC (32).
func (s *Service) Decrypt(blob []byte) ([]byte, error) {
	if len(blob) < ivLength+hmacSize+1 {
		return nil, fmt.Errorf("HSM: encrypted blob too short")
	}

	iv := blob[:ivLength]
	ciphertext := blob[ivLength : len(blob)-hmacSize]
	receivedMAC := blob[len(blob)-hmacSize:]

	// Verify HMAC first.
	expectedMAC, err := s.calculateHMAC(iv, ciphertext)
	if err != nil {
		return nil, fmt.Errorf("HSM: decryption failed")
	}

	if !hmac.Equal(receivedMAC, expectedMAC) {
		return nil, fmt.Errorf("HSM: decryption failed")
	}

	// Find AES key and decrypt.
	aesKey, err := s.findAESKey()
	if err != nil {
		return nil, fmt.Errorf("HSM: decryption failed, AES key not found: %w", err)
	}

	decrypter, err := aesKey.NewCBCDecrypterCloser(iv)
	if err != nil {
		return nil, fmt.Errorf("HSM: decryption failed")
	}

	paddedPlaintext := make([]byte, len(ciphertext))
	decrypter.CryptBlocks(paddedPlaintext, ciphertext)
	decrypter.Close()

	// Remove PKCS#7 padding.
	plaintext, err := removePKCS7Padding(paddedPlaintext, aesKey.Cipher.BlockSize)
	if err != nil {
		return nil, fmt.Errorf("HSM: decryption failed")
	}

	return plaintext, nil
}

// RandomBytes generates cryptographically secure random bytes from the HSM.
func (s *Service) RandomBytes(n int) ([]byte, error) {
	rng, err := s.ctx.NewRandomReader()
	if err != nil {
		return nil, fmt.Errorf("HSM: creating random reader: %w", err)
	}

	buf := make([]byte, n)
	if _, err := io.ReadFull(rng, buf); err != nil {
		return nil, fmt.Errorf("HSM: reading random bytes: %w", err)
	}

	return buf, nil
}

// ensureKeys creates the AES and HMAC keys on the token if they don't already exist.
func (s *Service) ensureKeys() error {
	// AES key.
	aesKey, err := s.ctx.FindKey(nil, []byte(s.config.KeyLabel))
	if err != nil {
		return fmt.Errorf("finding AES key: %w", err)
	}
	if aesKey == nil {
		_, err = s.ctx.GenerateSecretKeyWithLabel(
			[]byte(s.config.KeyLabel),
			[]byte(s.config.KeyLabel),
			aesKeyBits,
			crypto11.CipherAES,
		)
		if err != nil {
			return fmt.Errorf("generating AES key: %w", err)
		}
	}

	// HMAC key.
	hmacLabel := s.config.KeyLabel + "_HMAC"
	hmacKey, err := s.ctx.FindKey(nil, []byte(hmacLabel))
	if err != nil {
		return fmt.Errorf("finding HMAC key: %w", err)
	}
	if hmacKey == nil {
		_, err = s.ctx.GenerateSecretKeyWithLabel(
			[]byte(hmacLabel),
			[]byte(hmacLabel),
			hmacKeyBits,
			crypto11.CipherGeneric,
		)
		if err != nil {
			return fmt.Errorf("generating HMAC key: %w", err)
		}
	}

	return nil
}

// selfTest encrypts and decrypts random data to validate the HSM.
func (s *Service) selfTest() error {
	testData := []byte("HSM self-test: this data must survive a round-trip")

	encrypted, err := s.Encrypt(testData)
	if err != nil {
		return fmt.Errorf("test encryption: %w", err)
	}

	decrypted, err := s.Decrypt(encrypted)
	if err != nil {
		return fmt.Errorf("test decryption: %w", err)
	}

	if !bytes.Equal(testData, decrypted) {
		return errors.New("decrypted data does not match original")
	}

	return nil
}

// findAESKey locates the AES key on the token by label.
func (s *Service) findAESKey() (*crypto11.SecretKey, error) {
	key, err := s.ctx.FindKey(nil, []byte(s.config.KeyLabel))
	if err != nil {
		return nil, err
	}
	if key == nil {
		return nil, fmt.Errorf("AES key with label %q not found", s.config.KeyLabel)
	}
	return key, nil
}

// calculateHMAC computes HMAC-SHA256 over IV || ciphertext using the HSM HMAC key.
func (s *Service) calculateHMAC(iv, ciphertext []byte) ([]byte, error) {
	label := s.config.KeyLabel + "_HMAC"
	hmacKey, err := s.ctx.FindKey(nil, []byte(label))
	if err != nil {
		return nil, fmt.Errorf("finding HMAC key: %w", err)
	}
	if hmacKey == nil {
		return nil, fmt.Errorf("HMAC key with label %q not found", label)
	}

	h, err := hmacKey.NewHMAC(pkcs11.CKM_SHA256_HMAC, 0)
	if err != nil {
		return nil, fmt.Errorf("creating HMAC: %w", err)
	}

	h.Write(iv)
	h.Write(ciphertext)

	return h.Sum(nil), nil
}

// addPKCS7Padding adds PKCS#7 padding to data.
func addPKCS7Padding(data []byte, blockSize int) []byte {
	padding := blockSize - (len(data) % blockSize)
	padded := make([]byte, len(data)+padding)
	copy(padded, data)
	for i := len(data); i < len(padded); i++ {
		padded[i] = byte(padding)
	}
	return padded
}

// removePKCS7Padding removes and validates PKCS#7 padding.
func removePKCS7Padding(data []byte, blockSize int) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("cannot remove padding from empty data")
	}
	if len(data)%blockSize != 0 {
		return nil, errors.New("data length is not a multiple of block size")
	}

	paddingLen := int(data[len(data)-1])
	if paddingLen == 0 || paddingLen > blockSize || paddingLen > len(data) {
		return nil, fmt.Errorf("invalid padding length: %d", paddingLen)
	}

	for i := len(data) - paddingLen; i < len(data); i++ {
		if data[i] != byte(paddingLen) {
			return nil, fmt.Errorf("invalid padding byte at position %d", i)
		}
	}

	return data[:len(data)-paddingLen], nil
}
