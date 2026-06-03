package externalkms

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/libs/errutil"
)

// ProviderType identifies the external KMS provider type.
type ProviderType string

const (
	ProviderAWS ProviderType = "aws"
	ProviderGCP ProviderType = "gcp"
)

// Service provides encryption/decryption via external KMS providers (AWS, GCP).
// It implements the ExternalKmsProvider interface expected by the core KMS service.
type Service struct {
	logger *slog.Logger
}

// Deps holds dependencies for the external KMS service.
type Deps struct{}

// NewService creates a new external KMS service.
func NewService(_ context.Context, logger *slog.Logger, _ *Deps) (*Service, error) {
	return &Service{
		logger: logger.With(slog.String("service", "externalkms")),
	}, nil
}

// Encrypt encrypts plaintext using the specified external KMS provider.
// The config parameter contains the decrypted provider configuration JSON.
func (s *Service) Encrypt(ctx context.Context, provider ProviderType, config, plaintext []byte) ([]byte, error) {
	p, err := s.createProvider(ctx, provider, config)
	if err != nil {
		return nil, err
	}
	defer errutil.DeferErr(ctx, p.Close, "closing external KMS provider")

	return p.Encrypt(ctx, plaintext)
}

// Decrypt decrypts ciphertext using the specified external KMS provider.
// The config parameter contains the decrypted provider configuration JSON.
func (s *Service) Decrypt(ctx context.Context, provider ProviderType, config, ciphertext []byte) ([]byte, error) {
	p, err := s.createProvider(ctx, provider, config)
	if err != nil {
		return nil, err
	}
	defer errutil.DeferErr(ctx, p.Close, "closing external KMS provider")

	return p.Decrypt(ctx, ciphertext)
}

// provider is the internal interface for KMS provider implementations.
type provider interface {
	Encrypt(ctx context.Context, plaintext []byte) ([]byte, error)
	Decrypt(ctx context.Context, ciphertext []byte) ([]byte, error)
	Close() error
}

func (s *Service) createProvider(ctx context.Context, providerType ProviderType, config []byte) (provider, error) {
	switch providerType {
	case ProviderAWS:
		var cfg AwsConfig
		if err := json.Unmarshal(config, &cfg); err != nil {
			return nil, fmt.Errorf("parsing AWS KMS config: %w", err)
		}
		return newAwsProvider(ctx, &cfg)

	case ProviderGCP:
		var cfg GcpConfig
		if err := json.Unmarshal(config, &cfg); err != nil {
			return nil, fmt.Errorf("parsing GCP KMS config: %w", err)
		}
		return newGcpProvider(ctx, &cfg)

	default:
		return nil, fmt.Errorf("unsupported external KMS provider: %s", providerType)
	}
}
