package kms

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"sync"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/crypto/cipher"
	"github.com/infisical/api/internal/database/pg/gen/model"
)

// KmsRootConfigUUID is the fixed UUID for the single kms_root_config row.
var KmsRootConfigUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

const (

	// KMSVersion is the version tag appended to all KMS-encrypted blobs.
	KMSVersion = "v01"
	// KMSVersionBlobLength is the byte length of KMSVersion.
	KMSVersionBlobLength = 3

	// PgLockKmsRootKeyInit is the advisory lock ID for root config initialization.
	// Must match the Node.js backend value (PgSqlLock.KmsRootKeyInit = 2025).
	PgLockKmsRootKeyInit int64 = 2025
)

// RootKeyEncryptionStrategy determines how the root key is encrypted at rest.
type RootKeyEncryptionStrategy string

const (
	StrategyHSM      RootKeyEncryptionStrategy = "HSM"
	StrategySoftware RootKeyEncryptionStrategy = "SOFTWARE"
)

// DataKeyType selects between org-level and project-level data keys.
type DataKeyType int

const (
	DataKeyOrganization DataKeyType = iota
	DataKeyProject
)

// Encryptor encrypts plaintext and returns the ciphertext blob (with version suffix).
type Encryptor func(plainText []byte) ([]byte, error)

// Decryptor decrypts a versioned ciphertext blob and returns the plaintext.
type Decryptor func(cipherTextBlob []byte) ([]byte, error)

// CipherPair holds matched encrypt/decrypt functions bound to a single data key.
type CipherPair struct {
	Encrypt Encryptor
	Decrypt Decryptor
}

// CreateCipherPairDTO selects which data key to use.
type CreateCipherPairDTO struct {
	Type      DataKeyType
	ProjectID string    // required when Type == DataKeyProject
	OrgID     uuid.UUID // required when Type == DataKeyOrganization
}

// dal defines the subset of DAL operations this service needs.
type dal interface {
	// Root config.
	FindOrCreateRootConfig(ctx context.Context, createFn func() (encryptedRootKey []byte, encryptionStrategy string, err error)) (*model.KmsRootConfig, error)

	// Organization find-or-create with advisory lock.
	FindOrCreateOrgKmsKey(ctx context.Context, orgID uuid.UUID, generateKeyFn func() (encryptedKey []byte, err error)) (uuid.UUID, error)
	FindOrCreateOrgDataKey(ctx context.Context, orgID uuid.UUID, createFn func() (encryptedDataKey []byte, err error)) ([]byte, error)

	// Project find-or-create with advisory lock.
	FindOrCreateProjectKmsKey(ctx context.Context, projectID string, createFn func() (encryptedKey []byte, err error)) (uuid.UUID, error)
	FindOrCreateProjectDataKey(ctx context.Context, projectID string, createFn func() (encryptedDataKey []byte, err error)) ([]byte, error)

	// KMS key reads.
	FindKmsKeyByID(ctx context.Context, kmsKeyID uuid.UUID) (*KmsKeyWithAssociatedKms, error)

	// Organization reads.
	FindOrgKmsInfo(ctx context.Context, orgID uuid.UUID) (*OrgKmsInfo, error)

	// Project reads.
	FindProjectKmsInfo(ctx context.Context, projectID string) (*ProjectKmsInfo, error)
}

// HsmService defines the HSM operations needed by the KMS service.
// Pass nil when HSM is not configured.
type HsmService interface {
	IsActive() bool
	Encrypt(data []byte) ([]byte, error)
	Decrypt(blob []byte) ([]byte, error)
	RandomBytes(n int) ([]byte, error)
}

// SharedService manages the KMS key hierarchy:
//
//	ROOT_ENCRYPTION_KEY (in memory)
//	  → decrypts KMS key material (internal_kms.encrypted_key)
//	    → decrypts data key (org/project encrypted data key)
//	      → encrypts/decrypts secrets (via CipherPair)
type SharedService struct {
	mu                sync.RWMutex
	rootEncryptionKey []byte // loaded during Start(), protected by mu

	encryptionKey []byte     // from env (ENCRYPTION_KEY / ROOT_ENCRYPTION_KEY)
	dal           dal        // database operations
	hsm           HsmService // nil when HSM is not configured
}

// Deps holds the dependencies for the KMS shared service.
type Deps struct {
	DAL    dal
	HSM    HsmService // nil when HSM is not configured
	Config *config.Config
}

