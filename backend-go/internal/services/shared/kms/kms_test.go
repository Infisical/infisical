package kms_test

import (
	"context"
	"log"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/services/shared/kms"
	"github.com/infisical/api/internal/testutil"
)

var orgID uuid.UUID

var infra *testutil.TestInfra

func TestMain(m *testing.M) {
	infra = testutil.SetupInfra()

	var err error
	orgID, err = uuid.Parse(infra.OrgID)
	if err != nil {
		log.Fatalf("kms_test: parsing org ID: %v", err)
	}

	code := m.Run()
	infra.Teardown()
	os.Exit(code)
}

// setupService creates a KMS service wired to real PostgreSQL + Redis.
func setupService(t *testing.T) *kms.SharedService {
	t.Helper()

	opts, err := redis.ParseURL(infra.RedisURL)
	require.NoError(t, err)
	redisClient := redis.NewClient(opts)
	t.Cleanup(func() { redisClient.Close() })

	ks := keystore.NewKeyStore(redisClient, infra.DB.Primary())
	dal := kms.NewDAL(infra.DB, ks)

	svc, err := kms.NewSharedService(dal, nil, infra.Config)
	require.NoError(t, err)
	return svc
}

// startedService returns a service with Start() already called.
func startedService(t *testing.T) *kms.SharedService {
	t.Helper()
	svc := setupService(t)
	require.NoError(t, svc.Start(context.Background(), false))
	return svc
}

// ==========================================================================
// Start
// ==========================================================================

func TestStart(t *testing.T) {
	svc := setupService(t)
	err := svc.Start(context.Background(), false)
	require.NoError(t, err)
}

func TestStart_Idempotent(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	require.NoError(t, svc.Start(ctx, false))
	require.NoError(t, svc.Start(ctx, false))
}

func TestStart_Concurrent(t *testing.T) {
	ctx := context.Background()
	const n = 10

	// Set up services before spawning goroutines (require.NoError isn't goroutine-safe).
	services := make([]*kms.SharedService, n)
	for i := 0; i < n; i++ {
		services[i] = setupService(t)
	}

	errs := make([]error, n)
	var wg sync.WaitGroup
	wg.Add(n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			errs[idx] = services[idx].Start(ctx, false)
		}(i)
	}

	wg.Wait()
	for i, err := range errs {
		require.NoError(t, err, "goroutine %d", i)
	}
}

// ==========================================================================
// Organization cipher pair
// ==========================================================================

func TestOrgCipherPair_EncryptDecryptRoundTrip(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	pair, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:  kms.DataKeyOrganization,
		OrgID: orgID,
	})
	require.NoError(t, err)
	require.NotNil(t, pair)

	plaintext := []byte("hello secret world")
	ciphertext, err := pair.Encrypt(plaintext)
	require.NoError(t, err)
	require.NotEqual(t, plaintext, ciphertext)

	decrypted, err := pair.Decrypt(ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestOrgCipherPair_Idempotent(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	dto := kms.CreateCipherPairDTO{
		Type:  kms.DataKeyOrganization,
		OrgID: orgID,
	}

	pair1, err := svc.CreateCipherPairWithDataKey(ctx, dto)
	require.NoError(t, err)

	pair2, err := svc.CreateCipherPairWithDataKey(ctx, dto)
	require.NoError(t, err)

	// Encrypt with pair1, decrypt with pair2 — both bound to the same data key.
	plaintext := []byte("cross-pair test")
	ciphertext, err := pair1.Encrypt(plaintext)
	require.NoError(t, err)

	decrypted, err := pair2.Decrypt(ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestOrgCipherPair_Concurrent(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	const n = 10
	plaintext := []byte("concurrent org test")
	ciphertexts := make([][]byte, n)
	errs := make([]error, n)

	var wg sync.WaitGroup
	wg.Add(n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			pair, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
				Type:  kms.DataKeyOrganization,
				OrgID: orgID,
			})
			if err != nil {
				errs[idx] = err
				return
			}
			ciphertexts[idx], errs[idx] = pair.Encrypt(plaintext)
		}(i)
	}

	wg.Wait()
	for i, err := range errs {
		require.NoError(t, err, "goroutine %d", i)
	}

	// All ciphertexts should decrypt to the same plaintext.
	pair, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:  kms.DataKeyOrganization,
		OrgID: orgID,
	})
	require.NoError(t, err)

	for i, ct := range ciphertexts {
		decrypted, err := pair.Decrypt(ct)
		require.NoError(t, err, "decrypting goroutine %d ciphertext", i)
		require.Equal(t, plaintext, decrypted, "goroutine %d", i)
	}
}

