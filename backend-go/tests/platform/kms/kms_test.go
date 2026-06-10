//go:build integration

package kms_test

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/tests/infra"
)

var stack *infra.Stack

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

func startedService(t *testing.T) *kms.Service {
	t.Helper()
	svc, err := kms.NewService(context.Background(), infra.NopLogger(), &kms.Deps{
		DB:          stack.DB(),
		HSM:         nil,
		ExternalKms: nil,
		Config:      stack.Config(),
	})
	require.NoError(t, err)
	require.NoError(t, svc.Start(context.Background(), false))
	return svc
}

// ==========================================================================
// Key Isolation: Project A cannot decrypt Project B's data
// ==========================================================================

func TestProjectIsolation_CrossProjectDecryptFails(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	proj1 := stack.NodeJS().MustCreateProject("kms-iso-proj1")
	proj2 := stack.NodeJS().MustCreateProject("kms-iso-proj2")

	pair1, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj1.ID)
	require.NoError(t, err)

	pair2, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj2.ID)
	require.NoError(t, err)

	secret := []byte("project1 secret")
	ciphertext, err := pair1.Encrypt(secret)
	require.NoError(t, err)

	// Project2 must NOT decrypt project1's data
	_, err = pair2.Decrypt(ciphertext)
	require.Error(t, err, "project2 should not decrypt project1's ciphertext")
}

// ==========================================================================
// Concurrency: Racing first-access creates exactly ONE KMS key
// ==========================================================================

func TestConcurrentFirstAccess_CreatesExactlyOneProjectKey(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	// Fresh project with no KMS key yet
	proj := stack.NodeJS().MustCreateProject("kms-race-proj")

	const n = 10
	var wg sync.WaitGroup
	wg.Add(n)
	errs := make([]error, n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		require.NoError(t, err, "goroutine %d failed", i)
	}

	// Verify: exactly ONE kms_keys row for this project
	var kmsKeyCount int
	err := stack.DB().Replica().QueryRow(ctx, `
		SELECT COUNT(*) FROM kms_keys k
		JOIN projects p ON p."kmsSecretManagerKeyId" = k.id
		WHERE p.id = @projectID
	`, pgx.NamedArgs{"projectID": proj.ID}).Scan(&kmsKeyCount)
	require.NoError(t, err)
	require.Equal(t, 1, kmsKeyCount, "expected exactly 1 KMS key, got %d", kmsKeyCount)
}

// ==========================================================================
// Node.js ↔ Go Compatibility (using secrets as proxy)
// ==========================================================================

func TestCompatibility_GoDecryptsNodeEncryptedSecret(t *testing.T) {
	ctx := context.Background()

	// Create project and secret via Node.js
	proj := stack.NodeJS().MustCreateProject("compat-node-to-go")
	plaintext := "node-encrypted-secret-value"
	secret := stack.NodeJS().CreateSecret(t, proj.ID, "dev", "/", "NODE_SECRET", plaintext, nil)

	// Read encrypted value directly from secrets_v2
	var encryptedValue []byte
	err := stack.DB().Replica().QueryRow(ctx, `
		SELECT "encryptedValue"
		FROM secrets_v2
		WHERE id = @secretID
	`, pgx.NamedArgs{"secretID": secret.ID}).Scan(&encryptedValue)
	require.NoError(t, err)
	require.NotEmpty(t, encryptedValue)

	// Go decrypts using project's cipher pair
	svc := startedService(t)
	pair, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.NoError(t, err)

	decrypted, err := pair.Decrypt(encryptedValue)
	require.NoError(t, err)
	require.Equal(t, plaintext, string(decrypted))
}

func TestCompatibility_NodeDecryptsGoEncryptedSecret(t *testing.T) {
	ctx := context.Background()

	// Create project and initial secret via Node.js
	proj := stack.NodeJS().MustCreateProject("compat-go-to-node")
	originalValue := "original-value"
	stack.NodeJS().CreateSecret(t, proj.ID, "dev", "/", "GO_SECRET", originalValue, nil)

	// Go encrypts a new value
	svc := startedService(t)
	pair, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.NoError(t, err)

	newPlaintext := "go-encrypted-secret-value"
	newEncrypted, err := pair.Encrypt([]byte(newPlaintext))
	require.NoError(t, err)

	// Update the secret's encrypted value directly in secrets_v2
	result, err := stack.DB().Primary().Exec(ctx, `
		UPDATE secrets_v2
		SET "encryptedValue" = @encryptedValue
		WHERE key = 'GO_SECRET' AND "folderId" IN (
			SELECT id FROM secret_folders WHERE "envId" IN (
				SELECT id FROM project_environments WHERE "projectId" = @projectID AND slug = 'dev'
			) AND name = 'root'
		)
	`, pgx.NamedArgs{
		"encryptedValue": newEncrypted,
		"projectID":      proj.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), result.RowsAffected(), "should update exactly 1 row")

	// Node.js reads the secret via API - should decrypt successfully
	readSecret := stack.NodeJS().GetSecretByKey(t, proj.ID, "dev", "/", "GO_SECRET")
	require.Equal(t, newPlaintext, readSecret.Value)
}

