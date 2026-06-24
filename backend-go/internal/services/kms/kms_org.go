package kms

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/pglock"
	"github.com/infisical/api/internal/libs/crypto/cipher"
	"github.com/infisical/api/internal/libs/errutil"
)

type orgKmsInfo struct {
	ID                  uuid.UUID           `db:"id"`
	KmsDefaultKeyID     sql.Null[uuid.UUID] `db:"kms_default_key_id"`
	KmsEncryptedDataKey []byte              `db:"kms_encrypted_data_key"`
}

func (s *Service) findOrgKmsInfo(ctx context.Context, q pg.Querier, orgID uuid.UUID) (*orgKmsInfo, error) {
	query := `
		SELECT id, "kmsDefaultKeyId", "kmsEncryptedDataKey"
		FROM organizations
		WHERE id = @orgID
	`
	row := q.QueryRow(ctx, query, pgx.NamedArgs{"orgID": orgID})

	var result orgKmsInfo
	if err := row.Scan(&result.ID, &result.KmsDefaultKeyID, &result.KmsEncryptedDataKey); err != nil {
		return nil, fmt.Errorf("finding org KMS info: %w", err)
	}
	return &result, nil
}

func (s *Service) CreateCipherPairWithOrgDataKey(ctx context.Context, orgID uuid.UUID) (*CipherPair, error) {
	if orgID == uuid.Nil {
		return nil, fmt.Errorf("org ID is required")
	}

	dataKey, err := s.getOrgDataKey(ctx, orgID)
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

func (s *Service) getOrgDataKey(ctx context.Context, orgID uuid.UUID) ([]byte, error) {
	org, err := s.findOrgKmsInfo(ctx, s.db.Replica(), orgID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find organization KMS info").WithErrf("getOrgDataKey(orgId=%s): %w", orgID, err)
	}

	// Fast path: both KMS key and data key exist
	if org.KmsDefaultKeyID.Valid && len(org.KmsEncryptedDataKey) > 0 {
		// Use decryptWithKmsKey which handles both internal and external KMS
		return s.decryptWithKmsKey(ctx, org.KmsDefaultKeyID.V, org.KmsEncryptedDataKey, 0)
	}

	// Slow path: need to create KMS key and/or data key under lock
	return s.ensureOrgDataKey(ctx, orgID)
}

func (s *Service) ensureOrgDataKey(ctx context.Context, orgID uuid.UUID) (dataKey []byte, err error) {
	// TODO(go): Once Node.js is retired, consolidate to single lock "kms-org:{orgID}".
	// Currently using both locks to maintain compatibility with Node.js which uses separate locks.
	keyLockID := fmt.Sprintf("kms-org-key:%s", orgID)
	dataKeyLockID := fmt.Sprintf("kms-org-data-key:%s", orgID)

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	lock, err := pglock.AcquireBlockingLock(ctx, tx, keyLockID)
	if err != nil {
		return nil, fmt.Errorf("acquiring org key lock: %w", err)
	}

	if _, err := pglock.AcquireBlockingLock(ctx, lock.Tx(), dataKeyLockID); err != nil {
		return nil, fmt.Errorf("acquiring org data key lock: %w", err)
	}

	// Re-check after acquiring lock
	org, err := s.findOrgKmsInfo(ctx, tx, orgID)
	if err != nil {
		return nil, fmt.Errorf("finding org: %w", err)
	}

	var kmsKeyMaterial []byte

	// Ensure KMS key exists
	if !org.KmsDefaultKeyID.Valid {
		encryptedKeyMaterial, err := s.generateEncryptedKeyMaterial()
		if err != nil {
			return nil, fmt.Errorf("generating KMS key: %w", err)
		}

		createdID, err := s.createKmsKeyWithInternal(ctx, tx, org.ID, encryptedKeyMaterial)
		if err != nil {
			return nil, err
		}

		updateQuery := `UPDATE organizations SET "kmsDefaultKeyId" = @keyID WHERE id = @orgID`
		if _, err := tx.Exec(ctx, updateQuery, pgx.NamedArgs{"keyID": createdID, "orgID": orgID}); err != nil {
			return nil, fmt.Errorf("updating org default key: %w", err)
		}

		// Decrypt the key material we just created
		rootKey := s.getRootKey()
		if len(rootKey) == 0 {
			return nil, fmt.Errorf("KMS: root key not loaded")
		}
		kmsKeyMaterial, err = cipher.SymmetricDecrypt(encryptedKeyMaterial, rootKey)
		if err != nil {
			return nil, fmt.Errorf("decrypting KMS key: %w", err)
		}
	} else {
		kmsKeyMaterial, err = s.decryptInternalKmsKey(ctx, org.KmsDefaultKeyID.V)
		if err != nil {
			return nil, err
		}
	}

	// Ensure data key exists
	var encryptedDataKey []byte
	if len(org.KmsEncryptedDataKey) > 0 {
		encryptedDataKey = org.KmsEncryptedDataKey
	} else {
		plainDataKey := make([]byte, 32)
		if _, err := rand.Read(plainDataKey); err != nil {
			return nil, fmt.Errorf("generating data key: %w", err)
		}

		encryptedDataKey, err = encryptWithVersion(plainDataKey, kmsKeyMaterial)
		if err != nil {
			return nil, fmt.Errorf("encrypting data key: %w", err)
		}

		updateQuery := `UPDATE organizations SET "kmsEncryptedDataKey" = @dataKey WHERE id = @orgID`
		if _, err := tx.Exec(ctx, updateQuery, pgx.NamedArgs{"dataKey": encryptedDataKey, "orgID": orgID}); err != nil {
			return nil, fmt.Errorf("setting org encrypted data key: %w", err)
		}
	}

	if err := lock.Release(ctx); err != nil {
		return nil, err
	}

	return decryptWithVersion(encryptedDataKey, kmsKeyMaterial)
}
