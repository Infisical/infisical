//go:build integration

package externalkms_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/tests/infra"
)

// Secret keys in Infisical /platform folder.
const (
	// GCP
	SecretGCPCredentialJSON = "EXTERNAL_KMS_GCP_CREDENTIAL_JSON"
	SecretGCPKeyName        = "EXTERNAL_KMS_GCP_KEY_NAME"

	// AWS Access Key auth
	SecretAWSAccessKey = "EXTERNAL_KMS_AWS_ACCESS_KEY"
	SecretAWSSecretKey = "EXTERNAL_KMS_AWS_SECRET_KEY"
	SecretAWSRegion    = "EXTERNAL_KMS_AWS_REGION"
	SecretAWSKeyID     = "EXTERNAL_KMS_AWS_KEY_ID"

	// AWS Assume Role auth
	SecretAWSAssumeRoleARN        = "EXTERNAL_KMS_AWS_ASSUME_ROLE_ARN"
	SecretAWSAssumeRoleExternalID = "EXTERNAL_KMS_AWS_ASSUME_ROLE_EXTERNAL_ID"
)

func newService(t *testing.T) *externalkms.Service {
	t.Helper()
	svc, err := externalkms.NewService(context.Background(), infra.NopLogger(), &externalkms.Deps{})
	require.NoError(t, err)
	return svc
}

// ==========================================================================
// GCP KMS
// ==========================================================================