// NewSharedService creates a new KMS service.
func NewSharedService(deps Deps) (*SharedService, error) {
	var encryptionKey []byte
	if deps.Config.EncryptionKey != "" {
		encryptionKey = []byte(deps.Config.EncryptionKey)
	} else if deps.Config.RootEncryptionKey != "" {
		var decErr error
		encryptionKey, decErr = base64.StdEncoding.DecodeString(deps.Config.RootEncryptionKey)
		if decErr != nil {
			return nil, fmt.Errorf("failed to decode ROOT_ENCRYPTION_KEY from base64: %w", decErr)
		}
	}

	return &SharedService{
		encryptionKey: encryptionKey,
		dal:           deps.DAL,
		hsm:           deps.HSM,
	}, nil
}

// Start bootstraps the KMS root key. It must be called once during server startup
// before any calls to CreateCipherPairWithDataKey.
//
// It atomically finds or creates the root config in the database (using a PG advisory lock),
// then decrypts the root key into memory.
func (s *SharedService) Start(ctx context.Context, hsmConfigured bool) error {
	strategy := StrategySoftware
	if hsmConfigured {
		strategy = StrategyHSM
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	rootConfig, err := s.dal.FindOrCreateRootConfig(ctx, func() (encryptedRootKey []byte, encryptionStrategy string, err error) {
		var newRootKey []byte
		if hsmConfigured && s.hsm != nil {
			var genErr error
			newRootKey, genErr = s.hsm.RandomBytes(32)
			if genErr != nil {
				return nil, "", fmt.Errorf("generating root key with HSM: %w", genErr)
			}
		} else {
			newRootKey = make([]byte, 32)
			if _, genErr := rand.Read(newRootKey); genErr != nil {
				return nil, "", fmt.Errorf("generating root key: %w", genErr)
			}
		}

		encryptedNewKey, encErr := s.encryptRootKey(newRootKey, strategy)
		if encErr != nil {
			return nil, "", fmt.Errorf("encrypting new root key: %w", encErr)
		}

		strategyStr := string(strategy)
		return encryptedNewKey, strategyStr, nil
	})

	if err != nil {
		return fmt.Errorf("KMS: finding/creating root config: %w", err)
	}

	decryptedRootKey, err := s.decryptRootKey(rootConfig)
	if err != nil {
		return fmt.Errorf("KMS: decrypting root key: %w", err)
	}

	s.rootEncryptionKey = decryptedRootKey
	return nil
}

// CreateCipherPairWithDataKey returns an Encryptor/Decryptor pair bound to the
// data key for the given org or project. All blobs include a "v01" version suffix.
func (s *SharedService) CreateCipherPairWithDataKey(ctx context.Context, dto CreateCipherPairDTO) (*CipherPair, error) {
	dataKey, err := s.getDataKey(ctx, dto)
	if err != nil {
		return nil, err
	}

	return &CipherPair{
		Encrypt: func(plainText []byte) ([]byte, error) {
			return encryptWithVersion(plainText, dataKey)
		},
		Decrypt: func(cipherTextBlob []byte) ([]byte, error) {
			return decryptWithVersion(cipherTextBlob, dataKey)
		},
	}, nil
}

// --- internal helpers ---

func (s *SharedService) getRootKey() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.rootEncryptionKey
}

func (s *SharedService) getDataKey(ctx context.Context, dto CreateCipherPairDTO) ([]byte, error) {
	if dto.Type == DataKeyProject && dto.ProjectID == "" {
		return nil, fmt.Errorf("project ID is required for project data key")
	}

	if dto.Type == DataKeyOrganization && dto.OrgID == uuid.Nil {
		return nil, fmt.Errorf("org ID is required for organization data key")
	}

	switch dto.Type {
	case DataKeyProject:
		return s.getProjectDataKey(ctx, dto.ProjectID)
	case DataKeyOrganization:
		return s.getOrgDataKey(ctx, dto.OrgID)
	default:
		return nil, fmt.Errorf("KMS: unknown data key type: %d", dto.Type)
	}
}

// --- KMS key material ---

