package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/jackc/pgx/v5"
)

type CreateKeyParams struct {
	Name                string
	KeyUsage            string
	OrgID               uuid.UUID
	IsReserved          bool
	IsExportable        bool
	HasDeleteProtection bool
	ProjectID           *uuid.UUID
	Description         *string
}

type CreateKeyResult struct {
	ID        uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

type GetKeyResult struct {
	ID                          uuid.UUID
	OrgID                       uuid.UUID
	KeyUsage                    string
	InternalEncryptedKey        sql.Null[[]byte]
	InternalEncryptionAlgorithm sql.Null[string]
	ExternalKMSID               sql.Null[uuid.UUID]
	ExternalProvider            sql.Null[string]
	ExternalEncryptedInput      sql.Null[[]byte]
}

type KmsKeyMetaFieldsResult struct {
	ID                  uuid.UUID
	IsDisabled          sql.Null[bool]
	IsReserved          sql.Null[bool]
	OrgID               uuid.UUID
	ProjectID           sql.Null[uuid.UUID]
	KeyUsage            string
	IsExportable        bool
	HasDeleteProtection bool
}

type KMSStore interface {
	CreateKey(ctx context.Context, params *CreateKeyParams, tx pgx.Tx) (*CreateKeyResult, error)
	GetKey(ctx context.Context, keyID uuid.UUID) (*GetKeyResult, error)
	FindValidationFieldsById(ctx context.Context, keyID uuid.UUID) (*KmsKeyMetaFieldsResult, error)
	DeleteKeyById(ctx context.Context, keyID string, tx pgx.Tx) (bool, error, func())
}

/*
  
 */

func (s *kmsStore) FindValidationFieldsById(
	ctx context.Context,
	keyID uuid.UUID,
) (*KmsKeyMetaFieldsResult, error) {

	// try cache
	if s.kmsMetaCache != nil {
		value, ok := s.kmsMetaCache.Get(keyID)
		if ok {
			return value, nil
		}
	}

	const query = `
		SELECT
			id,
			"isDisabled",
			"isReserved",
			"orgId",
			"projectId",
			"keyUsage",
			"isExportable",
			"hasDeleteProtection"
		FROM kms_keys
		WHERE id = @kmsKeyID
	`

	var result KmsKeyMetaFieldsResult
	if err := s.db.Replica().QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": keyID}).Scan(
		&result.ID,
		&result.IsDisabled,
		&result.IsReserved,
		&result.OrgID,
		&result.ProjectID,
		&result.KeyUsage,
		&result.IsExportable,
		&result.HasDeleteProtection,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &KmsKeyMetaFieldsResult{}, errutil.NotFound("KMS key with ID %s not found", keyID)
		}
		return &KmsKeyMetaFieldsResult{}, errutil.DatabaseErr("Failed to find KMS key").WithErrf(
			"findValidationFieldsById(kmsKeyID=%s): %w",
			keyID,
			err,
		)
	}

	// update cache
	if s.kmsMetaCache != nil {
		s.kmsMetaCache.Add(keyID, &result)
	}

	return &result, nil
}

type kmsStore struct {
	db           pg.DB
	kmsMetaCache *KeyMetaCache
}

type KmsStoreOptions struct {
	KmsMetaCache *KeyMetaCache
}

func NewKMSStore(db pg.DB, opts *KmsStoreOptions) KMSStore {
	return &kmsStore{
		db:           db,
		kmsMetaCache: opts.KmsMetaCache,
	}
}

func (s *kmsStore) GetKey(ctx context.Context, keyID uuid.UUID) (*GetKeyResult, error) {
	// todo: request depulication , raft calls
	query := `
		SELECT
			kmsKey.id,
			kmsKey."orgId",
			kmsKey."keyUsage",
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
	row := s.db.Replica().QueryRow(ctx, query, pgx.NamedArgs{"kmsKeyID": keyID})

	var result GetKeyResult
	if err := row.Scan(
		&result.ID,
		&result.OrgID,
		&result.KeyUsage,
		&result.InternalEncryptedKey,
		&result.InternalEncryptionAlgorithm,
		&result.ExternalKMSID,
		&result.ExternalProvider,
		&result.ExternalEncryptedInput,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &GetKeyResult{}, errutil.NotFound("KMS key with ID %s not found", keyID)
		}
		return &GetKeyResult{}, errutil.DatabaseErr("Failed to find KMS key").WithErrf("getKey(kmsKeyID=%s): %w", keyID, err)
	}

	return &result, nil
}

func (s *kmsStore) CreateKey(
	ctx context.Context,
	params *CreateKeyParams,
	tx pgx.Tx,
) (*CreateKeyResult, error) {

	const insertKeyQuery = `
		INSERT INTO kms_keys (
			name,
			"keyUsage",
			"orgId",
			"isReserved",
			"isExportable",
			"hasDeleteProtection",
			"projectId",
			description
		)
		VALUES (
			@name,
			@keyUsage,
			@orgID,
			@isReserved,
			@isExportable,
			@hasDeleteProtection,
			@projectID,
			@description
		)
		RETURNING id, "createdAt", "updatedAt"
	`

	keyArgs := pgx.NamedArgs{
		"name":                params.Name,
		"keyUsage":            params.KeyUsage,
		"orgID":               params.OrgID,
		"isReserved":          params.IsReserved,
		"isExportable":        params.IsExportable,
		"hasDeleteProtection": params.HasDeleteProtection,
		"projectID":           params.ProjectID,
		"description":         params.Description,
	}

	var result CreateKeyResult

	if err := tx.QueryRow(ctx, insertKeyQuery, keyArgs).Scan(&result.ID, &result.CreatedAt, &result.UpdatedAt); err != nil {
		return &CreateKeyResult{}, fmt.Errorf("inserting kms_keys: %w", err)
	}

	return &result, nil
}

func (s *kmsStore) DeleteKeyById(
	ctx context.Context,
	keyID string,
	tx pgx.Tx,
) (success bool, err error, onCommit func()) {

	const query = `
		DELETE FROM kms_keys
		WHERE id = @kmsKeyID
	`

	result, err := tx.Exec(ctx, query, pgx.NamedArgs{"kmsKeyID": keyID})

	if err != nil {
		return false, fmt.Errorf("deleting kms_keys(kmsKeyID=%s): %w", keyID, err), onCommit
	}

	if s.kmsMetaCache != nil {
		onCommit = func() {
			// evict from cache
			s.kmsMetaCache.Remove(uuid.MustParse(keyID))
		}
	}

	return result.RowsAffected() > 0, nil, onCommit
}
