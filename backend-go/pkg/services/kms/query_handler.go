package kms

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
