package kms

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/pglock"
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

// CreateCipherPairDTO selects which data key to use.
type CreateCipherPairDTO struct {
	Type      DataKeyType
	ProjectID string    // required when Type == DataKeyProject
	OrgID     uuid.UUID // required when Type == DataKeyOrganization
}

// HsmService defines the HSM operations needed by the KMS service.
// Pass nil when HSM is not configured.
type HsmService interface {
	IsActive() bool
	Encrypt(data []byte) ([]byte, error)
	Decrypt(blob []byte) ([]byte, error)
	RandomBytes(n int) ([]byte, error)
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

	encryptionKey []byte     // decoded during Start(), used to decrypt root key
	db            pg.DB      // database operations
	hsm           HsmService // nil when HSM is not configured

	// Raw config values - decoded during Start() based on FIPS mode
	rawEncryptionKey     string
	rawRootEncryptionKey string
	fipsEnabledEnv       bool
}

// Deps holds the dependencies for the KMS shared service.
type Deps struct {
	DB     pg.DB
	HSM    HsmService // nil when HSM is not configured
	Config *config.Config
}

// NewService creates a new KMS service.
// The encryption key is decoded during Start() based on FIPS mode determination.
func NewService(deps *Deps) (*Service, error) {
	return &Service{
		db:                   deps.DB,
		hsm:                  deps.HSM,
		rawEncryptionKey:     deps.Config.EncryptionKey,
		rawRootEncryptionKey: deps.Config.RootEncryptionKey,
		fipsEnabledEnv:       deps.Config.FipsEnabled,
	}, nil
}

