package kms

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/internal/libs/crypto/cipher"
	"github.com/infisical/api/internal/libs/errutil"
)

// KmsRootConfigUUID is the fixed UUID for the single kms_root_config row.
var KmsRootConfigUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

// superAdminConfigUUID is the fixed UUID for the single super_admin config row.
var superAdminConfigUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

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

// Encryptor encrypts plaintext and returns the ciphertext blob (with version suffix).
type Encryptor func(plainText []byte) ([]byte, error)

// Decryptor decrypts a versioned ciphertext blob and returns the plaintext.
type Decryptor func(cipherTextBlob []byte) ([]byte, error)

// CipherPair holds matched encrypt/decrypt functions bound to a single data key.
type CipherPair struct {
	encrypt Encryptor
	decrypt Decryptor
}

// Encrypt encrypts plaintext using the bound data key.
func (c *CipherPair) Encrypt(plaintext []byte) ([]byte, error) {
	return c.encrypt(plaintext)
}

// Decrypt decrypts ciphertext using the bound data key.
func (c *CipherPair) Decrypt(ciphertext []byte) ([]byte, error) {
	return c.decrypt(ciphertext)
}

// HsmService defines the HSM operations needed by the KMS service.
// Pass nil when HSM is not configured.
type HsmService interface {
	IsActive() bool
	Encrypt(data []byte) ([]byte, error)
	Decrypt(blob []byte) ([]byte, error)
	RandomBytes(n int) ([]byte, error)
}

// ExternalKmsService defines external KMS operations (AWS, GCP).
// Pass nil when external KMS is not configured.
type ExternalKmsService interface {
	Encrypt(ctx context.Context, provider externalkms.ProviderType, config, plaintext []byte) ([]byte, error)
	Decrypt(ctx context.Context, provider externalkms.ProviderType, config, ciphertext []byte) ([]byte, error)
}

// Service manages the KMS key hierarchy:
//
//	ROOT_ENCRYPTION_KEY (in memory)
//	  → decrypts KMS key material (internal_kms.encrypted_key)
//	    → decrypts data key (org/project encrypted data key)
//	      → encrypts/decrypts secrets (via CipherPair)
type Service struct {
	mu                sync.RWMutex
	rootEncryptionKey []byte // loaded during Start(), protected by mu

	logger        *slog.Logger
	encryptionKey []byte             // decoded during Start(), used to decrypt root key
	db            pg.DB              // database operations
	hsm           HsmService         // nil when HSM is not configured
	externalKms   ExternalKmsService // nil when external KMS is not configured

	// Raw config values - decoded during Start() based on FIPS mode
	rawEncryptionKey     string
	rawRootEncryptionKey string
	fipsEnabledEnv       bool
}

// Deps holds the dependencies for the KMS shared service.
type Deps struct {
	DB          pg.DB
	HSM         HsmService         // nil when HSM is not configured
	ExternalKms ExternalKmsService // nil when external KMS is not configured
	Config      *config.Config
}

// NewService creates a new KMS service.
// The encryption key is decoded during Start() based on FIPS mode determination.
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) (*Service, error) {
	return &Service{
		logger:               logger.With(slog.String("service", "kms")),
		db:                   deps.DB,
		hsm:                  deps.HSM,
		externalKms:          deps.ExternalKms,
		rawEncryptionKey:     deps.Config.EncryptionKey,
		rawRootEncryptionKey: deps.Config.RootEncryptionKey,
		fipsEnabledEnv:       deps.Config.FipsEnabled,
	}, nil
}

// Start bootstraps the KMS root key. It must be called once during server startup
// before any calls to CreateCipherPairWithOrgDataKey or CreateCipherPairWithProjectDataKey.
//
// It atomically finds or creates the root config in the database (using a PG advisory lock),
// then decrypts the root key into memory.
func (s *Service) Start(ctx context.Context, hsmConfigured bool) error {
	strategy := StrategySoftware
	if hsmConfigured {
		strategy = StrategyHSM
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.resolveEncryptionKey(ctx); err != nil {
		return fmt.Errorf("KMS: resolving encryption key: %w", err)
	}

	rootConfig, err := s.findOrCreateRootConfig(ctx, hsmConfigured, strategy)
	if err != nil {
		return errutil.DatabaseErr("Failed to find or create KMS root config").WithErrf("Start: %w", err)
	}

	decryptedRootKey, err := s.decryptRootKey(rootConfig)
	if err != nil {
		return fmt.Errorf("KMS: decrypting root key: %w", err)
	}

	s.rootEncryptionKey = decryptedRootKey
	return nil
}

// Close zeroes the root encryption key from memory.
func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.rootEncryptionKey {
		s.rootEncryptionKey[i] = 0
	}
	s.rootEncryptionKey = nil
	for i := range s.encryptionKey {
		s.encryptionKey[i] = 0
	}
	s.encryptionKey = nil
}

