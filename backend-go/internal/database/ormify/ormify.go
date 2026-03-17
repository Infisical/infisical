package ormify

import (
	"context"
	"database/sql"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
)

// TableDef holds go-jet table metadata needed for generic CRUD operations.
type TableDef struct {
	Table          postgres.Table
	AllColumns     postgres.ColumnList
	MutableColumns postgres.ColumnList
	IDColumn       postgres.ColumnString
}

type findConfig struct {
	limit   *int64
	offset  *int64
	orderBy []postgres.OrderByClause
}

// FindOpt configures a Find query.
type FindOpt func(*findConfig)

// WithLimit sets the maximum number of rows to return.
func WithLimit(n int64) FindOpt {
	return func(c *findConfig) { c.limit = &n }
}

// WithOffset sets the number of rows to skip.
func WithOffset(n int64) FindOpt {
	return func(c *findConfig) { c.offset = &n }
}

// WithOrderBy adds ORDER BY clauses.
// Usage: WithOrderBy(table.Projects.CreatedAt.DESC(), table.Projects.Name.ASC())
func WithOrderBy(clauses ...postgres.OrderByClause) FindOpt {
	return func(c *findConfig) {
		c.orderBy = append(c.orderBy, clauses...)
	}
}

// DAL provides generic CRUD operations for model type M backed by go-jet.
type DAL[M any] struct {
	primary qrm.DB
	replica qrm.DB
	def     TableDef
}

// New creates a DAL for the given table definition.
// primary is used for writes, replica for reads.
// If replica is nil, primary is used for both.
func New[M any](primary, replica qrm.DB, def TableDef) *DAL[M] {
	if replica == nil {
		replica = primary
	}
	return &DAL[M]{primary: primary, replica: replica, def: def}
}

// WithTx returns a new DAL that executes all operations within the given transaction.
func (d *DAL[M]) WithTx(tx *sql.Tx) *DAL[M] {
	return &DAL[M]{primary: tx, replica: tx, def: d.def}
}

// FindByID returns a single row by its primary key.
func (d *DAL[M]) FindByID(ctx context.Context, id string) (*M, error) {
	stmt := d.def.Table.
		SELECT(d.def.AllColumns).
		WHERE(d.def.IDColumn.EQ(postgres.String(id)))

	var result M
	err := stmt.QueryContext(ctx, d.replica, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// FindOne returns the first row matching the condition.
func (d *DAL[M]) FindOne(ctx context.Context, condition postgres.BoolExpression) (*M, error) {
	stmt := d.def.Table.
		SELECT(d.def.AllColumns).
		WHERE(condition).
		LIMIT(1)

	var result M
	err := stmt.QueryContext(ctx, d.replica, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// Find returns all rows matching the condition with optional limit, offset, and sort.
func (d *DAL[M]) Find(ctx context.Context, condition postgres.BoolExpression, opts ...FindOpt) ([]M, error) {
	cfg := &findConfig{}
	for _, o := range opts {
		o(cfg)
	}

	stmt := d.def.Table.
		SELECT(d.def.AllColumns).
		WHERE(condition)

	if len(cfg.orderBy) > 0 {
		stmt = stmt.ORDER_BY(cfg.orderBy...)
	}

	if cfg.limit != nil {
		stmt = stmt.LIMIT(*cfg.limit)
	}
	if cfg.offset != nil {
		stmt = stmt.OFFSET(*cfg.offset)
	}

	var results []M
	err := stmt.QueryContext(ctx, d.replica, &results)
	if err != nil {
		if err == qrm.ErrNoRows {
			return []M{}, nil
		}
		return nil, err
	}
	return results, nil
}

// FindAll returns all rows in the table with optional limit, offset, and sort.
func (d *DAL[M]) FindAll(ctx context.Context, opts ...FindOpt) ([]M, error) {
	cfg := &findConfig{}
	for _, o := range opts {
		o(cfg)
	}

	stmt := d.def.Table.SELECT(d.def.AllColumns)

	if len(cfg.orderBy) > 0 {
		stmt = stmt.ORDER_BY(cfg.orderBy...)
	}

	if cfg.limit != nil {
		stmt = stmt.LIMIT(*cfg.limit)
	}
	if cfg.offset != nil {
		stmt = stmt.OFFSET(*cfg.offset)
	}

	var results []M
	err := stmt.QueryContext(ctx, d.replica, &results)
	if err != nil {
		if err == qrm.ErrNoRows {
			return []M{}, nil
		}
		return nil, err
	}
	return results, nil
}

// Create inserts a single row and returns the created record.
func (d *DAL[M]) Create(ctx context.Context, data *M) (*M, error) {
	stmt := d.def.Table.
		INSERT(d.def.MutableColumns).
		MODEL(data).
		RETURNING(d.def.AllColumns)

	var result M
	err := stmt.QueryContext(ctx, d.primary, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// InsertMany inserts multiple rows and returns the created records.
func (d *DAL[M]) InsertMany(ctx context.Context, data []M) ([]M, error) {
	if len(data) == 0 {
		return []M{}, nil
	}

	stmt := d.def.Table.
		INSERT(d.def.MutableColumns).
		MODELS(data).
		RETURNING(d.def.AllColumns)

	var results []M
	err := stmt.QueryContext(ctx, d.primary, &results)
	if err != nil {
		return nil, err
	}
	return results, nil
}

// UpdateByID updates a single row by primary key and returns the updated record.
// Pass the columns you want to update explicitly.
func (d *DAL[M]) UpdateByID(ctx context.Context, id string, columns postgres.ColumnList, data *M) (*M, error) {
	stmt := d.def.Table.
		UPDATE(columns).
		MODEL(data).
		WHERE(d.def.IDColumn.EQ(postgres.String(id))).
		RETURNING(d.def.AllColumns)

	var result M
	err := stmt.QueryContext(ctx, d.primary, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// Update updates rows matching the condition and returns the updated records.
// Pass the columns you want to update explicitly.
func (d *DAL[M]) Update(ctx context.Context, condition postgres.BoolExpression, columns postgres.ColumnList, data *M) ([]M, error) {
	stmt := d.def.Table.
		UPDATE(columns).
		MODEL(data).
		WHERE(condition).
		RETURNING(d.def.AllColumns)

	var results []M
	err := stmt.QueryContext(ctx, d.primary, &results)
	if err != nil {
		return nil, err
	}
	return results, nil
}

// DeleteByID deletes a single row by primary key and returns the deleted record.
func (d *DAL[M]) DeleteByID(ctx context.Context, id string) (*M, error) {
	stmt := d.def.Table.
		DELETE().
		WHERE(d.def.IDColumn.EQ(postgres.String(id))).
		RETURNING(d.def.AllColumns)

	var result M
	err := stmt.QueryContext(ctx, d.primary, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// Delete deletes rows matching the condition and returns the deleted records.
func (d *DAL[M]) Delete(ctx context.Context, condition postgres.BoolExpression) ([]M, error) {
	stmt := d.def.Table.
		DELETE().
		WHERE(condition).
		RETURNING(d.def.AllColumns)

	var results []M
	err := stmt.QueryContext(ctx, d.primary, &results)
	if err != nil {
		return nil, err
	}
	return results, nil
}

// Count returns the total number of rows in the table.
func (d *DAL[M]) Count(ctx context.Context) (int64, error) {
	stmt := d.def.Table.
		SELECT(postgres.COUNT(postgres.STAR))

	var dest struct {
		Count int64
	}
	err := stmt.QueryContext(ctx, d.replica, &dest)
	if err != nil {
		return 0, err
	}
	return dest.Count, nil
}