// Start bootstraps the KMS root key. It must be called once during server startup
// before any calls to CreateCipherPairWithDataKey.
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

	rootConfig, err := s.findOrCreateRootConfig(ctx, func() (encryptedRootKey []byte, encryptionStrategy string, err error) {
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

// CreateCipherPairWithDataKey returns an Encryptor/Decryptor pair bound to the
// data key for the given org or project. All blobs include a "v01" version suffix.
func (s *Service) CreateCipherPairWithDataKey(ctx context.Context, dto CreateCipherPairDTO) (*CipherPair, error) {
	dataKey, err := s.getDataKey(ctx, dto)
	if err != nil {
		return nil, err
	}

	return &CipherPair{
		encrypt: func(plainText []byte) ([]byte, error) {
			return encryptWithVersion(plainText, dataKey)
		},
		decrypt: func(cipherTextBlob []byte) ([]byte, error) {
			return decryptWithVersion(cipherTextBlob, dataKey)
		},
	}, nil
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

func (s *Service) getDataKey(ctx context.Context, dto CreateCipherPairDTO) ([]byte, error) {
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

// decryptKmsKey loads a KMS key record and decrypts its key material using the root key.
// For internal KMS keys, decrypts locally. External KMS keys are not yet supported.
func (s *Service) decryptKmsKey(ctx context.Context, kmsKeyID uuid.UUID) ([]byte, error) {
	kmsKeyDoc, err := s.findKmsKeyByID(ctx, kmsKeyID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find KMS key").WithErrf("decryptKmsKey(kmsKeyId=%s): %w", kmsKeyID, err)
	}
	return s.decryptKmsKeyMaterial(kmsKeyDoc)
}

// decryptKmsKeyMaterial decrypts the key material from a kmsKeyWithAssociatedKms record.
// Branches on internal (local AES-GCM) vs external (cloud provider — not yet implemented).
func (s *Service) decryptKmsKeyMaterial(kmsKeyDoc *kmsKeyWithAssociatedKms) ([]byte, error) {
	// TODO(go): fix this before mileston
	if kmsKeyDoc.ExternalKmsID.Valid {
		panic("external KMS not implemented")
	}

	if !kmsKeyDoc.InternalKmsID.Valid {
		return nil, fmt.Errorf("KMS: key %s has no internal or external KMS association", kmsKeyDoc.ID.String())
	}

	rootKey := s.getRootKey()
	if len(rootKey) == 0 {
		return nil, fmt.Errorf("KMS: root encryption key not loaded, call Start first")
	}

	if kmsKeyDoc.InternalEncryptionAlgorithm.V != "aes-256-gcm" {
		return nil, fmt.Errorf("KMS: unsupported encryption algorithm: %s", kmsKeyDoc.InternalEncryptionAlgorithm.V)
	}

	// internal_kms.encrypted_key is AES-GCM encrypted with ROOT_KEY (no version suffix).
	return cipher.SymmetricDecrypt(kmsKeyDoc.InternalEncryptedKey.V, rootKey)
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

// kmsKeyWithAssociatedKms is the join result of kms_keys LEFT JOIN internal_kms LEFT JOIN external_kms.
type kmsKeyWithAssociatedKms struct {
	ID   uuid.UUID `db:"id"`
	Name string    `db:"name"`

	// Internal KMS fields (nullable from LEFT JOIN)
	InternalKmsID               sql.Null[uuid.UUID] `db:"internal_kms_id"`
	InternalEncryptedKey        sql.Null[[]byte]    `db:"internal_encrypted_key"`
	InternalEncryptionAlgorithm sql.Null[string]    `db:"internal_encryption_algorithm"`

	// External KMS fields (nullable from LEFT JOIN)
	ExternalKmsID sql.Null[uuid.UUID] `db:"external_kms_id"`
}

// orgKmsInfo holds the narrow org fields needed by the KMS service.
type orgKmsInfo struct {
	ID                  uuid.UUID           `db:"id"`
	KmsDefaultKeyID     sql.Null[uuid.UUID] `db:"kms_default_key_id"`
	KmsEncryptedDataKey []byte              `db:"kms_encrypted_data_key"`
}

// projectKmsInfo holds the narrow project fields needed by the KMS service.
type projectKmsInfo struct {
	ID                               string              `db:"id"`
	OrgID                            uuid.UUID           `db:"org_id"`
	KmsSecretManagerKeyID            sql.Null[uuid.UUID] `db:"kms_secret_manager_key_id"`
	KmsSecretManagerEncryptedDataKey []byte              `db:"kms_secret_manager_encrypted_data_key"`
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

// findOrCreateRootConfig atomically ensures the KMS root config row exists.
func (s *Service) findOrCreateRootConfig(ctx context.Context, createFn func() (encryptedRootKey []byte, encryptionStrategy string, err error)) (*kmsRootConfigRow, error) {
	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback on defer is best-effort cleanup

	// Acquire advisory lock
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", PgLockKmsRootKeyInit); err != nil {
		return nil, fmt.Errorf("acquiring advisory lock: %w", err)
	}

	// Check if root config already exists.
	checkQuery := `SELECT id, "encryptedRootKey", "encryptionStrategy" FROM kms_root_config WHERE id = @id`
	checkArgs := pgx.NamedArgs{"id": KmsRootConfigUUID}

	row := tx.QueryRow(ctx, checkQuery, checkArgs)
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

	// Config doesn't exist — invoke callback to generate the new root key.
	encryptionRootKey, encryptionStrategy, err := createFn()
	if err != nil {
		return nil, fmt.Errorf("generating root config: %w", err)
	}

	// Create the initial root config row.
	insertQuery := `
		INSERT INTO kms_root_config (id, "encryptedRootKey", "encryptionStrategy")
		VALUES (@id, @encryptedRootKey, @encryptionStrategy)
		RETURNING id, "encryptedRootKey", "encryptionStrategy"
	`
	insertArgs := pgx.NamedArgs{
		"id":                 KmsRootConfigUUID,
		"encryptedRootKey":   encryptionRootKey,
		"encryptionStrategy": encryptionStrategy,
	}

	var result kmsRootConfigRow
	err = tx.QueryRow(ctx, insertQuery, insertArgs).Scan(&result.ID, &result.EncryptedRootKey, &result.EncryptionStrategy)
	if err != nil {
		return nil, fmt.Errorf("creating root config: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}

	return &result, nil
}

// findKmsKeyByID loads a kms_keys row with its associated internal or external KMS material.
func (s *Service) findKmsKeyByID(ctx context.Context, kmsKeyID uuid.UUID) (*kmsKeyWithAssociatedKms, error) {
	query := `
		SELECT
			kmsKey.id,
			kmsKey.name,
			internalKms.id AS internal_kms_id,
			internalKms."encryptedKey" AS internal_encrypted_key,
			internalKms."encryptionAlgorithm" AS internal_encryption_algorithm,
			externalKms.id AS external_kms_id
		FROM kms_keys kmsKey
		LEFT JOIN internal_kms internalKms ON internalKms."kmsKeyId" = kmsKey.id
		LEFT JOIN external_kms externalKms ON externalKms."kmsKeyId" = kmsKey.id
		WHERE kmsKey.id = @kmsKeyID
	`
	args := pgx.NamedArgs{"kmsKeyID": kmsKeyID}

	row := s.db.Replica().QueryRow(ctx, query, args)
	var result kmsKeyWithAssociatedKms
	err := row.Scan(
		&result.ID,
		&result.Name,
		&result.InternalKmsID,
		&result.InternalEncryptedKey,
		&result.InternalEncryptionAlgorithm,
		&result.ExternalKmsID,
	)
	if err != nil {
		return nil, fmt.Errorf("finding KMS key: %w", err)
	}
	return &result, nil
}

// findOrgKmsInfo returns the narrow org fields needed for KMS data key operations.
// Pass a pg.Querier (either *pgxpool.Pool or pgx.Tx).
func (s *Service) findOrgKmsInfo(ctx context.Context, q pg.Querier, orgID uuid.UUID) (*orgKmsInfo, error) {
	query := `
		SELECT id, "kmsDefaultKeyId", "kmsEncryptedDataKey"
		FROM organizations
		WHERE id = @orgID
	`
	args := pgx.NamedArgs{"orgID": orgID}

	row := q.QueryRow(ctx, query, args)
	var result orgKmsInfo
	err := row.Scan(&result.ID, &result.KmsDefaultKeyID, &result.KmsEncryptedDataKey)
	if err != nil {
		return nil, fmt.Errorf("finding org KMS info: %w", err)
	}
	return &result, nil
}

// findProjectKmsInfo returns the narrow project fields needed for KMS data key operations.
// Pass a pg.Querier (either *pgxpool.Pool or pgx.Tx).
func (s *Service) findProjectKmsInfo(ctx context.Context, q pg.Querier, projectID string) (*projectKmsInfo, error) {
	query := `
		SELECT id, "orgId", "kmsSecretManagerKeyId", "kmsSecretManagerEncryptedDataKey"
		FROM projects
		WHERE id = @projectID
	`
	args := pgx.NamedArgs{"projectID": projectID}

	row := q.QueryRow(ctx, query, args)
	var result projectKmsInfo
	err := row.Scan(&result.ID, &result.OrgID, &result.KmsSecretManagerKeyID, &result.KmsSecretManagerEncryptedDataKey)
	if err != nil {
		return nil, fmt.Errorf("finding project KMS info: %w", err)
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

// findOrCreateOrgKmsKey atomically ensures the org has a default KMS key.
func (s *Service) findOrCreateOrgKmsKey(ctx context.Context, orgID uuid.UUID, createFn func() (encryptedKey []byte, err error)) (uuid.UUID, error) {
	lockID := fmt.Sprintf("kms-org-key:%s", orgID)

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("beginning transaction: %w", err)
	}

	lock, err := pglock.AcquireBlockingLock(ctx, tx, lockID)
	if err != nil {
		tx.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("acquiring org key lock: %w", err)
	}

	// Re-check after lock — another request may have created it.
	org, err := s.findOrgKmsInfo(ctx, tx, orgID)
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("finding org: %w", err)
	}
	if org.KmsDefaultKeyID.Valid {
		if err := lock.Release(ctx); err != nil {
			return uuid.Nil, err
		}
		return org.KmsDefaultKeyID.V, nil
	}

	encryptedKey, err := createFn()
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("generating KMS key: %w", err)
	}

	createdID, err := s.createKmsKeyWithInternal(ctx, tx, org.ID, encryptedKey)
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, err
	}

	// Update org with new key ID
	updateQuery := `UPDATE organizations SET "kmsDefaultKeyId" = @keyID WHERE id = @orgID`
	updateArgs := pgx.NamedArgs{"keyID": createdID, "orgID": orgID}
	if _, err := tx.Exec(ctx, updateQuery, updateArgs); err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("updating org default key: %w", err)
	}

	if err := lock.Release(ctx); err != nil {
		return uuid.Nil, err
	}
	return createdID, nil
}

// findOrCreateOrgDataKey atomically ensures the org has an encrypted data key.
func (s *Service) findOrCreateOrgDataKey(ctx context.Context, orgID uuid.UUID, createFn func() (encryptedDataKey []byte, err error)) ([]byte, error) {
	lockID := fmt.Sprintf("kms-org-data-key:%s", orgID)

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}

	lock, err := pglock.AcquireBlockingLock(ctx, tx, lockID)
	if err != nil {
		tx.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("acquiring org data key lock: %w", err)
	}

	// Re-check after lock — another request may have created it.
	org, err := s.findOrgKmsInfo(ctx, tx, orgID)
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("finding org: %w", err)
	}
	if len(org.KmsEncryptedDataKey) > 0 {
		if err := lock.Release(ctx); err != nil {
			return nil, err
		}
		return org.KmsEncryptedDataKey, nil
	}

	encryptedDataKey, err := createFn()
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("generating data key: %w", err)
	}

	updateQuery := `UPDATE organizations SET "kmsEncryptedDataKey" = @dataKey WHERE id = @orgID`
	updateArgs := pgx.NamedArgs{"dataKey": encryptedDataKey, "orgID": orgID}
	if _, err := tx.Exec(ctx, updateQuery, updateArgs); err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("setting org encrypted data key: %w", err)
	}

	if err := lock.Release(ctx); err != nil {
		return nil, err
	}
	return encryptedDataKey, nil
}