// resolveEncryptionKey decodes the encryption key based on FIPS mode.
// ROOT_ENCRYPTION_KEY takes precedence and is always base64-encoded.
// ENCRYPTION_KEY is base64-encoded in FIPS mode, raw 32-char string otherwise.
func (s *Service) resolveEncryptionKey(ctx context.Context) error {
	if s.rawRootEncryptionKey != "" {
		decoded, err := base64.StdEncoding.DecodeString(s.rawRootEncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decode ROOT_ENCRYPTION_KEY from base64: %w", err)
		}
		s.encryptionKey = decoded
		return nil
	}

	fipsEnabled := false
	if s.fipsEnabledEnv {
		superAdminConfig, err := s.findSuperAdminConfig(ctx)
		if err != nil {
			return fmt.Errorf("failed to query super_admin config for FIPS mode: %w", err)
		}
		fipsEnabled = superAdminConfig != nil && superAdminConfig.FipsEnabled
	}

	if s.rawEncryptionKey == "" {
		return fmt.Errorf("ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY is required")
	}

	if fipsEnabled {
		decoded, err := base64.StdEncoding.DecodeString(s.rawEncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decode ENCRYPTION_KEY from base64 (FIPS mode): %w", err)
		}
		s.encryptionKey = decoded
	} else {
		s.encryptionKey = []byte(s.rawEncryptionKey)
	}
	return nil
}

// --- internal helpers ---

func (s *Service) getRootKey() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.rootEncryptionKey) == 0 {
		return nil
	}
	keyCopy := make([]byte, len(s.rootEncryptionKey))
	copy(keyCopy, s.rootEncryptionKey)
	return keyCopy
}

// --- KMS key material ---

