package keystore

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/infisical/api/internal/database/pg"
)

// KeyStore provides key-value operations backed by Redis and PostgreSQL.
type KeyStore interface {
	// Redis operations
	SetItem(ctx context.Context, key string, value string) error
	GetItem(ctx context.Context, key string) (string, error)
	SetExpiry(ctx context.Context, key string, expiry time.Duration) (bool, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	SetItemWithExpiryNX(ctx context.Context, key string, expiry time.Duration, value string) (bool, error)
	DeleteItem(ctx context.Context, key string) (int64, error)
	DeleteItems(ctx context.Context, keys []string) (int64, error)
	IncrementBy(ctx context.Context, key string, value int64) (int64, error)

	// IncrementByWithExpiry atomically increments a key and sets its expiry.
	// If the key doesn't exist, it's created with value 0 before incrementing.
	IncrementByWithExpiry(ctx context.Context, key string, value int64, expiry time.Duration) (int64, error)

	// HashGet returns the value of a field in a hash (HGET).
	// Returns empty string if key or field doesn't exist.
	HashGet(ctx context.Context, key, field string) (string, error)

	// HashSet sets a field in a hash (HSET).
	HashSet(ctx context.Context, key, field, value string) error

	// StreamAdd adds an entry to a Redis stream (XADD).
	// Pass "*" as id to auto-generate the entry ID.
	StreamAdd(ctx context.Context, stream string, id string, values map[string]string) (string, error)

	// PostgreSQL key_value_store operations

	// PgGetIntItem returns the integer value for a key from the PostgreSQL key_value_store table.
	// Returns 0 if key doesn't exist or is expired.
	PgGetIntItem(ctx context.Context, key string) (int64, error)
}

type keyStore struct {
	redis redis.UniversalClient
	db    pg.DB
}

func NewKeyStore(redisClient redis.UniversalClient, db pg.DB) KeyStore {
	return &keyStore{redis: redisClient, db: db}
}

func (k *keyStore) SetItem(ctx context.Context, key, value string) error {
	return k.redis.Set(ctx, key, value, 0).Err()
}

func (k *keyStore) GetItem(ctx context.Context, key string) (string, error) {
	val, err := k.redis.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return val, err
}

func (k *keyStore) SetExpiry(ctx context.Context, key string, expiry time.Duration) (bool, error) {
	return k.redis.Expire(ctx, key, expiry).Result()
}

func (k *keyStore) SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error {
	return k.redis.Set(ctx, key, value, expiry).Err()
}

func (k *keyStore) SetItemWithExpiryNX(ctx context.Context, key string, expiry time.Duration, value string) (bool, error) {
	return k.redis.SetNX(ctx, key, value, expiry).Result()
}

func (k *keyStore) DeleteItem(ctx context.Context, key string) (int64, error) {
	return k.redis.Del(ctx, key).Result()
}

func (k *keyStore) DeleteItems(ctx context.Context, keys []string) (int64, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	return k.redis.Del(ctx, keys...).Result()
}

func (k *keyStore) IncrementBy(ctx context.Context, key string, value int64) (int64, error) {
	return k.redis.IncrBy(ctx, key, value).Result()
}

func (k *keyStore) IncrementByWithExpiry(ctx context.Context, key string, value int64, expiry time.Duration) (int64, error) {
	pipe := k.redis.TxPipeline()
	incrCmd := pipe.IncrBy(ctx, key, value)
	pipe.Expire(ctx, key, expiry)
	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}
	return incrCmd.Val(), nil
}

func (k *keyStore) HashGet(ctx context.Context, key, field string) (string, error) {
	val, err := k.redis.HGet(ctx, key, field).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return val, err
}

func (k *keyStore) HashSet(ctx context.Context, key, field, value string) error {
	return k.redis.HSet(ctx, key, field, value).Err()
}

func (k *keyStore) StreamAdd(ctx context.Context, stream, id string, values map[string]string) (string, error) {
	return k.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		ID:     id,
		Values: values,
	}).Result()
}

func (k *keyStore) PgGetIntItem(ctx context.Context, key string) (int64, error) {
	var integerValue *int64
	err := k.db.Replica().QueryRow(ctx, `
		SELECT "integerValue"
		FROM key_value_store
		WHERE key = @key
		AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
	`, pgx.NamedArgs{"key": key}).Scan(&integerValue)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	if integerValue == nil {
		return 0, nil
	}
	return *integerValue, nil
}