// findOrCreateProjectKmsKey atomically ensures the project has a secret manager KMS key.
func (s *Service) findOrCreateProjectKmsKey(ctx context.Context, projectID string, createFn func() (encryptedKey []byte, err error)) (uuid.UUID, error) {
	lockID := fmt.Sprintf("kms-project-key:%s", projectID)

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("beginning transaction: %w", err)
	}

	lock, err := pglock.AcquireBlockingLock(ctx, tx, lockID)
	if err != nil {
		tx.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("acquiring project key lock: %w", err)
	}

	// Re-check after lock — another request may have created it.
	project, err := s.findProjectKmsInfo(ctx, tx, projectID)
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("finding project: %w", err)
	}
	if project.KmsSecretManagerKeyID.Valid {
		if err := lock.Release(ctx); err != nil {
			return uuid.Nil, err
		}
		return project.KmsSecretManagerKeyID.V, nil
	}

	encryptedKey, err := createFn()
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("generating KMS key: %w", err)
	}

	createdID, err := s.createKmsKeyWithInternal(ctx, tx, project.OrgID, encryptedKey)
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, err
	}

	updateQuery := `UPDATE projects SET "kmsSecretManagerKeyId" = @keyID WHERE id = @projectID`
	updateArgs := pgx.NamedArgs{"keyID": createdID, "projectID": projectID}
	if _, err := tx.Exec(ctx, updateQuery, updateArgs); err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return uuid.Nil, fmt.Errorf("updating project KMS key: %w", err)
	}

	if err := lock.Release(ctx); err != nil {
		return uuid.Nil, err
	}
	return createdID, nil
}