// generateEncryptedKeyMaterial generates a random 32-byte key and encrypts it
// with the root key (no version suffix). Used as the callback for find-or-create DAL methods.
func (s *SharedService) generateEncryptedKeyMaterial() ([]byte, error) {
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

// decryptKmsKey loads a KMS key record and decrypts its key material using the root key.
// For internal KMS keys, decrypts locally. External KMS keys are not yet supported.
func (s *SharedService) decryptKmsKey(ctx context.Context, kmsKeyID uuid.UUID) ([]byte, error) {
	kmsKeyDoc, err := s.dal.FindKmsKeyByID(ctx, kmsKeyID)
	if err != nil {
		return nil, fmt.Errorf("KMS: finding KMS key %s: %w", kmsKeyID, err)
	}
	return s.decryptKmsKeyMaterial(kmsKeyDoc)
}

// decryptKmsKeyMaterial decrypts the key material from a KmsKeyWithAssociatedKms record.
// Branches on internal (local AES-GCM) vs external (cloud provider — not yet implemented).
func (s *SharedService) decryptKmsKeyMaterial(kmsKeyDoc *KmsKeyWithAssociatedKms) ([]byte, error) {
	if kmsKeyDoc.ExternalKms != nil {
		panic("external KMS not implemented")
	}

	if kmsKeyDoc.InternalKms == nil {
		return nil, fmt.Errorf("KMS: key %s has no internal or external KMS association", kmsKeyDoc.ID.String())
	}

	rootKey := s.getRootKey()
	if len(rootKey) == 0 {
		return nil, fmt.Errorf("KMS: root encryption key not loaded, call Start first")
	}

	if kmsKeyDoc.InternalKms.EncryptionAlgorithm != "aes-256-gcm" {
		return nil, fmt.Errorf("KMS: unsupported encryption algorithm: %s", kmsKeyDoc.InternalKms.EncryptionAlgorithm)
	}

	// internal_kms.encrypted_key is AES-GCM encrypted with ROOT_KEY (no version suffix).
	return cipher.SymmetricDecrypt(kmsKeyDoc.InternalKms.EncryptedKey, rootKey)
}

// --- Root key encrypt/decrypt ---

func (s *SharedService) encryptRootKey(plainKey []byte, strategy RootKeyEncryptionStrategy) ([]byte, error) {
	switch strategy {
	case StrategyHSM:
		if s.hsm == nil {
			return nil, fmt.Errorf("KMS: HSM service not configured")
		}
		return s.hsm.Encrypt(plainKey)
	case StrategySoftware:
		if len(s.encryptionKey) == 0 {
			return nil, fmt.Errorf("KMS: ENCRYPTION_KEY / ROOT_ENCRYPTION_KEY not set")
		}
		// Root key is encrypted with AES-GCM (no version suffix).
		return cipher.SymmetricEncrypt(plainKey, s.encryptionKey)
	default:
		return nil, fmt.Errorf("KMS: unknown encryption strategy: %s", strategy)
	}
}

func (s *SharedService) decryptRootKey(rootCfg *model.KmsRootConfig) ([]byte, error) {
	strategy := StrategySoftware
	if rootCfg.EncryptionStrategy.Valid {
		strategy = RootKeyEncryptionStrategy(rootCfg.EncryptionStrategy.V)
	}

	switch strategy {
	case StrategyHSM:
		if s.hsm == nil {
			return nil, fmt.Errorf("KMS: HSM service not configured")
		}
		if !s.hsm.IsActive() {
			return nil, fmt.Errorf("KMS: HSM service is not active")
		}
		return s.hsm.Decrypt(rootCfg.EncryptedRootKey)
	case StrategySoftware:
		if len(s.encryptionKey) == 0 {
			return nil, fmt.Errorf("KMS: ENCRYPTION_KEY / ROOT_ENCRYPTION_KEY not set")
		}
		// Root key is encrypted with AES-GCM (no version suffix).
		return cipher.SymmetricDecrypt(rootCfg.EncryptedRootKey, s.encryptionKey)
	default:
		return nil, fmt.Errorf("KMS: unknown encryption strategy: %s", strategy)
	}
}

// --- Versioned encrypt/decrypt ---

// encryptWithVersion encrypts plaintext with AES-GCM-256 and appends the "v01" version suffix.
func encryptWithVersion(plaintext, key []byte) ([]byte, error) {
	encrypted, err := cipher.SymmetricEncrypt(plaintext, key)
	if err != nil {
		return nil, err
	}
	return append(encrypted, []byte(KMSVersion)...), nil
}

// decryptWithVersion strips the "v01" version suffix and decrypts with AES-GCM-256.
func decryptWithVersion(blob, key []byte) ([]byte, error) {
	if len(blob) < KMSVersionBlobLength {
		return nil, fmt.Errorf("KMS: encrypted blob too short")
	}
	ciphertext := blob[:len(blob)-KMSVersionBlobLength]
	return cipher.SymmetricDecrypt(ciphertext, key)
}

// --- Utilities ---

// generateRandomKeyName generates a random 8-character hex name for a KMS key.
func generateRandomKeyName() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}
