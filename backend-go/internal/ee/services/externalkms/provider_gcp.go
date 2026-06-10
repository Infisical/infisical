package externalkms

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	kms "cloud.google.com/go/kms/apiv1"
	"cloud.google.com/go/kms/apiv1/kmspb"
	"google.golang.org/api/option"
)

// GcpConfig holds the configuration for GCP KMS provider.
// Matches the Node.js ExternalKmsGcpSchema structure.
type GcpConfig struct {
	Credential GcpCredential
	GcpRegion  string
	KeyName    string
}

// GcpCredential represents a GCP service account credential.
// This is the standard service account JSON structure.
type GcpCredential struct {
	Type                    string `json:"type"`
	ProjectID               string `json:"project_id"`
	PrivateKeyID            string `json:"private_key_id"`
	PrivateKey              string `json:"private_key"`
	ClientEmail             string `json:"client_email"`
	ClientID                string `json:"client_id"`
	AuthURI                 string `json:"auth_uri"`
	TokenURI                string `json:"token_uri"`
	AuthProviderX509CertURL string `json:"auth_provider_x509_cert_url"`
	ClientX509CertURL       string `json:"client_x509_cert_url"`
	UniverseDomain          string `json:"universe_domain"`
}

// gcpProvider implements the provider interface for GCP KMS.
type gcpProvider struct {
	client  *kms.KeyManagementClient
	keyName string
}

func newGcpProvider(ctx context.Context, cfg *GcpConfig) (*gcpProvider, error) {
	if err := validateGcpCredentialURLs(&cfg.Credential); err != nil {
		return nil, err
	}

	credentialJSON, err := json.Marshal(cfg.Credential)
	if err != nil {
		return nil, fmt.Errorf("marshaling GCP credential: %w", err)
	}

	client, err := kms.NewKeyManagementClient(ctx, option.WithAuthCredentialsJSON(option.ServiceAccount, credentialJSON))
	if err != nil {
		return nil, fmt.Errorf("creating GCP KMS client: %w", err)
	}

	return &gcpProvider{
		client:  client,
		keyName: cfg.KeyName,
	}, nil
}

// validateGcpCredentialURLs validates that credential URLs point to Google domains.
func validateGcpCredentialURLs(cred *GcpCredential) error {
	urlsToValidate := map[string]string{
		"auth_uri":  cred.AuthURI,
		"token_uri": cred.TokenURI,
	}

	for field, rawURL := range urlsToValidate {
		if rawURL == "" {
			continue
		}
		if err := validateGoogleURL(rawURL); err != nil {
			return fmt.Errorf("invalid %s: %w", field, err)
		}
	}
	return nil
}

// validateGoogleURL checks that a URL points to a Google domain.
func validateGoogleURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	if parsed.Scheme != "https" {
		return fmt.Errorf("URL must use HTTPS")
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "google.com" || host == "googleapis.com" ||
		strings.HasSuffix(host, ".google.com") || strings.HasSuffix(host, ".googleapis.com") {
		return nil
	}

	return fmt.Errorf("URL host must be a Google domain (google.com or googleapis.com)")
}

func (p *gcpProvider) Encrypt(ctx context.Context, plaintext []byte) ([]byte, error) {
	resp, err := p.client.Encrypt(ctx, &kmspb.EncryptRequest{
		Name:      p.keyName,
		Plaintext: plaintext,
	})
	if err != nil {
		return nil, fmt.Errorf("GCP KMS encrypt: %w", err)
	}

	return resp.Ciphertext, nil
}

func (p *gcpProvider) Decrypt(ctx context.Context, ciphertext []byte) ([]byte, error) {
	resp, err := p.client.Decrypt(ctx, &kmspb.DecryptRequest{
		Name:       p.keyName,
		Ciphertext: ciphertext,
	})
	if err != nil {
		return nil, fmt.Errorf("GCP KMS decrypt: %w", err)
	}

	return resp.Plaintext, nil
}

func (p *gcpProvider) Close() error {
	return p.client.Close()
}