// findOrCreateProjectDataKey atomically ensures the project has an encrypted data key.
func (s *Service) findOrCreateProjectDataKey(ctx context.Context, projectID string, createFn func() (encryptedDataKey []byte, err error)) ([]byte, error) {
	lockID := fmt.Sprintf("kms-project-data-key:%s", projectID)

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}

	lock, err := pglock.AcquireBlockingLock(ctx, tx, lockID)
	if err != nil {
		tx.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("acquiring project data key lock: %w", err)
	}

	// Re-check after lock — another request may have created it.
	project, err := s.findProjectKmsInfo(ctx, tx, projectID)
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("finding project: %w", err)
	}
	if len(project.KmsSecretManagerEncryptedDataKey) > 0 {
		if err := lock.Release(ctx); err != nil {
			return nil, err
		}
		return project.KmsSecretManagerEncryptedDataKey, nil
	}

	encryptedDataKey, err := createFn()
	if err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("generating data key: %w", err)
	}

	updateQuery := `UPDATE projects SET "kmsSecretManagerEncryptedDataKey" = @dataKey WHERE id = @projectID`
	updateArgs := pgx.NamedArgs{"dataKey": encryptedDataKey, "projectID": projectID}
	if _, err := tx.Exec(ctx, updateQuery, updateArgs); err != nil {
		lock.Rollback(ctx) //nolint:errcheck // rollback on error is best-effort cleanup
		return nil, fmt.Errorf("setting project encrypted data key: %w", err)
	}

	if err := lock.Release(ctx); err != nil {
		return nil, err
	}
	return encryptedDataKey, nil
}
