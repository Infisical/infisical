package qb

import (
	"fmt"
	"strings"
)

type InsertBuilder struct {
	table     string
	columns   []string
	values    [][]any
	returning string
}

func Insert(table string, columns ...string) *InsertBuilder {
	return &InsertBuilder{
		table:   table,
		columns: columns,
	}
}

func (b *InsertBuilder) Values(vals ...any) *InsertBuilder {
	if len(vals) != len(b.columns) {
		panic(fmt.Sprintf("qb.Insert: values count (%d) != columns count (%d)", len(vals), len(b.columns)))
	}
	b.values = append(b.values, vals)
	return b
}

func (b *InsertBuilder) Returning(cols string) *InsertBuilder {
	b.returning = cols
	return b
}

func (b *InsertBuilder) Build() (sql string, args []any) {
	if len(b.values) == 0 {
		panic("qb.Insert: no values provided")
	}

	args = make([]any, 0, len(b.values)*len(b.columns))
	valueGroups := make([]string, 0, len(b.values))
	argNum := 1
	colCount := len(b.columns)

	for _, row := range b.values {
		placeholders := make([]string, colCount)
		for i := 0; i < colCount; i++ {
			placeholders[i] = fmt.Sprintf("$%d", argNum)
			args = append(args, row[i])
			argNum++
		}
		valueGroups = append(valueGroups, "("+strings.Join(placeholders, ", ")+")")
	}

	sql = fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES %s",
		b.table,
		strings.Join(b.columns, ", "),
		strings.Join(valueGroups, ", "),
	)

	if b.returning != "" {
		sql += " RETURNING " + b.returning
	}

	return sql, args
}
