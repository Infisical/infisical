package kms

import (
	"context"
	"github.com/infisical/api/internal/ee/services/externalkms"
)

// ExternalKmsService defines external KMS operations (AWS, GCP).
// Pass nil when external KMS is not configured.
type ExternalKmsService interface {
	Encrypt(ctx context.Context, provider externalkms.ProviderType, config, plaintext []byte) ([]byte, error)
	Decrypt(ctx context.Context, provider externalkms.ProviderType, config, ciphertext []byte) ([]byte, error)
}
