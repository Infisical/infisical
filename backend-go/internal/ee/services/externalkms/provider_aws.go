package externalkms

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// AwsCredentialType identifies the AWS credential type.
type AwsCredentialType string

// AWS credential types matching Node.js constants.
const (
	AwsCredentialTypeAccessKey  AwsCredentialType = "access-key"
	AwsCredentialTypeAssumeRole AwsCredentialType = "assume-role"
)

// AwsConfig holds the configuration for AWS KMS provider.
// Matches the Node.js ExternalKmsAwsSchema structure.
type AwsConfig struct {
	Credential AwsCredential
	AwsRegion  string
	KmsKeyID   string
}

// AwsCredential represents AWS authentication credentials.
type AwsCredential struct {
	Type AwsCredentialType
	Data AwsCredentialData
}

// AwsCredentialData holds the actual credential values.
type AwsCredentialData struct {
	// For access-key type
	AccessKey string
	SecretKey string

	// For assume-role type
	AssumeRoleArn string
	ExternalID    string
}

// awsProvider implements the provider interface for AWS KMS.
type awsProvider struct {
	client   *kms.Client
	kmsKeyID string
}

func newAwsProvider(ctx context.Context, cfg *AwsConfig) (*awsProvider, error) {
	awsCfg, err := buildAwsConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("building AWS config: %w", err)
	}

	client := kms.NewFromConfig(awsCfg)

	return &awsProvider{
		client:   client,
		kmsKeyID: cfg.KmsKeyID,
	}, nil
}

// TODO(go): Add FIPS endpoint support via config.WithUseFIPSEndpoint when FIPS mode is enabled.
func buildAwsConfig(ctx context.Context, cfg *AwsConfig) (aws.Config, error) {
	switch cfg.Credential.Type {
	case AwsCredentialTypeAccessKey:
		return config.LoadDefaultConfig(ctx,
			config.WithRegion(cfg.AwsRegion),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				cfg.Credential.Data.AccessKey,
				cfg.Credential.Data.SecretKey,
				"",
			)),
		)

	case AwsCredentialTypeAssumeRole:
		baseCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(cfg.AwsRegion))
		if err != nil {
			return aws.Config{}, fmt.Errorf("loading base AWS config: %w", err)
		}

		stsClient := sts.NewFromConfig(baseCfg)
		assumeRoleProvider := stscreds.NewAssumeRoleProvider(stsClient, cfg.Credential.Data.AssumeRoleArn,
			func(o *stscreds.AssumeRoleOptions) {
				if cfg.Credential.Data.ExternalID != "" {
					o.ExternalID = aws.String(cfg.Credential.Data.ExternalID)
				}
			},
		)

		return config.LoadDefaultConfig(ctx,
			config.WithRegion(cfg.AwsRegion),
			config.WithCredentialsProvider(aws.NewCredentialsCache(assumeRoleProvider)),
		)

	default:
		return aws.Config{}, fmt.Errorf("unsupported AWS credential type: %s", cfg.Credential.Type)
	}
}

func (p *awsProvider) Encrypt(ctx context.Context, plaintext []byte) ([]byte, error) {
	output, err := p.client.Encrypt(ctx, &kms.EncryptInput{
		KeyId:     aws.String(p.kmsKeyID),
		Plaintext: plaintext,
	})
	if err != nil {
		return nil, fmt.Errorf("AWS KMS encrypt: %w", err)
	}

	return output.CiphertextBlob, nil
}

func (p *awsProvider) Decrypt(ctx context.Context, ciphertext []byte) ([]byte, error) {
	output, err := p.client.Decrypt(ctx, &kms.DecryptInput{
		KeyId:          aws.String(p.kmsKeyID),
		CiphertextBlob: ciphertext,
	})
	if err != nil {
		return nil, fmt.Errorf("AWS KMS decrypt: %w", err)
	}

	return output.Plaintext, nil
}

func (p *awsProvider) Close() error {
	// AWS SDK v2 clients don't require explicit cleanup
	return nil
}
