package license

import (
	"context"
	"database/sql"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

type orgRow struct {
	ID         string         `alias:"organizations.id"`
	CustomerID sql.NullString `alias:"organizations.customerId"`
	RootOrgID  sql.NullString `alias:"organizations.rootOrgId"`
}

type DAL struct {
	db pg.DB
}

func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

// FindRootOrgDetails resolves the root org for the given orgID and returns its customer ID.
// If the org has a rootOrgId, the root org is returned instead.
func (d *DAL) FindRootOrgDetails(ctx context.Context, orgID string) (*orgRow, error) {
	o := table.Organizations

	// First fetch the org to check if it has a rootOrgId.
	stmt := postgres.SELECT(o.ID, o.CustomerId, o.RootOrgId).
		FROM(o).
		WHERE(o.ID.EQ(postgres.String(orgID)))

	var row orgRow
	err := stmt.QueryContext(ctx, d.db.Primary(), &row)
	if err != nil {
		if err == qrm.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// If the org has a root org, resolve it.
	if row.RootOrgID.Valid && row.RootOrgID.String != "" && row.RootOrgID.String != row.ID {
		rootStmt := postgres.SELECT(o.ID, o.CustomerId, o.RootOrgId).
			FROM(o).
			WHERE(o.ID.EQ(postgres.String(row.RootOrgID.String)))

		var rootRow orgRow
		err := rootStmt.QueryContext(ctx, d.db.Primary(), &rootRow)
		if err != nil {
			if err == qrm.ErrNoRows {
				return nil, nil
			}
			return nil, err
		}
		return &rootRow, nil
	}

	return &row, nil
}
