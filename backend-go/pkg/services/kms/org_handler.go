package kms

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/database/pg"
	"github.com/jackc/pgx/v5"
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