// generateEncryptedKeyMaterial generates a random 32-byte key and encrypts it
// with the root key (no version suffix). Used as the callback for find-or-create methods.
func (s *Service) generateEncryptedKeyMaterial() ([]byte, error) {
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

// decryptInternalKmsKey loads a KMS key record and decrypts its key material using the root key.
// For internal KMS keys only. Returns error for external KMS keys.
func (s *Service) decryptInternalKmsKey(ctx context.Context, q pg.Querier, kmsKeyID uuid.UUID) ([]byte, error) {
	query := `
		SELECT
			kmsKey.id,
			internalKms.id AS internal_kms_id,
			internalKms."encryptedKey" AS internal_encrypted_key,
			internalKms."encryptionAlgorithm" AS internal_encryption_algorithm,
			externalKms.id AS external_kms_id
		FROM kms_keys kmsKey
		LEFT JOIN internal_kms internalKms ON internalKms."kmsKeyId" = kmsKey.id
		LEFT JOIN external_kms externalKms ON externalKms."kmsKeyId" = kmsKey.id
		WHERE kmsKey.id = @kmsKeyID
	`
	row := q.QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": kmsKeyID})

	var (
		id                          uuid.UUID
		internalKmsID               sql.Null[uuid.UUID]
		internalEncryptedKey        sql.Null[[]byte]
		internalEncryptionAlgorithm sql.Null[string]
		externalKmsID               sql.Null[uuid.UUID]
	)
	if err := row.Scan(&id, &internalKmsID, &internalEncryptedKey, &internalEncryptionAlgorithm, &externalKmsID); err != nil {
		return nil, errutil.DatabaseErr("Failed to find KMS key").WithErrf("decryptInternalKmsKey(kmsKeyId=%s): %w", kmsKeyID, err)
	}

	if externalKmsID.Valid {
		return nil, fmt.Errorf("KMS: cannot get key material for external KMS")
	}

	if !internalKmsID.Valid {
		return nil, fmt.Errorf("KMS: key %s has no internal or external KMS association", id.String())
	}

	rootKey := s.getRootKey()
	if len(rootKey) == 0 {
		return nil, fmt.Errorf("KMS: root encryption key not loaded, call Start first")
	}

	if internalEncryptionAlgorithm.V != "aes-256-gcm" {
		return nil, fmt.Errorf("KMS: unsupported encryption algorithm: %s", internalEncryptionAlgorithm.V)
	}

	return cipher.SymmetricDecrypt(internalEncryptedKey.V, rootKey)
}

// decryptWithKmsKey decrypts ciphertext using the specified KMS key.
// Handles both internal KMS (local decryption) and external KMS (AWS/GCP).
func (s *Service) decryptWithKmsKey(ctx context.Context, kmsKeyID uuid.UUID, ciphertext []byte, depth int) ([]byte, error) {
	if depth > 2 {
		return nil, fmt.Errorf("KMS: max recursion depth exceeded")
	}

	query := `
		SELECT
			kmsKey.id,
			kmsKey."orgId",
			internalKms."encryptedKey",
			internalKms."encryptionAlgorithm",
			externalKms.id AS external_kms_id,
			externalKms.provider,
			externalKms."encryptedProviderInputs"
		FROM kms_keys kmsKey
		LEFT JOIN internal_kms internalKms ON internalKms."kmsKeyId" = kmsKey.id
		LEFT JOIN external_kms externalKms ON externalKms."kmsKeyId" = kmsKey.id
		WHERE kmsKey.id = @kmsKeyID
	`
	row := s.db.Replica().QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": kmsKeyID})

	var (
		id                     uuid.UUID
		orgID                  uuid.UUID
		internalEncryptedKey   sql.Null[[]byte]
		internalEncAlgorithm   sql.Null[string]
		externalKmsID          sql.Null[uuid.UUID]
		externalProvider       sql.Null[string]
		externalEncryptedInput sql.Null[[]byte]
	)
	if err := row.Scan(&id, &orgID, &internalEncryptedKey, &internalEncAlgorithm, &externalKmsID, &externalProvider, &externalEncryptedInput); err != nil {
		return nil, errutil.DatabaseErr("Failed to find KMS key").WithErrf("decryptWithKmsKey(kmsKeyId=%s): %w", kmsKeyID, err)
	}

	// External KMS: decrypt config with org's data key, then call external provider
	if externalKmsID.Valid {
		if s.externalKms == nil {
			return nil, fmt.Errorf("KMS: external KMS service not configured")
		}

		org, err := s.findOrgKmsInfo(ctx, s.db.Replica(), orgID)
		if err != nil {
			return nil, fmt.Errorf("KMS: finding org for external KMS: %w", err)
		}
		if !org.KmsDefaultKeyID.Valid || len(org.KmsEncryptedDataKey) == 0 {
			return nil, fmt.Errorf("KMS: org has no default KMS key")
		}

		orgDataKey, err := s.decryptWithKmsKey(ctx, org.KmsDefaultKeyID.V, org.KmsEncryptedDataKey, depth+1)
		if err != nil {
			return nil, fmt.Errorf("KMS: decrypting org data key: %w", err)
		}

		decryptedConfig, err := decryptWithVersion(externalEncryptedInput.V, orgDataKey)
		if err != nil {
			return nil, fmt.Errorf("KMS: decrypting external KMS config: %w", err)
		}

		return s.externalKms.Decrypt(ctx, externalkms.ProviderType(externalProvider.V), decryptedConfig, ciphertext)
	}

	// Internal KMS: decrypt key material, then decrypt ciphertext locally
	if !internalEncryptedKey.Valid {
		return nil, fmt.Errorf("KMS: key %s has no internal or external KMS association", id.String())
	}

	rootKey := s.getRootKey()
	if len(rootKey) == 0 {
		return nil, fmt.Errorf("KMS: root encryption key not loaded")
	}

	if internalEncAlgorithm.V != "aes-256-gcm" {
		return nil, fmt.Errorf("KMS: unsupported encryption algorithm: %s", internalEncAlgorithm.V)
	}

	kmsKey, err := cipher.SymmetricDecrypt(internalEncryptedKey.V, rootKey)
	if err != nil {
		return nil, fmt.Errorf("KMS: decrypting internal key: %w", err)
	}

	return decryptWithVersion(ciphertext, kmsKey)
}

// --- Root key encrypt/decrypt ---

func (s *Service) encryptRootKey(plainKey []byte, strategy RootKeyEncryptionStrategy) ([]byte, error) {
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

func (s *Service) decryptRootKey(rootCfg *kmsRootConfigRow) ([]byte, error) {
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

// --- Row types ---

// superAdminConfigRow holds the fips-related fields from super_admin table.
type superAdminConfigRow struct {
	FipsEnabled bool `db:"fips_enabled"`
}

// kmsRootConfigRow holds the kms_root_config row.
type kmsRootConfigRow struct {
	ID                 uuid.UUID        `db:"id"`
	EncryptedRootKey   []byte           `db:"encrypted_root_key"`
	EncryptionStrategy sql.Null[string] `db:"encryption_strategy"`
}

// --- Query methods ---

// findSuperAdminConfig returns the super_admin config row if it exists.
func (s *Service) findSuperAdminConfig(ctx context.Context) (*superAdminConfigRow, error) {
	query := `SELECT "fipsEnabled" FROM super_admin WHERE id = @id`
	args := pgx.NamedArgs{"id": superAdminConfigUUID}

	row := s.db.Replica().QueryRow(ctx, query, args)
	var cfg superAdminConfigRow
	err := row.Scan(&cfg.FipsEnabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("finding super_admin config: %w", err)
	}
	return &cfg, nil
}

func (s *Service) findOrCreateRootConfig(ctx context.Context, hsmConfigured bool, strategy RootKeyEncryptionStrategy) (*kmsRootConfigRow, error) {
	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is no-op after commit

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", PgLockKmsRootKeyInit); err != nil {
		return nil, fmt.Errorf("acquiring advisory lock: %w", err)
	}

	query := `SELECT id, "encryptedRootKey", "encryptionStrategy" FROM kms_root_config WHERE id = @id`
	row := tx.QueryRow(ctx, query, pgx.NamedArgs{"id": KmsRootConfigUUID})

	var existing kmsRootConfigRow
	err = row.Scan(&existing.ID, &existing.EncryptedRootKey, &existing.EncryptionStrategy)
	if err == nil {
		if cerr := tx.Commit(ctx); cerr != nil {
			return nil, fmt.Errorf("committing root config read: %w", cerr)
		}
		return &existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("checking existing root config: %w", err)
	}

	// Generate new root key
	var newRootKey []byte
	if hsmConfigured && s.hsm != nil {
		newRootKey, err = s.hsm.RandomBytes(32)
		if err != nil {
			return nil, fmt.Errorf("generating root key with HSM: %w", err)
		}
	} else {
		newRootKey = make([]byte, 32)
		if _, err := rand.Read(newRootKey); err != nil {
			return nil, fmt.Errorf("generating root key: %w", err)
		}
	}

	encryptedRootKey, err := s.encryptRootKey(newRootKey, strategy)
	if err != nil {
		return nil, fmt.Errorf("encrypting new root key: %w", err)
	}

	insertQuery := `
		INSERT INTO kms_root_config (id, "encryptedRootKey", "encryptionStrategy")
		VALUES (@id, @encryptedRootKey, @encryptionStrategy)
		RETURNING id, "encryptedRootKey", "encryptionStrategy"
	`
	insertArgs := pgx.NamedArgs{
		"id":                 KmsRootConfigUUID,
		"encryptedRootKey":   encryptedRootKey,
		"encryptionStrategy": string(strategy),
	}

	var result kmsRootConfigRow
	if err := tx.QueryRow(ctx, insertQuery, insertArgs).Scan(&result.ID, &result.EncryptedRootKey, &result.EncryptionStrategy); err != nil {
		return nil, fmt.Errorf("creating root config: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}

	return &result, nil
}

// createKmsKeyWithInternal inserts a kms_keys row and its internal_kms material within a transaction.
func (s *Service) createKmsKeyWithInternal(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, encryptedKey []byte) (uuid.UUID, error) {
	keyName := generateRandomKeyName()

	// Insert kms_keys
	insertKeyQuery := `
		INSERT INTO kms_keys (name, "orgId", "isReserved", "keyUsage")
		VALUES (@name, @orgID, true, 'encrypt-decrypt')
		RETURNING id
	`
	keyArgs := pgx.NamedArgs{
		"name":  keyName,
		"orgID": orgID,
	}

	var kmsKeyID uuid.UUID
	err := tx.QueryRow(ctx, insertKeyQuery, keyArgs).Scan(&kmsKeyID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("inserting kms_keys: %w", err)
	}

	// Insert internal_kms
	insertInternalQuery := `
		INSERT INTO internal_kms ("encryptedKey", "encryptionAlgorithm", version, "kmsKeyId")
		VALUES (@encryptedKey, 'aes-256-gcm', 1, @kmsKeyID)
	`
	internalArgs := pgx.NamedArgs{
		"encryptedKey": encryptedKey,
		"kmsKeyID":     kmsKeyID,
	}

	if _, err := tx.Exec(ctx, insertInternalQuery, internalArgs); err != nil {
		return uuid.Nil, fmt.Errorf("inserting internal_kms: %w", err)
	}

	return kmsKeyID, nil
}