// ==========================================================================
// Corrupted Input Handling
// ==========================================================================

func TestCorruptedCiphertext_TruncatedFails(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	proj := stack.NodeJS().MustCreateProject("kms-corrupt-trunc")

	pair, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.NoError(t, err)

	ciphertext, err := pair.Encrypt([]byte("some data"))
	require.NoError(t, err)

	// Truncate ciphertext
	truncated := ciphertext[:len(ciphertext)/2]
	_, err = pair.Decrypt(truncated)
	require.Error(t, err, "truncated ciphertext should fail")
}

func TestCorruptedCiphertext_BitFlipFails(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	proj := stack.NodeJS().MustCreateProject("kms-corrupt-flip")

	pair, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.NoError(t, err)

	ciphertext, err := pair.Encrypt([]byte("authentic data"))
	require.NoError(t, err)

	// Flip a bit in the middle of ciphertext
	corrupted := make([]byte, len(ciphertext))
	copy(corrupted, ciphertext)
	corrupted[len(corrupted)/2] ^= 0xFF

	_, err = pair.Decrypt(corrupted)
	require.Error(t, err, "corrupted ciphertext should fail authentication")
}

func TestCorruptedCiphertext_WrongVersionSuffixStillDecrypts(t *testing.T) {
	// Version suffix is informational metadata, not part of authentication.
	// Modifying it does not break decryption - the ciphertext body is still valid.
	svc := startedService(t)
	ctx := context.Background()

	proj := stack.NodeJS().MustCreateProject("kms-corrupt-ver")

	pair, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.NoError(t, err)

	plaintext := []byte("versioned data")
	ciphertext, err := pair.Encrypt(plaintext)
	require.NoError(t, err)

	// Replace version suffix (last 3 bytes) - decryption still works
	tampered := make([]byte, len(ciphertext))
	copy(tampered, ciphertext)
	copy(tampered[len(tampered)-3:], "v99")

	decrypted, err := pair.Decrypt(tampered)
	require.NoError(t, err, "version suffix is not validated")
	require.Equal(t, plaintext, decrypted)
}

// ==========================================================================
// Error Cases
// ==========================================================================

func TestCreateCipherPair_NonexistentProjectFails(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	_, err := svc.CreateCipherPairWithProjectDataKey(ctx, "nonexistent-project-id")
	require.Error(t, err)
}

func TestCreateCipherPair_EmptyProjectIDFails(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	_, err := svc.CreateCipherPairWithProjectDataKey(ctx, "")
	require.Error(t, err)
	require.Contains(t, err.Error(), "project ID is required")
}

// ==========================================================================
// External KMS Tests (using mock provider)
// ==========================================================================

func startedServiceWithExternalKms(t *testing.T, extKms kms.ExternalKmsService) *kms.Service {
	t.Helper()
	svc, err := kms.NewService(context.Background(), infra.NopLogger(), &kms.Deps{
		DB:          stack.DB(),
		HSM:         nil,
		ExternalKms: extKms,
		Config:      stack.Config(),
	})
	require.NoError(t, err)
	require.NoError(t, svc.Start(context.Background(), false))
	return svc
}

