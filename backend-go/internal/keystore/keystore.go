package keystore

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Tx represents a database transaction. *sql.Tx satisfies this interface.
// Consumers can use lock.Tx() with DAL operations that accept this interface.
type Tx interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	Commit() error
	Rollback() error
}

// TxStarter can begin new database transactions. *sql.DB satisfies this interface.
type TxStarter interface {
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

// Lock represents an acquired PostgreSQL advisory lock tied to a transaction.
type Lock struct {
	tx      Tx
	ownedTx bool // true if we created the tx; false if caller provided it
}

// Tx returns the underlying transaction so it can be used with DAL operations.
func (l *Lock) Tx() Tx {
	return l.tx
}

// Release commits the transaction and frees the advisory lock.
// If the transaction was provided by the caller, Release is a no-op —
// the caller is responsible for committing/rolling back their own transaction.
func (l *Lock) Release() error {
	if !l.ownedTx {
		return nil
	}
	return l.tx.Commit()
}

// Rollback rolls back the transaction and frees the advisory lock.
// If the transaction was provided by the caller, Rollback is a no-op.
func (l *Lock) Rollback() error {
	if !l.ownedTx {
		return nil
	}
	return l.tx.Rollback()
}

// KeyStore provides key-value operations backed by Redis and
// PostgreSQL advisory locks.
type KeyStore interface {
	SetItem(ctx context.Context, key string, value string) error
	GetItem(ctx context.Context, key string) (string, error)
	SetExpiry(ctx context.Context, key string, expiry time.Duration) (bool, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	SetItemWithExpiryNX(ctx context.Context, key string, expiry time.Duration, value string) (bool, error)
	DeleteItem(ctx context.Context, key string) (int64, error)
	DeleteItems(ctx context.Context, keys []string) (int64, error)
	IncrementBy(ctx context.Context, key string, value int64) (int64, error)

	// AcquirePgLock acquires a PostgreSQL transaction-level advisory lock (pg_advisory_xact_lock).
	// If tx is nil, a new transaction is created and owned by the Lock (Release commits it).
	// If tx is provided, the lock is acquired within that transaction and Release is a no-op —
	// the caller manages the transaction lifecycle.
	AcquirePgLock(ctx context.Context, lockID string, tx Tx) (*Lock, error)
}

type redisKeyStore struct {
	client redis.UniversalClient
	db     TxStarter
}

func NewKeyStore(client redis.UniversalClient, db TxStarter) KeyStore {
	return &redisKeyStore{client: client, db: db}
}

func (k *redisKeyStore) SetItem(ctx context.Context, key string, value string) error {
	return k.client.Set(ctx, key, value, 0).Err()
}

func (k *redisKeyStore) GetItem(ctx context.Context, key string) (string, error) {
	val, err := k.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

func (k *redisKeyStore) SetExpiry(ctx context.Context, key string, expiry time.Duration) (bool, error) {
	return k.client.Expire(ctx, key, expiry).Result()
}

func (k *redisKeyStore) SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error {
	return k.client.Set(ctx, key, value, expiry).Err()
}

func (k *redisKeyStore) SetItemWithExpiryNX(ctx context.Context, key string, expiry time.Duration, value string) (bool, error) {
	return k.client.SetNX(ctx, key, value, expiry).Result()
}

func (k *redisKeyStore) DeleteItem(ctx context.Context, key string) (int64, error) {
	return k.client.Del(ctx, key).Result()
}

func (k *redisKeyStore) DeleteItems(ctx context.Context, keys []string) (int64, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	return k.client.Del(ctx, keys...).Result()
}

func (k *redisKeyStore) IncrementBy(ctx context.Context, key string, value int64) (int64, error) {
	return k.client.IncrBy(ctx, key, value).Result()
}

func (k *redisKeyStore) AcquirePgLock(ctx context.Context, stringLockId string, tx Tx) (*Lock, error) {
	ownedTx := false

	lockID := stringToLockID(stringLockId)
	if tx == nil {
		sqlTx, err := k.db.BeginTx(ctx, nil)
		if err != nil {
			return nil, fmt.Errorf("beginning transaction for advisory lock: %w", err)
		}
		tx = sqlTx
		ownedTx = true
	}

	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", lockID); err != nil {
		if ownedTx {
			tx.Rollback()
		}
		return nil, fmt.Errorf("acquiring advisory lock %d: %w", lockID, err)
	}

	return &Lock{tx: tx, ownedTx: ownedTx}, nil
}
