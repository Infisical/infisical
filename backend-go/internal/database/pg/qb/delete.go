package qb

import (
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

type DeleteBuilder struct {
	table     string
	where     []string
	args      pgx.NamedArgs
	returning string
}

func Delete(table string) *DeleteBuilder {
	return &DeleteBuilder{
		table: table,
		args:  pgx.NamedArgs{},
	}
}

func (b *DeleteBuilder) Where(clause, argName string, argValue any) *DeleteBuilder {
	b.where = append(b.where, clause)
	if argName != "" {
		b.args[argName] = argValue
	}
	return b
}

func (b *DeleteBuilder) WhereIf(condition bool, clause, argName string, argValue any) *DeleteBuilder {
	if condition {
		return b.Where(clause, argName, argValue)
	}
	return b
}

func (b *DeleteBuilder) WhereClause(clause string) *DeleteBuilder {
	b.where = append(b.where, clause)
	return b
}

func (b *DeleteBuilder) Returning(cols string) *DeleteBuilder {
	b.returning = cols
	return b
}

func (b *DeleteBuilder) Build() (string, pgx.NamedArgs) {
	query := fmt.Sprintf("DELETE FROM %s", b.table)

	if len(b.where) > 0 {
		query += " WHERE " + strings.Join(b.where, " AND ")
	}

	if b.returning != "" {
		query += " RETURNING " + b.returning
	}

	return query, b.args
}
