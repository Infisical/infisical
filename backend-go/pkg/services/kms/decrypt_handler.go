package kms

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/ee/services/externalkms"
	"github.com/infisical/api/internal/libs/crypto/cipher"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/jackc/pgx/v5"
)

// decryptInternalKmsKey loads a KMS key record and decrypts its key material using the root key.
// For internal KMS keys only. Returns error for external KMS keys.
func (s *Service) decryptInternalKmsKey(ctx context.Context, kmsKeyID uuid.UUID) ([]byte, error) {
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
	row := s.db.Replica().QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": kmsKeyID})

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

// decryptWithVersion strips the "v01" version suffix and decrypts with AES-GCM-256.
func decryptWithVersion(blob, key []byte) ([]byte, error) {
	if len(blob) < KMSVersionBlobLength {
		return nil, fmt.Errorf("KMS: encrypted blob too short")
	}
	ciphertext := blob[:len(blob)-KMSVersionBlobLength]
	return cipher.SymmetricDecrypt(ciphertext, key)
}
