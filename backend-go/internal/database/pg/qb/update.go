package qb

import (
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

type UpdateBuilder struct {
	table     string
	sets      []string
	where     []string
	args      pgx.NamedArgs
	returning string
}

func Update(table string) *UpdateBuilder {
	return &UpdateBuilder{
		table: table,
		args:  pgx.NamedArgs{},
	}
}

func (b *UpdateBuilder) Set(column string, value any) *UpdateBuilder {
	argName := toArgName(column)
	b.sets = append(b.sets, fmt.Sprintf("%s = @%s", column, argName))
	b.args[argName] = value
	return b
}

func (b *UpdateBuilder) SetIf(condition bool, column string, value any) *UpdateBuilder {
	if condition {
		return b.Set(column, value)
	}
	return b
}

func (b *UpdateBuilder) SetMap(values map[string]any) *UpdateBuilder {
	for column, value := range values {
		b.Set(column, value)
	}
	return b
}

func (b *UpdateBuilder) Where(clause, argName string, argValue any) *UpdateBuilder {
	b.where = append(b.where, clause)
	if argName != "" {
		b.args[argName] = argValue
	}
	return b
}

func (b *UpdateBuilder) WhereIf(condition bool, clause, argName string, argValue any) *UpdateBuilder {
	if condition {
		return b.Where(clause, argName, argValue)
	}
	return b
}

func (b *UpdateBuilder) WhereClause(clause string) *UpdateBuilder {
	b.where = append(b.where, clause)
	return b
}

func (b *UpdateBuilder) Returning(cols string) *UpdateBuilder {
	b.returning = cols
	return b
}

func (b *UpdateBuilder) Build() (string, pgx.NamedArgs) {
	if len(b.sets) == 0 {
		panic("qb.Update: no SET columns provided")
	}

	query := fmt.Sprintf(
		"UPDATE %s SET %s",
		b.table,
		strings.Join(b.sets, ", "),
	)

	if len(b.where) > 0 {
		query += " WHERE " + strings.Join(b.where, " AND ")
	}

	if b.returning != "" {
		query += " RETURNING " + b.returning
	}

	return query, b.args
}

func toArgName(column string) string {
	result := strings.Builder{}
	upperNext := false
	for i, r := range column {
		if r == '_' {
			upperNext = true
			continue
		}
		if upperNext && i > 0 {
			if r >= 'a' && r <= 'z' {
				r -= 32
			}
			upperNext = false
		}
		result.WriteRune(r)
	}
	return result.String()
}
