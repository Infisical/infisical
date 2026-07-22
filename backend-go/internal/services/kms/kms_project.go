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

type projectKmsInfo struct {
	ID                               string              `db:"id"`
	OrgID                            uuid.UUID           `db:"org_id"`
	KmsSecretManagerKeyID            sql.Null[uuid.UUID] `db:"kms_secret_manager_key_id"`
	KmsSecretManagerEncryptedDataKey []byte              `db:"kms_secret_manager_encrypted_data_key"`
}

func (s *Service) findProjectKmsInfo(ctx context.Context, q pg.Querier, projectID string) (*projectKmsInfo, error) {
	query := `
		SELECT id, "orgId", "kmsSecretManagerKeyId", "kmsSecretManagerEncryptedDataKey"
		FROM projects
		WHERE id = @projectID
	`
	row := q.QueryRow(ctx, query, pgx.NamedArgs{"projectID": projectID})

	var result projectKmsInfo
	if err := row.Scan(&result.ID, &result.OrgID, &result.KmsSecretManagerKeyID, &result.KmsSecretManagerEncryptedDataKey); err != nil {
		return nil, fmt.Errorf("finding project KMS info: %w", err)
	}
	return &result, nil
}

func (s *Service) CreateCipherPairWithProjectDataKey(ctx context.Context, projectID string) (*CipherPair, error) {
	if projectID == "" {
		return nil, fmt.Errorf("project ID is required")
	}

	dataKey, err := s.getProjectDataKey(ctx, projectID)
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

func (s *Service) getProjectDataKey(ctx context.Context, projectID string) ([]byte, error) {
	project, err := s.findProjectKmsInfo(ctx, s.db.Replica(), projectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find project KMS info").WithErrf("getProjectDataKey(projectId=%s): %w", projectID, err)
	}

	// Fast path: both KMS key and data key exist
	if project.KmsSecretManagerKeyID.Valid && len(project.KmsSecretManagerEncryptedDataKey) > 0 {
		// Use decryptWithKmsKey which handles both internal and external KMS
		return s.decryptWithKmsKey(ctx, project.KmsSecretManagerKeyID.V, project.KmsSecretManagerEncryptedDataKey, 0)
	}

	// Slow path: need to create KMS key and/or data key under lock
	return s.ensureProjectDataKey(ctx, projectID)
}

func (s *Service) ensureProjectDataKey(ctx context.Context, projectID string) (dataKey []byte, err error) {
	// TODO(go): Once Node.js is retired, consolidate to single lock "kms-project:{projectID}".
	// Currently using both locks to maintain compatibility with Node.js which uses separate locks.
	keyLockID := fmt.Sprintf("kms-project-key:%s", projectID)
	dataKeyLockID := fmt.Sprintf("kms-project-data-key:%s", projectID)

	tx, err := s.db.Primary().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	lock, err := pglock.AcquireBlockingLock(ctx, tx, keyLockID)
	if err != nil {
		return nil, fmt.Errorf("acquiring project key lock: %w", err)
	}

	if _, err := pglock.AcquireBlockingLock(ctx, lock.Tx(), dataKeyLockID); err != nil {
		return nil, fmt.Errorf("acquiring project data key lock: %w", err)
	}

	// Re-check after acquiring lock
	project, err := s.findProjectKmsInfo(ctx, tx, projectID)
	if err != nil {
		return nil, fmt.Errorf("finding project: %w", err)
	}

	var kmsKeyMaterial []byte

	// Ensure KMS key exists
	if !project.KmsSecretManagerKeyID.Valid {
		encryptedKeyMaterial, err := s.generateEncryptedKeyMaterial()
		if err != nil {
			return nil, fmt.Errorf("generating KMS key: %w", err)
		}

		createdID, err := s.createKmsKeyWithInternal(ctx, tx, project.OrgID, encryptedKeyMaterial)
		if err != nil {
			return nil, err
		}

		updateQuery := `UPDATE projects SET "kmsSecretManagerKeyId" = @keyID WHERE id = @projectID`
		if _, err := tx.Exec(ctx, updateQuery, pgx.NamedArgs{"keyID": createdID, "projectID": projectID}); err != nil {
			return nil, fmt.Errorf("updating project KMS key: %w", err)
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
		kmsKeyMaterial, err = s.decryptInternalKmsKey(ctx, tx, project.KmsSecretManagerKeyID.V)
		if err != nil {
			return nil, err
		}
	}

	// Ensure data key exists
	var encryptedDataKey []byte
	if len(project.KmsSecretManagerEncryptedDataKey) > 0 {
		encryptedDataKey = project.KmsSecretManagerEncryptedDataKey
	} else {
		plainDataKey := make([]byte, 32)
		if _, err := rand.Read(plainDataKey); err != nil {
			return nil, fmt.Errorf("generating data key: %w", err)
		}

		encryptedDataKey, err = encryptWithVersion(plainDataKey, kmsKeyMaterial)
		if err != nil {
			return nil, fmt.Errorf("encrypting data key: %w", err)
		}

		updateQuery := `UPDATE projects SET "kmsSecretManagerEncryptedDataKey" = @dataKey WHERE id = @projectID`
		if _, err := tx.Exec(ctx, updateQuery, pgx.NamedArgs{"dataKey": encryptedDataKey, "projectID": projectID}); err != nil {
			return nil, fmt.Errorf("setting project encrypted data key: %w", err)
		}
	}

	if err := lock.Release(ctx); err != nil {
		return nil, err
	}

	return decryptWithVersion(encryptedDataKey, kmsKeyMaterial)
}