// setupExternalKmsForProject creates an external KMS key for a project.
// Returns the project and the original (unencrypted) provider config.
func setupExternalKmsForProject(t *testing.T, svc *kms.Service, mock *externalkms.MockProvider, projectName string) (proj *infra.ProjectSeed, configJSON []byte) {
	t.Helper()
	ctx := context.Background()

	// Create project via Node.js (this sets up org with internal KMS)
	proj = stack.NodeJS().MustCreateProject(projectName)

	// Get org ID from project
	var orgID uuid.UUID
	err := stack.DB().Replica().QueryRow(ctx, `SELECT "orgId" FROM projects WHERE id = @id`,
		pgx.NamedArgs{"id": proj.ID}).Scan(&orgID)
	require.NoError(t, err)

	// First, ensure org has a data key by creating a cipher pair
	orgPair, err := svc.CreateCipherPairWithOrgDataKey(ctx, orgID)
	require.NoError(t, err)

	// Create fake external KMS config
	providerConfig := map[string]string{"key": "test-key-id", "region": "us-east-1"}
	configJSON, err = json.Marshal(providerConfig)
	require.NoError(t, err)

	// Encrypt config with org's data key
	encryptedConfig, err := orgPair.Encrypt(configJSON)
	require.NoError(t, err)

	// Create external KMS key in database
	var kmsKeyID uuid.UUID
	err = stack.DB().Primary().QueryRow(ctx, `
		INSERT INTO kms_keys (name, "orgId", "isReserved", "keyUsage")
		VALUES (@name, @orgID, false, 'encrypt-decrypt')
		RETURNING id
	`, pgx.NamedArgs{"name": "test-external-kms", "orgID": orgID}).Scan(&kmsKeyID)
	require.NoError(t, err)

	// Create external_kms record
	_, err = stack.DB().Primary().Exec(ctx, `
		INSERT INTO external_kms (id, provider, "encryptedProviderInputs", "kmsKeyId")
		VALUES (gen_random_uuid(), 'aws', @encryptedConfig, @kmsKeyID)
	`, pgx.NamedArgs{"encryptedConfig": encryptedConfig, "kmsKeyID": kmsKeyID})
	require.NoError(t, err)

	// Generate project data key and "encrypt" it with mock external KMS
	// Mock uses XOR with 0x42, so we simulate what the external KMS would return
	plainDataKey := make([]byte, 32)
	for i := range plainDataKey {
		plainDataKey[i] = byte(i + 1) // deterministic for testing
	}
	encryptedDataKey, err := mock.Encrypt(ctx, "aws", configJSON, plainDataKey)
	require.NoError(t, err)

	// Update project to use external KMS and set the encrypted data key
	_, err = stack.DB().Primary().Exec(ctx, `
		UPDATE projects
		SET "kmsSecretManagerKeyId" = @kmsKeyID,
		    "kmsSecretManagerEncryptedDataKey" = @encryptedDataKey
		WHERE id = @projectID
	`, pgx.NamedArgs{"kmsKeyID": kmsKeyID, "encryptedDataKey": encryptedDataKey, "projectID": proj.ID})
	require.NoError(t, err)

	// Reset mock counters after setup
	mock.Reset()

	return proj, configJSON
}

func TestExternalKms_DecryptFlowCallsProvider(t *testing.T) {
	ctx := context.Background()
	mock := externalkms.NewMockProvider()
	svc := startedServiceWithExternalKms(t, mock)

	proj, expectedConfig := setupExternalKmsForProject(t, svc, mock, "ext-kms-decrypt")

	// Create cipher pair - this calls external KMS to decrypt the project data key
	pair, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.NoError(t, err)

	// External KMS Decrypt was called once to get the project data key
	require.Equal(t, 1, mock.DecryptCalls, "external KMS decrypt should be called to get data key")
	require.Equal(t, 0, mock.EncryptCalls, "external KMS encrypt is not used in this flow")

	// Verify the config was decrypted and passed to provider
	require.JSONEq(t, string(expectedConfig), string(mock.LastConfig))
	require.Equal(t, externalkms.ProviderAWS, mock.LastProvider)

	// Local encrypt/decrypt uses the decrypted data key (no more external KMS calls)
	plaintext := []byte("external kms test data")
	ciphertext, err := pair.Encrypt(plaintext)
	require.NoError(t, err)

	decrypted, err := pair.Decrypt(ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)

	// No additional external KMS calls - local crypto uses the data key
	require.Equal(t, 1, mock.DecryptCalls, "no additional decrypt calls")
	require.Equal(t, 0, mock.EncryptCalls, "no encrypt calls")
}

func TestExternalKms_ProviderFailurePropagates(t *testing.T) {
	ctx := context.Background()
	mock := externalkms.NewMockProvider()
	svc := startedServiceWithExternalKms(t, mock)

	proj, _ := setupExternalKmsForProject(t, svc, mock, "ext-kms-fail")

	// Now configure mock to fail
	mock.ShouldFail = true

	// CreateCipherPairWithProjectDataKey should fail because it tries to decrypt
	// the data key using the external KMS, which is configured to fail
	_, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "mock external KMS decrypt failed")
}

func TestExternalKms_NilServiceReturnsError(t *testing.T) {
	ctx := context.Background()
	mock := externalkms.NewMockProvider()

	// First create with mock to set up the external KMS in DB
	svcWithMock := startedServiceWithExternalKms(t, mock)
	proj, _ := setupExternalKmsForProject(t, svcWithMock, mock, "ext-kms-nil")

	// Now create service WITHOUT external KMS
	svc := startedService(t)

	// This should fail because external KMS service is nil
	_, err := svc.CreateCipherPairWithProjectDataKey(ctx, proj.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "external KMS service not configured")
}
