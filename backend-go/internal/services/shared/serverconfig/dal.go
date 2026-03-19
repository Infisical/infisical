package serverconfig

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/infisical/api/internal/database/ormify"
	"github.com/infisical/api/internal/database/pg/gen/model"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

// DAL handles all database operations for the super_admin config table.
type DAL struct {
	*ormify.DAL[model.SuperAdmin]
	db *sql.DB
}

// NewDAL creates a new server config DAL.
func NewDAL(primary, replica qrm.DB, db *sql.DB) *DAL {
	return &DAL{
		DAL: ormify.New[model.SuperAdmin](primary, replica, ormify.TableDef{
			Table:          table.SuperAdmin,
			AllColumns:     table.SuperAdmin.AllColumns,
			MutableColumns: table.SuperAdmin.MutableColumns,
			IDColumn:       table.SuperAdmin.ID,
		}),
		db: db,
	}
}

// FindOrCreateConfig atomically ensures the config row exists.
// It acquires a PG advisory lock, checks for an existing row, and creates one if missing.
// The entire operation runs in a single transaction — no tx is exposed to callers.
func (d *DAL) FindOrCreateConfig(ctx context.Context) (*model.SuperAdmin, error) {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}

	// Acquire advisory lock to prevent concurrent init.
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", PgLockSuperAdminInit); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("acquiring advisory lock: %w", err)
	}

	// Check if config already exists.
	txDAL := d.WithTx(tx)
	cfg, err := txDAL.FindByID(ctx, AdminConfigDBUUID)
	if err == nil {
		tx.Commit()
		return cfg, nil
	}
	if err != qrm.ErrNoRows {
		tx.Rollback()
		return nil, fmt.Errorf("checking existing config: %w", err)
	}

	// Create the initial config row (ID is not in MutableColumns, so we use a custom insert).
	var result model.SuperAdmin
	err = table.SuperAdmin.
		INSERT(table.SuperAdmin.ID, table.SuperAdmin.Initialized, table.SuperAdmin.AllowSignUp, table.SuperAdmin.FipsEnabled).
		VALUES(postgres.String(AdminConfigDBUUID), postgres.Bool(false), postgres.Bool(true), postgres.Bool(false)).
		RETURNING(table.SuperAdmin.AllColumns).
		QueryContext(ctx, tx, &result)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("creating initial config: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("committing init transaction: %w", err)
	}

	return &result, nil
}
