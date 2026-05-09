package keystore

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// KeyStore provides key-value operations backed by Redis.
type KeyStore interface {
	SetItem(ctx context.Context, key string, value string) error
	GetItem(ctx context.Context, key string) (string, error)
	SetExpiry(ctx context.Context, key string, expiry time.Duration) (bool, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	SetItemWithExpiryNX(ctx context.Context, key string, expiry time.Duration, value string) (bool, error)
	DeleteItem(ctx context.Context, key string) (int64, error)
	DeleteItems(ctx context.Context, keys []string) (int64, error)
	IncrementBy(ctx context.Context, key string, value int64) (int64, error)

	// StreamAdd adds an entry to a Redis stream (XADD).
	// Pass "*" as id to auto-generate the entry ID.
	StreamAdd(ctx context.Context, stream string, id string, values map[string]string) (string, error)
}

type redisKeyStore struct {
	client redis.UniversalClient
}

func NewKeyStore(client redis.UniversalClient) KeyStore {
	return &redisKeyStore{client: client}
}

func (k *redisKeyStore) SetItem(ctx context.Context, key, value string) error {
	return k.client.Set(ctx, key, value, 0).Err()
}

func (k *redisKeyStore) GetItem(ctx context.Context, key string) (string, error) {
	val, err := k.client.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
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

func (k *redisKeyStore) StreamAdd(ctx context.Context, stream, id string, values map[string]string) (string, error) {
	return k.client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		ID:     id,
		Values: values,
	}).Result()
}