func TestGCPProvider_EncryptDecrypt_RoundTrip(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	credJSON := secrets.Require(t, SecretGCPCredentialJSON)
	keyName := secrets.Require(t, SecretGCPKeyName)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalGCPConfig(t, credJSON, keyName)
	plaintext := []byte("gcp-kms-test-payload")

	ciphertext, err := svc.Encrypt(ctx, externalkms.ProviderGCP, config, plaintext)
	require.NoError(t, err)
	require.NotEmpty(t, ciphertext)
	require.NotEqual(t, plaintext, ciphertext, "ciphertext must differ from plaintext")

	decrypted, err := svc.Decrypt(ctx, externalkms.ProviderGCP, config, ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestGCPProvider_EncryptIsNonDeterministic(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	credJSON := secrets.Require(t, SecretGCPCredentialJSON)
	keyName := secrets.Require(t, SecretGCPKeyName)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalGCPConfig(t, credJSON, keyName)
	plaintext := []byte("same-input-different-output")

	ct1, err := svc.Encrypt(ctx, externalkms.ProviderGCP, config, plaintext)
	require.NoError(t, err)

	ct2, err := svc.Encrypt(ctx, externalkms.ProviderGCP, config, plaintext)
	require.NoError(t, err)

	require.NotEqual(t, ct1, ct2, "KMS encryption must use random IV, producing different ciphertext each time")
}

func TestGCPProvider_DecryptInvalidCiphertext(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	credJSON := secrets.Require(t, SecretGCPCredentialJSON)
	keyName := secrets.Require(t, SecretGCPKeyName)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalGCPConfig(t, credJSON, keyName)
	garbage := []byte("this-is-not-valid-ciphertext")

	_, err := svc.Decrypt(ctx, externalkms.ProviderGCP, config, garbage)
	require.Error(t, err, "decrypt must fail on invalid ciphertext")
}

func mustMarshalGCPConfig(t *testing.T, credJSON, keyName string) []byte {
	t.Helper()

	var cred externalkms.GcpCredential
	err := json.Unmarshal([]byte(credJSON), &cred)
	require.NoError(t, err, "GCP credential JSON must be valid")

	config := externalkms.GcpConfig{
		Credential: cred,
		KeyName:    keyName,
	}

	data, err := json.Marshal(config)
	require.NoError(t, err)
	return data
}

// ==========================================================================
// AWS KMS - Access Key Auth
// ==========================================================================

func TestAWSProvider_AccessKey_EncryptDecrypt_RoundTrip(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	accessKey := secrets.Require(t, SecretAWSAccessKey)
	secretKey := secrets.Require(t, SecretAWSSecretKey)
	region := secrets.Require(t, SecretAWSRegion)
	keyID := secrets.Require(t, SecretAWSKeyID)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalAWSAccessKeyConfig(t, accessKey, secretKey, region, keyID)
	plaintext := []byte("aws-kms-accesskey-test-payload")

	ciphertext, err := svc.Encrypt(ctx, externalkms.ProviderAWS, config, plaintext)
	require.NoError(t, err)
	require.NotEmpty(t, ciphertext)
	require.NotEqual(t, plaintext, ciphertext, "ciphertext must differ from plaintext")

	decrypted, err := svc.Decrypt(ctx, externalkms.ProviderAWS, config, ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestAWSProvider_AccessKey_EncryptIsNonDeterministic(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	accessKey := secrets.Require(t, SecretAWSAccessKey)
	secretKey := secrets.Require(t, SecretAWSSecretKey)
	region := secrets.Require(t, SecretAWSRegion)
	keyID := secrets.Require(t, SecretAWSKeyID)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalAWSAccessKeyConfig(t, accessKey, secretKey, region, keyID)
	plaintext := []byte("same-input-different-output")

	ct1, err := svc.Encrypt(ctx, externalkms.ProviderAWS, config, plaintext)
	require.NoError(t, err)

	ct2, err := svc.Encrypt(ctx, externalkms.ProviderAWS, config, plaintext)
	require.NoError(t, err)

	require.NotEqual(t, ct1, ct2, "KMS encryption must use random IV, producing different ciphertext each time")
}

func TestAWSProvider_AccessKey_DecryptInvalidCiphertext(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	accessKey := secrets.Require(t, SecretAWSAccessKey)
	secretKey := secrets.Require(t, SecretAWSSecretKey)
	region := secrets.Require(t, SecretAWSRegion)
	keyID := secrets.Require(t, SecretAWSKeyID)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalAWSAccessKeyConfig(t, accessKey, secretKey, region, keyID)
	garbage := []byte("this-is-not-valid-ciphertext")

	_, err := svc.Decrypt(ctx, externalkms.ProviderAWS, config, garbage)
	require.Error(t, err, "decrypt must fail on invalid ciphertext")
}

func mustMarshalAWSAccessKeyConfig(t *testing.T, accessKey, secretKey, region, keyID string) []byte {
	t.Helper()

	config := externalkms.AwsConfig{
		Credential: externalkms.AwsCredential{
			Type: externalkms.AwsCredentialTypeAccessKey,
			Data: externalkms.AwsCredentialData{
				AccessKey: accessKey,
				SecretKey: secretKey,
			},
		},
		AwsRegion: region,
		KmsKeyID:  keyID,
	}

	data, err := json.Marshal(config)
	require.NoError(t, err)
	return data
}

// ==========================================================================
// AWS KMS - Assume Role Auth
// ==========================================================================

func TestAWSProvider_AssumeRole_EncryptDecrypt_RoundTrip(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)
	accessKey := secrets.Require(t, SecretAWSAccessKey)
	secretKey := secrets.Require(t, SecretAWSSecretKey)
	roleARN := secrets.Require(t, SecretAWSAssumeRoleARN)
	region := secrets.Require(t, SecretAWSRegion)
	keyID := secrets.Require(t, SecretAWSKeyID)
	externalID := secrets.Get(SecretAWSAssumeRoleExternalID) // optional

	// Set base credentials for STS AssumeRole
	t.Setenv("AWS_ACCESS_KEY_ID", accessKey)
	t.Setenv("AWS_SECRET_ACCESS_KEY", secretKey)

	svc := newService(t)
	ctx := context.Background()

	config := mustMarshalAWSAssumeRoleConfig(t, roleARN, externalID, region, keyID)
	plaintext := []byte("aws-kms-assumerole-test-payload")

	ciphertext, err := svc.Encrypt(ctx, externalkms.ProviderAWS, config, plaintext)
	require.NoError(t, err)
	require.NotEmpty(t, ciphertext)
	require.NotEqual(t, plaintext, ciphertext, "ciphertext must differ from plaintext")

	decrypted, err := svc.Decrypt(ctx, externalkms.ProviderAWS, config, ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func mustMarshalAWSAssumeRoleConfig(t *testing.T, roleARN, externalID, region, keyID string) []byte {
	t.Helper()

	config := externalkms.AwsConfig{
		Credential: externalkms.AwsCredential{
			Type: externalkms.AwsCredentialTypeAssumeRole,
			Data: externalkms.AwsCredentialData{
				AssumeRoleArn: roleARN,
				ExternalID:    externalID,
			},
		},
		AwsRegion: region,
		KmsKeyID:  keyID,
	}

	data, err := json.Marshal(config)
	require.NoError(t, err)
	return data
}

// ==========================================================================
// Cross-provider isolation
// ==========================================================================

func TestCrossProvider_CiphertextNotInterchangeable(t *testing.T) {
	secrets := infra.GetPlatformSecrets(t)

	// Skip if either provider's secrets are missing
	gcpCredJSON := secrets.Require(t, SecretGCPCredentialJSON)
	gcpKeyName := secrets.Require(t, SecretGCPKeyName)
	awsAccessKey := secrets.Require(t, SecretAWSAccessKey)
	awsSecretKey := secrets.Require(t, SecretAWSSecretKey)
	awsRegion := secrets.Require(t, SecretAWSRegion)
	awsKeyID := secrets.Require(t, SecretAWSKeyID)

	svc := newService(t)
	ctx := context.Background()

	gcpConfig := mustMarshalGCPConfig(t, gcpCredJSON, gcpKeyName)
	awsConfig := mustMarshalAWSAccessKeyConfig(t, awsAccessKey, awsSecretKey, awsRegion, awsKeyID)

	plaintext := []byte("cross-provider-test")

	// Encrypt with GCP
	gcpCiphertext, err := svc.Encrypt(ctx, externalkms.ProviderGCP, gcpConfig, plaintext)
	require.NoError(t, err)

	// Attempt to decrypt GCP ciphertext with AWS — must fail
	_, err = svc.Decrypt(ctx, externalkms.ProviderAWS, awsConfig, gcpCiphertext)
	require.Error(t, err, "GCP ciphertext must not be decryptable by AWS KMS")

	// Encrypt with AWS
	awsCiphertext, err := svc.Encrypt(ctx, externalkms.ProviderAWS, awsConfig, plaintext)
	require.NoError(t, err)

	// Attempt to decrypt AWS ciphertext with GCP — must fail
	_, err = svc.Decrypt(ctx, externalkms.ProviderGCP, gcpConfig, awsCiphertext)
	require.Error(t, err, "AWS ciphertext must not be decryptable by GCP KMS")
}

// ==========================================================================
// Error cases
// ==========================================================================

func TestService_UnsupportedProvider(t *testing.T) {
	svc := newService(t)
	ctx := context.Background()

	_, err := svc.Encrypt(ctx, "unsupported-provider", []byte("{}"), []byte("test"))
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsupported")
}

func TestService_InvalidConfigJSON(t *testing.T) {
	svc := newService(t)
	ctx := context.Background()

	invalidJSON := []byte("not-valid-json")

	_, err := svc.Encrypt(ctx, externalkms.ProviderAWS, invalidJSON, []byte("test"))
	require.Error(t, err)
	require.Contains(t, err.Error(), "parsing")

	_, err = svc.Encrypt(ctx, externalkms.ProviderGCP, invalidJSON, []byte("test"))
	require.Error(t, err)
	require.Contains(t, err.Error(), "parsing")
}
