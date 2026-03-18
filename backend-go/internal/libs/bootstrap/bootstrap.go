package bootstrap

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/database/pg"
)

// ConnectionStatus holds the result of a single connection check.
type ConnectionStatus struct {
	Name string
	Ok   bool
	Err  error
}

// DBReport holds the results of checking all database connections.
type DBReport struct {
	Primary  ConnectionStatus
	Replicas []ConnectionStatus
}

// PrintReport logs the full connection report — successful and failed connections.
func (r *DBReport) PrintReport(logger *slog.Logger) {
	if r.Primary.Ok {
		logger.Info("Database connection established", "name", r.Primary.Name)
	} else {
		logger.Error("Database connection failed", "name", r.Primary.Name, "error", r.Primary.Err)
	}

	for _, rep := range r.Replicas {
		if rep.Ok {
			logger.Info("Database connection established", "name", rep.Name)
		} else {
			logger.Error("Database connection failed", "name", rep.Name, "error", rep.Err)
		}
	}
}

// CheckDBConnection pings the primary database and all read replicas,
// returning a report with the status of each.
func CheckDBConnection(ctx context.Context, db *pg.DB) *DBReport {
	report := &DBReport{}

	if err := db.Primary().PingContext(ctx); err != nil {
		report.Primary = ConnectionStatus{Name: "primary", Ok: false, Err: fmt.Errorf("primary database: %w", err)}
	} else {
		report.Primary = ConnectionStatus{Name: "primary", Ok: true}
	}

	for i := range db.ReplicaCount() {
		name := fmt.Sprintf("read-replica-%d", i)
		// Ping via a random replica — if any fail the report captures it.
		if err := db.Replica().PingContext(ctx); err != nil {
			report.Replicas = append(report.Replicas, ConnectionStatus{Name: name, Ok: false, Err: fmt.Errorf("%s: %w", name, err)})
		} else {
			report.Replicas = append(report.Replicas, ConnectionStatus{Name: name, Ok: true})
		}
	}

	return report
}
