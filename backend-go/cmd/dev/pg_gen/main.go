package main

import (
	"database/sql"
	"fmt"
	"os"
	"regexp"

	"github.com/go-jet/jet/v2/generator/metadata"
	"github.com/go-jet/jet/v2/generator/postgres"
	"github.com/go-jet/jet/v2/generator/template"
	pg "github.com/go-jet/jet/v2/postgres"
	_ "github.com/lib/pq"
)

// partitionPattern matches Postgres partition table names like:
//   - certificate_requests_20260311_20260401
//   - scim_events_default
var partitionPattern = regexp.MustCompile(`_\d{8}_\d{8}$|_default$`)

func isPartitionTable(name string) bool {
	return partitionPattern.MatchString(name)
}

func main() {
	dsn := os.Getenv("DB_CONNECTION_URI")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DB_CONNECTION_URI is required")
		os.Exit(1)
	}

	destDir := "./internal/database/pg/gen"

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to connect: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		fmt.Fprintf(os.Stderr, "failed to ping database: %v\n", err)
		os.Exit(1)
	}

	// GenerateDB writes directly to destDir without appending the database name.
	// UsePath("") on the schema removes the "public" subdirectory.
	// Result: files go straight into destDir/table/, destDir/model/, destDir/enum/.
	err = postgres.GenerateDB(db, "public", destDir,
		template.Default(pg.Dialect).
			UseSchema(func(schema metadata.Schema) template.Schema {
				return template.DefaultSchema(schema).
					UsePath("").
					UseModel(template.DefaultModel().
						UseTable(func(table metadata.Table) template.TableModel {
							m := template.DefaultTableModel(table)
							if isPartitionTable(table.Name) {
								m.Skip = true
							}
							return m
						}),
					).
					UseSQLBuilder(template.DefaultSQLBuilder().
						UseTable(func(table metadata.Table) template.TableSQLBuilder {
							tb := template.DefaultTableSQLBuilder(table)
							if isPartitionTable(table.Name) {
								tb.Skip = true
							}
							return tb
						}),
					)
			}),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "generation failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Generation complete:", destDir)
}