// ==========================================================================
// Project cipher pair
// ==========================================================================

func TestProjectCipherPair_CreatesFromScratch(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	proj := infra.CreateProject(t, "kms-scratch")

	pair, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: proj.ID,
	})
	require.NoError(t, err)
	require.NotNil(t, pair)

	plaintext := []byte("project secret data")
	ciphertext, err := pair.Encrypt(plaintext)
	require.NoError(t, err)

	decrypted, err := pair.Decrypt(ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestProjectCipherPair_Idempotent(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	proj := infra.CreateProject(t, "kms-idempotent")

	dto := kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: proj.ID,
	}

	pair1, err := svc.CreateCipherPairWithDataKey(ctx, dto)
	require.NoError(t, err)

	pair2, err := svc.CreateCipherPairWithDataKey(ctx, dto)
	require.NoError(t, err)

	// Cross-decrypt: encrypt with first, decrypt with second.
	plaintext := []byte("idempotent project test")
	ciphertext, err := pair1.Encrypt(plaintext)
	require.NoError(t, err)

	decrypted, err := pair2.Decrypt(ciphertext)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestProjectCipherPair_Concurrent(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	// All goroutines race on the same fresh project.
	proj := infra.CreateProject(t, "kms-concurrent")

	const n = 10
	plaintext := []byte("concurrent project test")
	ciphertexts := make([][]byte, n)
	errs := make([]error, n)

	var wg sync.WaitGroup
	wg.Add(n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			defer wg.Done()
			pair, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
				Type:      kms.DataKeyProject,
				ProjectID: proj.ID,
			})
			if err != nil {
				errs[idx] = err
				return
			}
			ciphertexts[idx], errs[idx] = pair.Encrypt(plaintext)
		}(i)
	}

	wg.Wait()
	for i, err := range errs {
		require.NoError(t, err, "goroutine %d", i)
	}

	// All should decrypt to same plaintext.
	pair, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: proj.ID,
	})
	require.NoError(t, err)

	for i, ct := range ciphertexts {
		decrypted, err := pair.Decrypt(ct)
		require.NoError(t, err, "decrypting goroutine %d ciphertext", i)
		require.Equal(t, plaintext, decrypted, "goroutine %d", i)
	}
}

// TestProjectCipherPair_IsolatedPerProject verifies that different projects
// get different data keys — ciphertexts are not cross-decryptable.
func TestProjectCipherPair_IsolatedPerProject(t *testing.T) {
	svc := startedService(t)
	ctx := context.Background()

	proj1 := infra.CreateProject(t, "kms-iso-1")
	proj2 := infra.CreateProject(t, "kms-iso-2")

	pair1, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: proj1.ID,
	})
	require.NoError(t, err)

	pair2, err := svc.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: proj2.ID,
	})
	require.NoError(t, err)

	plaintext := []byte("isolation test")
	ciphertext, err := pair1.Encrypt(plaintext)
	require.NoError(t, err)

	// Decrypting project1's ciphertext with project2's key should fail.
	_, err = pair2.Decrypt(ciphertext)
	require.Error(t, err)
}

// ==========================================================================
// Error paths
// ==========================================================================

func TestCipherPair_MissingProjectID(t *testing.T) {
	svc := startedService(t)

	_, err := svc.CreateCipherPairWithDataKey(context.Background(), kms.CreateCipherPairDTO{
		Type: kms.DataKeyProject,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "project ID is required")
}

func TestCipherPair_MissingOrgID(t *testing.T) {
	svc := startedService(t)

	_, err := svc.CreateCipherPairWithDataKey(context.Background(), kms.CreateCipherPairDTO{
		Type: kms.DataKeyOrganization,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "org ID is required")
}
