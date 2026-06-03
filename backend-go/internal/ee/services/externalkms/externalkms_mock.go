//go:build integration

package externalkms

import (
	"context"
	"fmt"
)

// MockProvider implements a simple mock external KMS for testing.
// Uses XOR cipher so encrypt/decrypt are reversible and verifiable.
type MockProvider struct {
	EncryptCalls int
	DecryptCalls int
	LastProvider ProviderType
	LastConfig   []byte
	ShouldFail   bool
	FailMessage  string
}

// NewMockProvider creates a new mock external KMS provider.
func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

// Encrypt implements the service interface using XOR "encryption".
func (m *MockProvider) Encrypt(_ context.Context, provider ProviderType, config, plaintext []byte) ([]byte, error) {
	m.EncryptCalls++
	m.LastProvider = provider
	m.LastConfig = config

	if m.ShouldFail {
		msg := m.FailMessage
		if msg == "" {
			msg = "mock external KMS encrypt failed"
		}
		return nil, fmt.Errorf("%s", msg)
	}

	// XOR with 0x42 - simple reversible transformation for testing
	result := make([]byte, len(plaintext))
	for i, b := range plaintext {
		result[i] = b ^ 0x42
	}
	return result, nil
}

// Decrypt implements the service interface using XOR "decryption".
func (m *MockProvider) Decrypt(_ context.Context, provider ProviderType, config, ciphertext []byte) ([]byte, error) {
	m.DecryptCalls++
	m.LastProvider = provider
	m.LastConfig = config

	if m.ShouldFail {
		msg := m.FailMessage
		if msg == "" {
			msg = "mock external KMS decrypt failed"
		}
		return nil, fmt.Errorf("%s", msg)
	}

	// XOR with 0x42 - reverses the "encryption"
	result := make([]byte, len(ciphertext))
	for i, b := range ciphertext {
		result[i] = b ^ 0x42
	}
	return result, nil
}

// Reset clears call counts and captured data.
func (m *MockProvider) Reset() {
	m.EncryptCalls = 0
	m.DecryptCalls = 0
	m.LastProvider = ProviderType("")
	m.LastConfig = nil
	m.ShouldFail = false
	m.FailMessage = ""
}
