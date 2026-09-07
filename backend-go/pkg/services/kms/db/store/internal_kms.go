// internal_kms_store.go

package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CreateInternalKMSParams struct {
	Version             int
	EncryptedKey        []byte
	EncryptionAlgorithm string
	KMSKeyID            uuid.UUID
}

type CreateInternalKMSResult struct {
	ID uuid.UUID
}

type InternalKMSStore interface {
	Create(
		ctx context.Context,
		params *CreateInternalKMSParams,
		tx pgx.Tx,
	) (CreateInternalKMSResult, error)
}

type internalKMSStore struct{}

func NewInternalKMSStore() InternalKMSStore {
	return &internalKMSStore{}
}

func (*internalKMSStore) Create(
	ctx context.Context,
	params *CreateInternalKMSParams,
	tx pgx.Tx,
) (CreateInternalKMSResult, error) {
	const query = `
		INSERT INTO internal_kms (
			version,
			"encryptedKey",
			"encryptionAlgorithm",
			"kmsKeyId"
		)
		VALUES (
			@version,
			@encryptedKey,
			@encryptionAlgorithm,
			@kmsKeyID
		)
		RETURNING id
	`

	args := pgx.NamedArgs{
		"version":             params.Version,
		"encryptedKey":        params.EncryptedKey,
		"encryptionAlgorithm": params.EncryptionAlgorithm,
		"kmsKeyID":            params.KMSKeyID,
	}

	var result CreateInternalKMSResult

	if err := tx.QueryRow(ctx, query, args).Scan(&result.ID); err != nil {
		return CreateInternalKMSResult{}, fmt.Errorf(
			"creating internal kms key material: %w",
			err,
		)
	}

	return result, nil
}
