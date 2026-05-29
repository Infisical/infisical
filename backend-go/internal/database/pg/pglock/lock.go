package pglock

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Lock represents an acquired PostgreSQL advisory lock tied to a transaction.
// The lock is automatically released when the transaction commits or rolls back.
type Lock struct {
	tx pgx.Tx
}

// Tx returns the underlying transaction.
func (l *Lock) Tx() pgx.Tx {
	return l.tx
}

// Release commits the transaction and releases the advisory lock.
func (l *Lock) Release(ctx context.Context) error {
	return l.tx.Commit(ctx)
}

// Rollback rolls back the transaction and releases the advisory lock.
func (l *Lock) Rollback(ctx context.Context) error {
	return l.tx.Rollback(ctx)
}

// AcquireBlockingLock acquires a PostgreSQL transaction-level advisory lock (pg_advisory_xact_lock).
// This is a blocking call - it waits until the lock is available.
// The lock is automatically released when the transaction commits or rolls back.
func AcquireBlockingLock(ctx context.Context, tx pgx.Tx, lockID string) (*Lock, error) {
	numericLockID := stringToLockID(lockID)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", numericLockID); err != nil {
		return nil, fmt.Errorf("acquiring advisory lock %d: %w", numericLockID, err)
	}
	return &Lock{tx: tx}, nil
}

func stringToLockID(s string) int64 {
	hash := sha256.Sum256([]byte(s))
	return int64(binary.BigEndian.Uint64(hash[:8]))
}
